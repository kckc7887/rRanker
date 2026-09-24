import {
  CHUNITHM_TEST_ACCOUNT_ID,
  CHUNITHM_TEMP_ACCOUNT_ID,
  LOCAL_MAIMAI_ACCOUNT_ID,
  MAIMAI_TEST_ACCOUNT_ID,
  MUSEDASH_TEST_ACCOUNT_ID,
  PHIGROS_TEST_ACCOUNT_ID,
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
// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import {
  restorePreservedSessionIndex,
  SecureSessionStore,
  SessionIndexCorruptError,
  SessionIndexUnrecognizedError,
} from '@/storage/secure-session-store';
// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import { hasRizlinePassword, writeRizlinePassword } from '@/storage/rizline-password-store';

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
  it('does not persist identical account metadata across store instances', async () => {
    const writes = vi.fn(kvStore.setItem);
    const storage = { ...kvStore, setItem: writes };
    const first = new SecureSessionStore(storage), second = new SecureSessionStore(storage);
    const stored = account('maimai:diving-fish:dedupe');
    await first.upsertAccount(stored);
    writes.mockClear();
    const metadata = { displayName: '名称', scoreDisplay: '15000', ratingPossession: null };
    await Promise.all([first.updateAccountMetadata(stored.id, metadata), second.updateAccountMetadata(stored.id, metadata)]);
    expect(writes).toHaveBeenCalledTimes(1);
  });
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

  it('允许中二示例账号作为活跃账号且不写入远程凭据', async () => {
    const store = createStore();
    await store.setActiveAccountId(CHUNITHM_TEST_ACCOUNT_ID);
    const vault = await store.loadVault();
    expect(vault.activeAccountId).toBe(CHUNITHM_TEST_ACCOUNT_ID);
    expect(vault.accounts).toEqual([]);
    expect(vault.credentials).toEqual([]);
  });

  it('允许 Phigros 示例账号作为活跃账号且不写入远程凭据', async () => {
    const store = createStore();
    await store.setActiveAccountId(PHIGROS_TEST_ACCOUNT_ID);
    const vault = await store.loadVault();
    expect(vault.activeAccountId).toBe(PHIGROS_TEST_ACCOUNT_ID);
    expect(vault.accounts).toEqual([]);
    expect(vault.credentials).toEqual([]);
  });

  it.each([
    'maimai:local:second',
    MAIMAI_TEST_ACCOUNT_ID,
    CHUNITHM_TEMP_ACCOUNT_ID,
    CHUNITHM_TEST_ACCOUNT_ID,
    PHIGROS_TEST_ACCOUNT_ID,
    MUSEDASH_TEST_ACCOUNT_ID,
    'adofai:tuf:25',
    'musedash:musedash-moe:community-user',
    'phira:community:323528',
  ])('允许任意已绑定账号 %s 作为冷启动活跃指针', async (accountId) => {
    const store = createStore();

    await store.setActiveAccountId(accountId);

    const index = JSON.parse(sqlite.values.get('rranker.provider.sessions.index.v4')!) as {
      activeAccountId: string | null;
      accounts: unknown[];
      credentials: unknown[];
    };
    expect(index.activeAccountId).toBe(accountId);
    expect(index.accounts).toEqual([]);
    expect(index.credentials).toEqual([]);
  });

  it('普通切换只更新 v4 索引，不读取或重写安全凭据', async () => {
    const store = createStore();
    await store.upsertAccount(account('maimai:diving-fish:a'));
    vi.clearAllMocks();

    await store.setActiveAccountId('phira:community:323528');

    const secureStore = await import('expo-secure-store');
    expect(secureStore.getItemAsync).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
    const index = JSON.parse(sqlite.values.get('rranker.provider.sessions.index.v4')!) as {
      activeAccountId: string | null;
    };
    expect(index.activeAccountId).toBe('phira:community:323528');
  });

  it('快速连续 A→B→C 切换时持久化最后一次选择', async () => {
    const store = createStore();

    await Promise.all([
      store.setActiveAccountId('adofai:tuf:25'),
      store.setActiveAccountId('musedash:musedash-moe:community-user'),
      store.setActiveAccountId('phira:community:323528'),
    ]);

    const index = JSON.parse(sqlite.values.get('rranker.provider.sessions.index.v4')!) as {
      activeAccountId: string | null;
    };
    expect(index.activeAccountId).toBe('phira:community:323528');
  });

  it('跨实例串行化元数据、令牌与快速切换，最后一次账号选择获胜', async () => {
    const indexKey = 'rranker.provider.sessions.index.v4';
    let delayNextIndexRead = false;
    const delayedKv = {
      getItem: async (key: string) => {
        const value = sqlite.values.get(key) ?? null;
        if (key === indexKey && delayNextIndexRead) {
          delayNextIndexRead = false;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return value;
      },
      setItem: async (key: string, value: string) => { sqlite.values.set(key, value); },
      removeItem: async (key: string) => { sqlite.values.delete(key); },
    };
    const backgroundStore = new SecureSessionStore(delayedKv);
    const switchStore = new SecureSessionStore(delayedKv);
    const accountA = account('maimai:diving-fish:a');
    const accountB = account('maimai:diving-fish:b');
    await backgroundStore.upsertAccount(accountA);
    await backgroundStore.upsertAccount(accountB);
    await switchStore.setActiveAccountId(accountA.id);

    delayNextIndexRead = true;
    const metadataUpdate = backgroundStore.updateAccountMetadata(accountA.id, {
      displayName: '更新后的玩家 A',
      scoreDisplay: '15000',
    });
    await Promise.resolve();
    const metadataSwitch = switchStore.setActiveAccountId(accountB.id);
    await Promise.all([metadataUpdate, metadataSwitch]);

    await switchStore.setActiveAccountId(accountA.id);
    const rotated = {
      mode: 'import-token' as const,
      value: 'rotated-token-a',
      persistable: true as const,
    };
    delayNextIndexRead = true;
    const tokenUpdate = backgroundStore.updateAccountSession(accountA.id, rotated);
    await Promise.resolve();
    const tokenSwitch = switchStore.setActiveAccountId(accountB.id);
    await Promise.all([tokenUpdate, tokenSwitch]);

    const vault = await switchStore.loadVault();
    expect(vault.activeAccountId).toBe(accountB.id);
    expect(vault.accounts.find((item) => item.id === accountA.id)).toMatchObject({
      displayName: '更新后的玩家 A',
      scoreDisplay: '15000',
    });
    expect(vault.credentials.find((item) => item.id === `credential:${accountA.id}`)?.session)
      .toEqual(rotated);
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

  it('在 v3 记录中持久化可选评分元数据且不改变当前账号', async () => {
    const store = createStore();
    const stored = account('maimai:diving-fish:a');
    await store.upsertAccount(stored);
    await store.updateAccountMetadata(stored.id, {
      displayName: '评分玩家',
      scoreDisplay: '15.4321',
      challengeModeRank: 523,
      ratingPossession: 'gold',
    });
    const vault = await store.loadVault();
    expect(vault.activeAccountId).toBe(stored.id);
    expect(vault.accounts[0]).toMatchObject({
      displayName: '评分玩家', scoreDisplay: '15.4321', challengeModeRank: 523,
      ratingPossession: 'gold',
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


describe('SecureSessionStore corrupted index preservation', () => {
  const INDEX = 'rranker.provider.sessions.index.v4';
  beforeEach(() => {
    secure.values.clear();
    sqlite.values.clear();
    vi.clearAllMocks();
  });

  it('preserves malformed JSON and throws without deleting the original', async () => {
    sqlite.values.set(INDEX, '{broken');
    const store = createStore();
    await expect(store.loadVault()).rejects.toBeInstanceOf(SessionIndexCorruptError);
    expect(sqlite.values.get(INDEX)).toBe('{broken');
    expect(sqlite.values.get(`${INDEX}.corrupt`)).toBe('{broken');
    expect(sqlite.values.has(`${INDEX}.unrecognized`)).toBe(false);
    await expect(store.loadVault()).rejects.toBeInstanceOf(SessionIndexCorruptError);
    expect(sqlite.values.get(INDEX)).toBe('{broken');
  });

  it('preserves unsupported versions separately from malformed JSON', async () => {
    const raw = JSON.stringify({ version: 5, credentials: [], accounts: [] });
    sqlite.values.set(INDEX, raw);
    const failure = createStore().loadVault();
    await expect(failure).rejects.toBeInstanceOf(SessionIndexUnrecognizedError);
    await expect(createStore().loadVault()).rejects.toMatchObject({
      reason: 'unsupported-version',
      preservedRaw: raw,
    });
    expect(sqlite.values.get(INDEX)).toBe(raw);
    expect(sqlite.values.get(`${INDEX}.unrecognized`)).toBe(raw);
    expect(sqlite.values.has(`${INDEX}.corrupt`)).toBe(false);
  });

  it('treats a structurally invalid index as unrecognized rather than empty', async () => {
    const raw = JSON.stringify({ version: 4, credentials: {} });
    sqlite.values.set(INDEX, raw);
    await expect(createStore().loadVault()).rejects.toMatchObject({
      name: 'SessionIndexUnrecognizedError',
      reason: 'invalid-structure',
    });
    expect(sqlite.values.get(INDEX)).toBe(raw);
  });

  it('loads a valid empty v4 index without deleting anything', async () => {
    const removeItem = vi.fn(kvStore.removeItem);
    const store = new SecureSessionStore({ ...kvStore, removeItem });
    sqlite.values.set(INDEX, JSON.stringify({ version: 4, activeAccountId: null, credentials: [], accounts: [] }));
    const vault = await store.loadVault();
    expect(vault.accounts).toEqual([]);
    expect(removeItem).not.toHaveBeenCalled();
    expect(sqlite.values.get(INDEX)).toContain('"version":4');
  });

  it('propagates storage read failures without deleting or preserving', async () => {
    sqlite.values.set(INDEX, '{broken');
    const failing = { ...kvStore, getItem: vi.fn(async () => { throw new Error('kv unavailable'); }) };
    await expect(new SecureSessionStore(failing).loadVault()).rejects.toThrow('kv unavailable');
    expect(sqlite.values.get(INDEX)).toBe('{broken');
    expect(sqlite.values.has(`${INDEX}.corrupt`)).toBe(false);
  });

  it('refuses to overwrite an unparseable index on later writes', async () => {
    sqlite.values.set(INDEX, '{broken');
    const store = createStore();
    await expect(store.upsertAccount(account('maimai:diving-fish:new'))).rejects.toBeInstanceOf(SessionIndexCorruptError);
    expect(sqlite.values.get(INDEX)).toBe('{broken');
    await expect(store.setActiveAccountId('maimai:local:x')).rejects.toBeInstanceOf(SessionIndexCorruptError);
    expect(sqlite.values.get(INDEX)).toBe('{broken');
  });

  it('skips corrupt legacy vaults without deleting them', async () => {
    secure.values.set('rranker.provider.sessions.v3', '{broken');
    secure.values.set('rranker.provider.sessions.v2', '{broken');
    secure.values.set('rranker.diving-fish.session.v1', '{broken');
    const vault = await createStore().loadVault();
    expect(vault.accounts).toEqual([]);
    expect(secure.values.get('rranker.provider.sessions.v3')).toBe('{broken');
    expect(secure.values.get('rranker.provider.sessions.v2')).toBe('{broken');
    expect(secure.values.get('rranker.diving-fish.session.v1')).toBe('{broken');
  });

  it('restores a preserved index only when the copy parses and the live key is unusable', async () => {
    const valid = JSON.stringify({ version: 4, activeAccountId: null, credentials: [], accounts: [] });
    sqlite.values.set(INDEX, valid);
    sqlite.values.set(`${INDEX}.corrupt`, '{stale');
    expect(await restorePreservedSessionIndex(kvStore)).toBe(false);
    expect(sqlite.values.get(INDEX)).toBe(valid);
    sqlite.values.set(INDEX, '{broken');
    sqlite.values.set(`${INDEX}.corrupt`, valid);
    expect(await restorePreservedSessionIndex(kvStore)).toBe(true);
    expect(sqlite.values.get(INDEX)).toBe(valid);
    sqlite.values.delete(INDEX);
    sqlite.values.set(`${INDEX}.corrupt`, '{broken');
    await expect(restorePreservedSessionIndex(kvStore)).rejects.toBeInstanceOf(SessionIndexCorruptError);
    expect(sqlite.values.has(INDEX)).toBe(false);
    sqlite.values.delete(`${INDEX}.corrupt`);
    expect(await restorePreservedSessionIndex(kvStore)).toBe(false);
  });

  it('clears preserved copies together with the live index', async () => {
    sqlite.values.set(INDEX, '{broken');
    sqlite.values.set(`${INDEX}.corrupt`, '{broken}');
    sqlite.values.set(`${INDEX}.unrecognized`, '{"version":5}');
    await createStore().clear();
    expect(sqlite.values.has(INDEX)).toBe(false);
    expect(sqlite.values.has(`${INDEX}.corrupt`)).toBe(false);
    expect(sqlite.values.has(`${INDEX}.unrecognized`)).toBe(false);
  });
});

describe('Majdata Cookie secure accounts', () => {  const input = (id: string): StoredProviderAccountInput => ({ id, gameId: 'majdata-net', providerId: 'majdata-net', displayName: id, scoreDisplay: '-', session: { mode: 'http-cookies', persistable: true, origin: 'https://majdata.net', cookies: [{ name: 'auth', value: `secret-${id}`, path: '/', secure: true }] } });
  beforeEach(() => { secure.values.clear(); sqlite.values.clear(); });
  it('restores and removes each isolated credential without exposing it in SQLite', async () => {
    const store = createStore(); await store.upsertAccount(input('a')); await store.upsertAccount(input('b'));
    const restored = await store.loadVault(); expect(restored.credentials).toHaveLength(2);
    expect([...sqlite.values.values()].join('')).not.toContain('secret-');
    await store.removeAccount('a'); const remaining = await store.loadVault(); expect(remaining.accounts.map(a => a.id)).toEqual(['b']);
    expect(remaining.credentials[0].session).toMatchObject({ cookies: [{ value: 'secret-b' }] });
  });
  it('rolls back an account binding cancelled while its index is being saved', async () => {
    const controller = new AbortController(); let armed = false;
    const store = new SecureSessionStore({ ...kvStore, setItem: async (key, value) => { await kvStore.setItem(key, value); if (armed) { armed = false; controller.abort(); } } });
    await store.upsertAccount(input('a')); armed = true;
    await expect(store.upsertAccount(input('b'), controller.signal)).rejects.toBeDefined();
    const remaining = await store.loadVault(); expect(remaining.accounts.map(a => a.id)).toEqual(['a']); expect(remaining.activeAccountId).toBe('a');
  });
});

describe('Rizline SMS secure accounts', () => {
  const session = { mode: 'rizline', phone: '13800000000', token: 'private-token', deviceId: 'device-id', channelId: '1', persistable: true } as const;
  const input: StoredProviderAccountInput = { id: 'rizline:official:123', gameId: 'rizline', providerId: 'rizline-official',
    displayName: 'Rizline 玩家', scoreDisplay: '135.4321', session };
  beforeEach(() => { secure.values.clear(); sqlite.values.clear(); });
  it('round trips credentials separately from public account metadata and removes them on unlink', async () => {
    const store = createStore();
    await store.upsertAccount(input);
    await writeRizlinePassword(input.id, 'secret-password');
    await store.updateAccountMetadata(input.id, { displayName: '新名称', scoreDisplay: '140.0000' });
    const vault = await store.loadVault();
    expect(vault.accounts[0]).toMatchObject({ id: input.id, gameId: 'rizline', providerId: 'rizline-official', displayName: '新名称', scoreDisplay: '140.0000' });
    expect(vault.credentials[0].session).toEqual(session);
    const ordinaryStorage = [...sqlite.values.values()].join('');
    expect(ordinaryStorage).not.toContain(session.phone);
    expect(ordinaryStorage).not.toContain(session.token);
    expect(ordinaryStorage).not.toContain('secret-password');
    expect(await hasRizlinePassword(input.id)).toBe(true);
    await store.removeAccount(input.id);
    expect((await store.loadVault()).credentials).toEqual([]);
    expect(await hasRizlinePassword(input.id)).toBe(false);
    expect([...secure.values.keys()].some(key => key.includes('rizline-password'))).toBe(false);
  });
  it('rotates a Rizline session when expected matches by token rather than JSON field order', async () => {
    const store = createStore();
    await store.upsertAccount(input);
    const reordered = { persistable: true, channelId: '1', deviceId: session.deviceId, phone: session.phone, token: session.token, mode: 'rizline' } as const;
    await store.updateAccountSession(input.id, { ...session, token: 'rotated' }, { expected: reordered });
    expect((await store.loadVault()).credentials[0].session).toEqual({ ...session, token: 'rotated' });
  });
  it('does not overwrite credentials saved by a newer login', async () => {
    const store = createStore();
    await store.upsertAccount(input);
    const newer = { ...session, token: 'new-login' };
    await store.upsertAccount({ ...input, session: newer });
    await store.updateAccountSession(input.id, { ...session, token: 'old-request-rotation' }, { expected: session });
    expect((await store.loadVault()).credentials[0].session).toEqual(newer);
  });
  it('rejects a cancelled rotation and malformed persisted session', async () => {
    const store = createStore(); await store.upsertAccount(input);
    const controller = new AbortController(); controller.abort(new Error('cancelled'));
    await expect(store.updateAccountSession(input.id, { ...session, token: 'late' }, { expected: session, signal: controller.signal })).rejects.toThrow('cancelled');
    expect((await store.loadVault()).credentials[0].session).toEqual(session);
    expect(await store.upsertAccount({ ...input, session: { ...session, phone: 'invalid' } })).toBe('');
  });
});

describe('落雪共享凭据提交', () => {
  const EXPIRES_AT = 1_800_000_000_000;
  const shared = (refreshToken: string) => ({
    mode: 'lxns-oauth' as const, accessToken: `access-${refreshToken}`, refreshToken,
    expiresAt: EXPIRES_AT, persistable: true as const,
  });
  const credentialId = 'lxns:shared';
  const lxnsAccount = (id: string, gameId: 'maimai' | 'chunithm'): StoredProviderAccountInput => ({
    id, gameId, providerId: 'lxns', credentialId,
    displayName: id, scoreDisplay: '-', session: shared('refresh-a'),
  });
  beforeEach(() => { secure.values.clear(); sqlite.values.clear(); });

  it('applies the rotation to the shared credential while another account still references it', async () => {
    const store = createStore();
    await store.upsertAccount(lxnsAccount('maimai:lxns:1', 'maimai'));
    await store.upsertAccount(lxnsAccount('chunithm:lxns:2', 'chunithm'));
    await store.removeAccount('maimai:lxns:1');

    await expect(store.updateCredentialSession(credentialId, shared('refresh-b'), {
      acceptedRefreshTokens: ['refresh-a'],
    })).resolves.toBe('applied');

    const vault = await store.loadVault();
    expect(vault.accounts.map(item => item.id)).toEqual(['chunithm:lxns:2']);
    expect(vault.credentials[0]?.session).toEqual(shared('refresh-b'));
  });

  it('refuses a rotation whose generation no longer matches the stored credential', async () => {
    const store = createStore();
    await store.upsertAccount({ ...lxnsAccount('maimai:lxns:1', 'maimai'), session: shared('refresh-new') });

    await expect(store.updateCredentialSession(credentialId, shared('refresh-late'), {
      acceptedRefreshTokens: ['refresh-a'],
    })).resolves.toBe('stale');
    expect((await store.loadVault()).credentials[0]?.session).toEqual(shared('refresh-new'));
  });

  it('reports a missing credential instead of writing an unreferenced secret', async () => {
    const store = createStore();
    await store.upsertAccount(lxnsAccount('maimai:lxns:1', 'maimai'));
    await store.removeAccount('maimai:lxns:1');

    await expect(store.updateCredentialSession(credentialId, shared('refresh-b'), {
      acceptedRefreshTokens: ['refresh-a'],
    })).resolves.toBe('missing');
    expect((await store.loadVault()).credentials).toEqual([]);
  });
});
