import {
  CHUNITHM_TEMP_ACCOUNT_ID,
  LOCAL_MAIMAI_ACCOUNT_ID,
  MAIMAI_TEST_ACCOUNT_ID,
} from '@/domain/bound-account';
import type { StoredProviderAccountInput } from '@/storage/secure-session-store';
import { utf8ByteLength } from '@/storage/large-secure-value-store';

const secure = vi.hoisted(() => ({ values: new Map<string, string>() }));
const sqlite = vi.hoisted(() => ({ values: new Map<string, string>() }));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secure.values.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { secure.values.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { secure.values.delete(key); }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

// The store must be imported after the in-memory SecureStore mock.
// eslint-disable-next-line import/first
import { SecureSessionStore } from '@/storage/secure-session-store';

const kvStore = {
  getItem: async (key: string) => sqlite.values.get(key) ?? null,
  setItem: async (key: string, value: string) => { sqlite.values.set(key, value); },
  removeItem: async (key: string) => { sqlite.values.delete(key); },
};

function createStore(): SecureSessionStore {
  return new SecureSessionStore(kvStore);
}

function account(id: string): StoredProviderAccountInput {
  return {
    id,
    gameId: 'maimai',
    providerId: 'diving-fish',
    displayName: id,
    scoreDisplay: '10000',
    session: { mode: 'import-token', value: `token-${id}`, persistable: true },
  };
}

describe('SecureSessionStore 内置账号兼容', () => {
  beforeEach(() => {
    secure.values.clear();
    sqlite.values.clear();
    vi.clearAllMocks();
  });

  it('允许内置账号作为上次活跃账号且不写入远程账号数组', async () => {
    const store = createStore();
    await store.upsertAccount(account('maimai:diving-fish:a'));
    await store.setActiveAccountId(MAIMAI_TEST_ACCOUNT_ID);
    const vault = await store.loadVault();
    expect(vault.activeAccountId).toBe(MAIMAI_TEST_ACCOUNT_ID);
    expect(vault.accounts.map((item) => item.id)).toEqual(['maimai:diving-fish:a']);
  });

  it('允许额外本地玩家作为上次活跃账号', async () => {
    const store = createStore();
    await store.setActiveAccountId('maimai:local:second');
    const vault = await store.loadVault();
    expect(vault.activeAccountId).toBe('maimai:local:second');
    expect(vault.accounts).toEqual([]);
  });

  it('允许中二临时账号作为上次活跃账号', async () => {
    const store = createStore();
    await store.setActiveAccountId(CHUNITHM_TEMP_ACCOUNT_ID);
    const vault = await store.loadVault();
    expect(vault.activeAccountId).toBe(CHUNITHM_TEMP_ACCOUNT_ID);
    expect(vault.accounts).toEqual([]);
  });

  it('远程账号删除仍保留其他远程账号和内置活跃状态', async () => {
    const store = createStore();
    await store.upsertAccount(account('maimai:diving-fish:a'));
    await store.upsertAccount(account('maimai:diving-fish:b'));
    await store.setActiveAccountId(LOCAL_MAIMAI_ACCOUNT_ID);
    await store.removeAccount('maimai:diving-fish:b');
    const vault = await store.loadVault();
    expect(vault.activeAccountId).toBe(LOCAL_MAIMAI_ACCOUNT_ID);
    expect(vault.accounts.map((item) => item.id)).toEqual(['maimai:diving-fish:a']);
  });

  it('在 v3 记录中持久化可选课题模式元数据且不改变当前账号', async () => {
    const store = createStore();
    const stored = account('maimai:diving-fish:a');
    await store.upsertAccount(stored);
    await store.updateAccountMetadata(stored.id, {
      displayName: 'Phigros 玩家',
      scoreDisplay: '15.4321',
      challengeModeRank: 523,
    });
    const vault = await store.loadVault();
    expect(vault.activeAccountId).toBe(stored.id);
    expect(vault.accounts[0]).toMatchObject({
      displayName: 'Phigros 玩家', scoreDisplay: '15.4321', challengeModeRank: 523,
    });
  });

  it('迁移 v2 账号时为每个旧账号建立独立凭据', async () => {
    secure.values.set('rranker.provider.sessions.v2', JSON.stringify({
      version: 2,
      activeAccountId: 'maimai:diving-fish:a',
      accounts: [account('maimai:diving-fish:a')],
    }));
    const vault = await createStore().loadVault();
    expect(vault.version).toBe(3);
    expect(vault.accounts[0].credentialId).toBe('credential:maimai:diving-fish:a');
    expect(vault.credentials).toHaveLength(1);
    expect(secure.values.has('rranker.provider.sessions.v2')).toBe(false);
  });

  it('双游戏账号共享一份 LXNS 凭据并在最后解绑时清除', async () => {
    const store = createStore();
    const session = {
      mode: 'lxns-oauth',
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      expiresAt: Date.now() + 60_000,
      persistable: true,
    } as const;
    await store.upsertAccount({
      id: 'maimai:lxns:1',
      gameId: 'maimai',
      providerId: 'lxns',
      credentialId: 'lxns:shared',
      displayName: '舞萌玩家',
      scoreDisplay: '15000',
      session,
    });
    await store.upsertAccount({
      id: 'chunithm:lxns:2',
      gameId: 'chunithm',
      providerId: 'lxns',
      credentialId: 'lxns:shared',
      displayName: '中二玩家',
      scoreDisplay: '17.25',
      session,
    });
    expect((await store.loadVault()).credentials).toHaveLength(1);

    const rotated = { ...session, accessToken: 'access-b', refreshToken: 'refresh-b' };
    await store.updateAccountSession('chunithm:lxns:2', rotated);
    expect((await store.loadVault()).credentials[0].session).toEqual(rotated);

    await store.removeAccount('maimai:lxns:1');
    expect((await store.loadVault()).credentials).toHaveLength(1);
    await store.removeAccount('chunithm:lxns:2');
    expect((await store.loadVault()).credentials).toEqual([]);
  });

  it('迁移 v3 聚合凭据库并只写入小于 2048 字节的安全分片', async () => {
    const longSession = {
      mode: 'lxns-oauth',
      accessToken: 'a'.repeat(3500),
      refreshToken: `刷新😀${'r'.repeat(3600)}`,
      expiresAt: Date.now() + 60_000,
      persistable: true,
    } as const;
    secure.values.set('rranker.provider.sessions.v3', JSON.stringify({
      version: 3,
      activeAccountId: 'maimai:lxns:long',
      credentials: [{ id: 'lxns:long', providerId: 'lxns', session: longSession }],
      accounts: [{
        id: 'maimai:lxns:long',
        gameId: 'maimai',
        providerId: 'lxns',
        credentialId: 'lxns:long',
        displayName: '长令牌玩家',
        scoreDisplay: '15000',
      }],
    }));

    const vault = await createStore().loadVault();

    expect(vault.credentials[0]?.session).toEqual(longSession);
    expect(sqlite.values.has('rranker.provider.sessions.index.v4')).toBe(true);
    expect(secure.values.has('rranker.provider.sessions.v3')).toBe(false);
    const secureWrites = vi.mocked((await import('expo-secure-store')).setItemAsync).mock.calls;
    expect(secureWrites.length).toBeGreaterThan(1);
    expect(secureWrites.every(([, value]) => utf8ByteLength(value) < 2048)).toBe(true);
  });

  it('v4 索引写入失败时保留旧 v3 凭据库', async () => {
    const legacyVault = {
      version: 3 as const,
      activeAccountId: 'maimai:diving-fish:a',
      credentials: [{
        id: 'credential:maimai:diving-fish:a',
        providerId: 'diving-fish' as const,
        session: account('maimai:diving-fish:a').session,
      }],
      accounts: [{
        id: 'maimai:diving-fish:a',
        gameId: 'maimai' as const,
        providerId: 'diving-fish' as const,
        credentialId: 'credential:maimai:diving-fish:a',
        displayName: '玩家 A',
        scoreDisplay: '10000',
      }],
    };
    secure.values.set('rranker.provider.sessions.v3', JSON.stringify(legacyVault));
    const failingKv = {
      ...kvStore,
      setItem: vi.fn(async () => { throw new Error('sqlite unavailable'); }),
    };

    const restored = await new SecureSessionStore(failingKv).loadVault();

    expect(restored).toEqual(legacyVault);
    expect(secure.values.has('rranker.provider.sessions.v3')).toBe(true);
    expect([...secure.values.keys()].some((key) => key.startsWith('rranker.secure.provider-session.'))).toBe(false);
  });

  it('单份凭据分片损坏时只淘汰引用它的账号', async () => {
    const store = createStore();
    await store.upsertAccount(account('maimai:diving-fish:a'));
    await store.upsertAccount(account('maimai:diving-fish:b'));
    const index = JSON.parse(sqlite.values.get('rranker.provider.sessions.index.v4')!) as {
      credentials: { id: string; secretRef: string }[];
    };
    const broken = index.credentials.find((item) => item.id.endsWith(':a'))!;
    const manifest = JSON.parse(secure.values.get(`${broken.secretRef}.manifest`)!) as {
      generation: string;
    };
    secure.values.delete(`${broken.secretRef}.chunk.${manifest.generation}.0`);

    const vault = await store.loadVault();

    expect(vault.accounts.map((item) => item.id)).toEqual(['maimai:diving-fish:b']);
    expect(vault.credentials.map((item) => item.id)).toEqual(['credential:maimai:diving-fish:b']);
  });

  it('清空时删除 v4 索引、凭据分片和所有旧键', async () => {
    const store = createStore();
    await store.upsertAccount(account('maimai:diving-fish:a'));
    secure.values.set('rranker.provider.sessions.v3', '{}');
    secure.values.set('rranker.provider.sessions.v2', '{}');
    secure.values.set('rranker.diving-fish.session.v1', '{}');

    await store.clear();

    expect(sqlite.values.has('rranker.provider.sessions.index.v4')).toBe(false);
    expect([...secure.values.keys()].some((key) => key.startsWith('rranker.secure.provider-session.'))).toBe(false);
    expect(secure.values.has('rranker.provider.sessions.v3')).toBe(false);
    expect(secure.values.has('rranker.provider.sessions.v2')).toBe(false);
    expect(secure.values.has('rranker.diving-fish.session.v1')).toBe(false);
  });
});
