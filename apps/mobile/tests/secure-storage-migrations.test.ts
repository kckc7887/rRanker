import { LargeSecureValueStore, utf8ByteLength } from '@/storage/large-secure-value-store';

const secure = vi.hoisted(() => ({ values: new Map<string, string>() }));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secure.values.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { secure.values.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { secure.values.delete(key); }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import { ScoreHubAccountStore } from '@/storage/score-hub-account-store';
// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
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
    vi.restoreAllMocks();
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

  it.each(['null', 'throw'] as const)('ScoreHub 凭据读取 %s 时完整目录失败且原地重试保留账号', async failure => {
    const kv = createKvStore(), secrets = new LargeSecureValueStore(), store = new ScoreHubAccountStore(kv, secrets);
    await store.save({ friendCode: 'A', token: 'a', hasCabinetBound: true });
    await store.save({ friendCode: 'B', token: 'b', hasCabinetBound: true });
    const before = kv.values.get('rranker.scorehub.accounts.v3');
    const secretKeys = [...secure.values.keys()];
    const read = vi.spyOn(secrets, 'read');
    if (failure === 'null') read.mockResolvedValueOnce(null);
    else read.mockRejectedValueOnce(new Error('temporary secret read failure'));
    await expect(store.select('A')).rejects.toMatchObject({ code: 'credential_storage' });
    expect(kv.values.get('rranker.scorehub.accounts.v3')).toBe(before);
    expect([...secure.values.keys()]).toEqual(secretKeys);
    await expect(store.select('A')).resolves.toMatchObject({ friendCode: 'A', token: 'a' });
    expect(Object.keys((await store.loadAll()).accounts)).toEqual(['A', 'B']);
  });

  it.each(['load', 'loadAll', 'listWithToken', 'getByFriendCode', 'upsert', 'patch', 'remove', 'save', 'clear'] as const)(
    'ScoreHub %s 不接受缺失凭据的部分目录', async operation => {
      const kv = createKvStore(), secrets = new LargeSecureValueStore(), store = new ScoreHubAccountStore(kv, secrets);
      await store.save({ friendCode: 'A', token: 'a', hasCabinetBound: true });
      const before = kv.values.get('rranker.scorehub.accounts.v3');
      vi.spyOn(secrets, 'read').mockResolvedValueOnce(null);
      const call = operation === 'getByFriendCode' ? store.getByFriendCode('A')
        : operation === 'upsert' ? store.upsert({ friendCode: 'B', token: 'b' })
          : operation === 'save' ? store.save({ friendCode: 'B', token: 'b', hasCabinetBound: false })
            : operation === 'patch' ? store.patch({ hasCabinetBound: false })
              : operation === 'remove' ? store.remove('A') : store[operation]();
      await expect(call).rejects.toMatchObject({ code: 'credential_storage' });
      expect(kv.values.get('rranker.scorehub.accounts.v3')).toBe(before);
      await expect(store.load()).resolves.toMatchObject({ friendCode: 'A', token: 'a' });
    },
  );

  it.each(['{', JSON.stringify({ version: 4, accounts: {} }), JSON.stringify({ version: 3, accounts: { A: {} } })])(
    'ScoreHub 保留无法识别的已有索引 %s', async raw => {
      const kv = createKvStore();
      kv.values.set('rranker.scorehub.accounts.v3', raw);
      const store = new ScoreHubAccountStore(kv);
      await expect(store.loadAll()).rejects.toMatchObject({ code: 'local_commit' });
      await expect(store.save({ friendCode: 'A', token: 'a', hasCabinetBound: false })).rejects.toMatchObject({ code: 'local_commit' });
      expect(kv.values.get('rranker.scorehub.accounts.v3')).toBe(raw);
      expect(kv.setItem).not.toHaveBeenCalled();
      expect(kv.removeItem).not.toHaveBeenCalled();
    },
  );

  it('ScoreHub 跨实例并发保存保留全部账号且最后一次成功选择成为活动账号', async () => {
    const kv = createKvStore(), first = new ScoreHubAccountStore(kv), second = new ScoreHubAccountStore(kv);
    await first.save({ friendCode: 'A', token: 'a', hasCabinetBound: false });
    await Promise.all([first.save({ friendCode: 'B', token: 'b', hasCabinetBound: false }), second.save({ friendCode: 'C', token: 'c', hasCabinetBound: true })]);
    const restored = await new ScoreHubAccountStore(kv).loadAll();
    expect(Object.keys(restored.accounts)).toEqual(['A', 'B', 'C']);
    expect(restored.activeFriendCode).toBe('C');
  });

  it('ScoreHub 并发保存、删除和 patch 按最新活动账号顺序执行', async () => {
    const kv = createKvStore(), first = new ScoreHubAccountStore(kv), second = new ScoreHubAccountStore(kv);
    await first.save({ friendCode: 'A', token: 'a', hasCabinetBound: false });
    await Promise.all([first.save({ friendCode: 'B', token: 'b', hasCabinetBound: false }), second.remove('A'), first.patch({ hasCabinetBound: true })]);
    expect(await first.loadAll()).toMatchObject({ activeFriendCode: 'B', accounts: { B: { token: 'b', hasCabinetBound: true } } });
    expect(Object.keys((await first.loadAll()).accounts)).toEqual(['B']);
  });

  it('ScoreHub 清除与保存串行且不会让旧来源重新迁移', async () => {
    const kv = createKvStore(), first = new ScoreHubAccountStore(kv), second = new ScoreHubAccountStore(kv);
    await first.save({ friendCode: 'A', token: 'a', hasCabinetBound: true });
    await Promise.all([first.save({ friendCode: 'B', token: 'b', hasCabinetBound: false }), second.clear()]);
    expect(await first.loadAll()).toEqual({ activeFriendCode: '', accounts: {} });
    await Promise.all([first.clear(), second.save({ friendCode: 'C', token: 'c', hasCabinetBound: false })]);
    expect(Object.keys((await first.loadAll()).accounts)).toEqual(['C']);
  });

  it('ScoreHub 一次提交失败不阻塞后续排队的保存', async () => {
    const kv = createKvStore(), first = new ScoreHubAccountStore(kv), second = new ScoreHubAccountStore(kv);
    kv.setItem.mockRejectedValueOnce(new Error('index unavailable'));
    const failed = first.save({ friendCode: 'A', token: 'a', hasCabinetBound: false });
    const next = second.save({ friendCode: 'B', token: 'b', hasCabinetBound: true });
    await expect(failed).rejects.toMatchObject({ code: 'local_commit' });
    await next;
    expect(Object.keys((await first.loadAll()).accounts)).toEqual(['B']);
  });

  it('ScoreHub 迁移与另一实例保存不会相互覆盖', async () => {
    const kv = createKvStore(), first = new ScoreHubAccountStore(kv), second = new ScoreHubAccountStore(kv);
    secure.values.set('rranker.scorehub.account.v1', JSON.stringify({ friendCode: 'A', token: 'a', hasCabinetBound: true }));
    await Promise.all([first.loadAll(), second.save({ friendCode: 'B', token: 'b', hasCabinetBound: false })]);
    expect(Object.keys((await first.loadAll()).accounts)).toEqual(['A', 'B']);
    expect(secure.values.has('rranker.scorehub.account.v1')).toBe(false);
  });

  it('ScoreHub 索引实际提交后报错时不删除已被引用的新凭据', async () => {
    const kv = createKvStore(), store = new ScoreHubAccountStore(kv);
    await store.save({ friendCode: 'A', token: 'a', hasCabinetBound: true });
    kv.setItem.mockImplementationOnce(async (key, value) => { kv.values.set(key, value); throw new Error('write completed but rejected'); });
    await expect(store.save({ friendCode: 'B', token: 'b', hasCabinetBound: false })).rejects.toMatchObject({ code: 'local_commit' });
    await expect(store.getByFriendCode('B')).resolves.toMatchObject({ token: 'b' });
    await expect(store.getByFriendCode('A')).resolves.toMatchObject({ token: 'a' });
  });

  it('ScoreHub 提交报错且读回不可用时保留可能被引用的凭据', async () => {
    const kv = createKvStore(), store = new ScoreHubAccountStore(kv);
    await store.save({ friendCode: 'A', token: 'a', hasCabinetBound: true });
    kv.setItem.mockImplementationOnce(async (key, value) => {
      kv.values.set(key, value);
      kv.getItem.mockRejectedValueOnce(new Error('readback unavailable'));
      throw new Error('write completion uncertain');
    });
    await expect(store.save({ friendCode: 'B', token: 'b', hasCabinetBound: false })).rejects.toMatchObject({ code: 'local_commit' });
    await expect(store.getByFriendCode('B')).resolves.toMatchObject({ token: 'b' });
    await expect(store.getByFriendCode('A')).resolves.toMatchObject({ token: 'a' });
  });

  it('ScoreHub 新凭据写后验证失败不提交索引且下次保存仍可继续', async () => {
    const kv = createKvStore(), secrets = new LargeSecureValueStore(), store = new ScoreHubAccountStore(kv, secrets);
    vi.spyOn(secrets, 'read').mockResolvedValueOnce(null);
    await expect(store.save({ friendCode: 'A', token: 'a', hasCabinetBound: false })).rejects.toMatchObject({ code: 'credential_storage' });
    expect(kv.values.has('rranker.scorehub.accounts.v3')).toBe(false);
    expect(secure.values.size).toBe(0);
    await store.save({ friendCode: 'A', token: 'a', hasCabinetBound: false });
    await expect(store.load()).resolves.toMatchObject({ friendCode: 'A', token: 'a' });
  });

  it('ScoreHub 清除索引失败不会提前删除原凭据并可重试', async () => {
    const kv = createKvStore(), store = new ScoreHubAccountStore(kv);
    await store.save({ friendCode: 'A', token: 'a', hasCabinetBound: true });
    const index = kv.values.get('rranker.scorehub.accounts.v3'), keys = [...secure.values.keys()];
    kv.setItem.mockRejectedValueOnce(new Error('clear unavailable'));
    await expect(store.clear()).rejects.toMatchObject({ code: 'local_commit' });
    expect(kv.values.get('rranker.scorehub.accounts.v3')).toBe(index);
    expect([...secure.values.keys()]).toEqual(keys);
    await store.clear();
    expect(await store.loadAll()).toEqual({ activeFriendCode: '', accounts: {} });
  });

  it.each([
    ['rranker.scorehub.account.v1', '{}'],
    ['rranker.scorehub.account.v2', '{"activeFriendCode":"A","accounts":{"A":{"friendCode":"A","token":"a"},"B":{}}}'],
  ])('ScoreHub 不从损坏的旧存储 %s 迁移部分目录', async (key, raw) => {
    const kv = createKvStore(), store = new ScoreHubAccountStore(kv);
    secure.values.set(key, raw);
    await expect(store.loadAll()).rejects.toMatchObject({ code: 'local_commit' });
    await expect(store.save({ friendCode: 'C', token: 'c', hasCabinetBound: false })).rejects.toMatchObject({ code: 'local_commit' });
    expect(secure.values.get(key)).toBe(raw);
    expect(kv.setItem).not.toHaveBeenCalled();
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

  it('多个上传偏好实例的并发保存和删除不丢失其它好友码的选择', async () => {
    const kv = createKvStore();
    const first = new UploadPrefsStore(kv), second = new UploadPrefsStore(kv);
    await Promise.all([
      first.save({ friendCode: '10001', selectedAccountIds: ['a'] }),
      second.save({ friendCode: '10002', selectedAccountIds: ['b'] }),
    ]);
    expect((await first.load()).selectionsByFriendCode).toEqual({ 10001: ['a'], 10002: ['b'] });
    await Promise.all([
      first.save({ friendCode: '10001', selectedAccountIds: ['a2'] }),
      second.removeSelection('10002'),
    ]);
    expect((await second.load()).selectionsByFriendCode).toEqual({ 10001: ['a2'] });
    await Promise.all([
      first.save({ friendCode: '10003', selectedAccountIds: ['c'] }),
      second.clear(),
    ]);
    expect((await first.load()).selectionsByFriendCode).toEqual({});
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
