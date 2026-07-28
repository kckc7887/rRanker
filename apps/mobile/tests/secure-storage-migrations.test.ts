import { utf8ByteLength } from '@/storage/large-secure-value-store';

const secure = vi.hoisted(() => ({ values: new Map<string, string>() }));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secure.values.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { secure.values.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { secure.values.delete(key); }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

// eslint-disable-next-line import/first
import { ScoreHubAccountStore } from '@/storage/score-hub-account-store';
// eslint-disable-next-line import/first
import { UploadPrefsStore } from '@/storage/upload-prefs-store';

function createKvStore() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { values.delete(key); }),
  };
}

describe('SecureStore 聚合数据迁移', () => {
  beforeEach(() => {
    secure.values.clear();
    vi.clearAllMocks();
  });

  it('将多条长 ScoreHub JWT 迁移为 SQLite 索引和独立安全分片', async () => {
    const kv = createKvStore();
    const tokenA = `header.${'a'.repeat(4200)}.signature`;
    const tokenB = `头😀.${'b'.repeat(4300)}.签名`;
    secure.values.set('rranker.scorehub.account.v2', JSON.stringify({
      activeFriendCode: '10001',
      accounts: {
        10001: {
          friendCode: '10001',
          token: tokenA,
          hasCabinetBound: true,
          updatedAt: 200,
        },
        10002: {
          friendCode: '10002',
          token: tokenB,
          hasCabinetBound: false,
          updatedAt: 100,
        },
      },
    }));
    const store = new ScoreHubAccountStore(kv);

    const state = await store.loadAll();

    expect(state.accounts['10001']?.token).toBe(tokenA);
    expect(state.accounts['10002']?.token).toBe(tokenB);
    expect(kv.values.has('rranker.scorehub.accounts.v3')).toBe(true);
    expect(secure.values.has('rranker.scorehub.account.v2')).toBe(false);
    const secureStore = await import('expo-secure-store');
    expect(vi.mocked(secureStore.setItemAsync).mock.calls.length).toBeGreaterThan(4);
    expect(vi.mocked(secureStore.setItemAsync).mock.calls.every(
      ([, value]) => utf8ByteLength(value) < 2048,
    )).toBe(true);
  });

  it('ScoreHub 更新和删除只替换目标账号的安全引用', async () => {
    const kv = createKvStore();
    const store = new ScoreHubAccountStore(kv);
    await store.upsert({ friendCode: '10001', token: 'token-a', hasCabinetBound: true });
    await store.upsert({ friendCode: '10002', token: 'token-b', hasCabinetBound: false });
    const before = JSON.parse(kv.values.get('rranker.scorehub.accounts.v3')!) as {
      accounts: Record<string, { tokenRef: string }>;
    };

    await store.upsert({ friendCode: '10001', token: 'token-a-next' });
    const afterUpdate = JSON.parse(kv.values.get('rranker.scorehub.accounts.v3')!) as {
      accounts: Record<string, { tokenRef: string }>;
    };
    expect(afterUpdate.accounts['10001']?.tokenRef).not.toBe(before.accounts['10001']?.tokenRef);
    expect(afterUpdate.accounts['10002']?.tokenRef).toBe(before.accounts['10002']?.tokenRef);
    expect(await store.getByFriendCode('10001')).toMatchObject({ token: 'token-a-next' });

    const removedRef = afterUpdate.accounts['10001']!.tokenRef;
    await store.remove('10001');
    expect(await store.getByFriendCode('10001')).toBeNull();
    expect([...secure.values.keys()].some((key) => key.startsWith(removedRef))).toBe(false);
  });

  it('ScoreHub 索引迁移失败时保留旧 JWT 数据', async () => {
    const kv = createKvStore();
    kv.setItem.mockRejectedValueOnce(new Error('sqlite unavailable'));
    secure.values.set('rranker.scorehub.account.v1', JSON.stringify({
      friendCode: '10001',
      token: 'legacy-token',
      hasCabinetBound: true,
    }));
    const store = new ScoreHubAccountStore(kv);

    expect(await store.load()).toEqual({
      friendCode: '10001',
      token: 'legacy-token',
      hasCabinetBound: true,
    });
    expect(secure.values.has('rranker.scorehub.account.v1')).toBe(true);
    expect([...secure.values.keys()].some((key) => key.startsWith('rranker.secure.scorehub-token.'))).toBe(false);
  });

  it('上传偏好从 SecureStore 迁入 SQLite 并保持按好友码的选择', async () => {
    const kv = createKvStore();
    secure.values.set('rranker.upload.prefs.v2', JSON.stringify({
      friendCode: '10002',
      selectedAccountIds: ['account-b'],
      selectionsByFriendCode: {
        10001: ['account-a'],
        10002: ['account-b'],
      },
    }));
    const store = new UploadPrefsStore(kv);

    const prefs = await store.load();

    expect(prefs).toEqual({
      friendCode: '10002',
      selectedAccountIds: ['account-b'],
      selectionsByFriendCode: {
        10001: ['account-a'],
        10002: ['account-b'],
      },
    });
    expect(kv.values.has('rranker.upload.prefs.v3')).toBe(true);
    expect(secure.values.has('rranker.upload.prefs.v2')).toBe(false);
    const secureStore = await import('expo-secure-store');
    expect(vi.mocked(secureStore.setItemAsync)).not.toHaveBeenCalled();
  });

  it('迁移写入失败时保留旧上传偏好供下次重试', async () => {
    const kv = createKvStore();
    kv.setItem.mockRejectedValueOnce(new Error('sqlite unavailable'));
    secure.values.set('rranker.upload.prefs.v1', JSON.stringify({
      friendCode: '10001',
      selectedAccountIds: ['account-a'],
    }));
    const store = new UploadPrefsStore(kv);

    expect(await store.load()).toMatchObject({
      friendCode: '10001',
      selectedAccountIds: ['account-a'],
    });
    expect(secure.values.has('rranker.upload.prefs.v1')).toBe(true);
  });
});
