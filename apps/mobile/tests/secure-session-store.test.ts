import {
  CHUNITHM_TEST_ACCOUNT_ID,
  CHUNITHM_TEMP_ACCOUNT_ID,
  LOCAL_MAIMAI_ACCOUNT_ID,
  MAIMAI_TEST_ACCOUNT_ID,
  MUSEDASH_TEST_ACCOUNT_ID,
  PHIGROS_TEST_ACCOUNT_ID,
} from '@/domain/bound-account';
import type { StoredProviderAccountInput } from '@/storage/secure-session-store';
import { SessionPersistenceError } from '@/domain/session-vault';
import { LargeSecureValueStore } from '@/storage/large-secure-value-store';

const secure = vi.hoisted(() => ({ values: new Map<string, string>() }));
const sqlite = vi.hoisted(() => ({ values: new Map<string, string>() }));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secure.values.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { secure.values.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { secure.values.delete(key); }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

// eslint-disable-next-line import/first -- 原生模块 mock 必须先被测模块注册
import * as SecureStore from 'expo-secure-store';
// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import {
  SecureSessionStore,
} from '@/storage/secure-session-store';
// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import { deleteRizlinePassword, hasRizlinePassword, readRizlinePassword, writeRizlinePassword } from '@/storage/rizline-password-store';

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

describe('SecureSessionStore 当前账号', () => {

  it('identifies encrypted credential writes separately from local index commits', async () => {
    const nativeFailure = new Error('native options conversion failed');
    vi.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(nativeFailure);
    const store = createStore();
    const input = account('maimai:diving-fish:secret-failure');
    const failed = store.upsertAccount(input);
    await expect(failed).rejects.toBeInstanceOf(SessionPersistenceError);
    await expect(failed).rejects.toMatchObject({ code: 'credential_storage', cause: nativeFailure });
    expect((await store.loadVault()).accounts).toEqual([]);

    const commitFailure = new Error('index locked');
    const storage = { ...kvStore, setItem: vi.fn(async (key: string, value: string) => {
      if (JSON.parse(value).accounts?.length) throw commitFailure;
      await kvStore.setItem(key, value);
    }) };
    await expect(new SecureSessionStore(storage).upsertAccount(input)).rejects.toMatchObject({ code: 'local_commit', cause: commitFailure });
    expect((await store.loadVault()).accounts).toEqual([]);
  });

  it('classifies native credential reads and preserves cancellation during persistence', async () => {
    const input = account('maimai:diving-fish:read-failure');
    const store = createStore();
    await store.upsertAccount(input);
    const nativeFailure = new Error('secret unavailable');
    vi.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(nativeFailure);
    await expect(store.loadVault()).rejects.toMatchObject({ code: 'credential_storage', cause: nativeFailure });
    const controller = new AbortController(), reason = new Error('user cancelled while writing');
    vi.mocked(SecureStore.setItemAsync).mockImplementationOnce(async (key, value) => {
      secure.values.set(key, value); controller.abort(reason);
    });
    await expect(store.upsertAccount({ ...input, session: { mode: 'import-token', value: 'changed', persistable: true } }, controller.signal)).rejects.toBe(reason);
    expect((await store.loadVault()).credentials[0]?.session).toEqual(input.session);
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

  it('does not let an unreferenced secret block valid accounts', async () => {
    const store = createStore();
    await store.upsertAccount(account('maimai:diving-fish:a'));
    const key = 'rranker.provider.sessions.index.v4';
    const index = JSON.parse(sqlite.values.get(key)!) as {
      credentials: { id: string; providerId: string; secretRef: string }[];
    };
    index.credentials.push({ id: 'orphan', providerId: 'diving-fish', secretRef: 'missing' });
    sqlite.values.set(key, JSON.stringify(index));
    expect((await store.loadVault()).accounts.map((item) => item.id)).toEqual(['maimai:diving-fish:a']);
  });

});

describe('SecureSessionStore 当前存储读取', () => {
  const key = 'rranker.provider.sessions.index.v4';
  beforeEach(() => { secure.values.clear(); sqlite.values.clear(); vi.clearAllMocks(); });

  it.each(['', '{broken', JSON.stringify({ version: 3, accounts: [] }), JSON.stringify({ version: 4, credentials: {}, accounts: [] }), JSON.stringify({ version: 4, credentials: [], accounts: [] })])(
    '读取不支持的索引后重建当前空账号库：%s', async raw => {
      sqlite.values.set(key, raw);
      sqlite.values.set('unrelated', 'keep');
      const store = createStore();
      expect((await store.loadVault()).accounts).toEqual([]);
      expect(sqlite.values.get('unrelated')).toBe('keep');
      await store.upsertAccount(account('current'));
      expect((await createStore().loadVault()).accounts.map(item => item.id)).toEqual(['current']);
    },
  );

  it('保留明确清空的当前账号选择', async () => {
    const store = createStore();
    await store.upsertAccount(account('current'));
    await store.setActiveAccountId(null);
    const vault = await createStore().loadVault();
    expect(vault.activeAccountId).toBeNull();
    expect(vault.accounts.map(item => item.id)).toEqual(['current']);
  });

  it('索引读取失败保留当前账号数据', async () => {
    await createStore().upsertAccount(account('current'));
    const before = sqlite.values.get(key);
    const storage = { ...kvStore, getItem: async () => { throw new Error('disk unavailable'); } };
    await expect(new SecureSessionStore(storage).loadVault()).rejects.toMatchObject({ code: 'local_commit' });
    expect(sqlite.values.get(key)).toBe(before);
    expect((await createStore().loadVault()).accounts.map(item => item.id)).toEqual(['current']);
  });

  it('重置索引写入失败时报告错误并保留原值', async () => {
    sqlite.values.set(key, '{unsupported');
    const storage = { ...kvStore, setItem: async () => { throw new Error('disk unavailable'); } };
    await expect(new SecureSessionStore(storage).loadVault()).rejects.toMatchObject({ code: 'local_commit' });
    expect(sqlite.values.get(key)).toBe('{unsupported');
  });

  it('只删除不支持的当前凭据及共享它的账号', async () => {
    const store = createStore();
    await store.upsertAccounts([{ ...account('invalid-one'), credentialId: 'shared-invalid' },
      { ...account('invalid-two'), credentialId: 'shared-invalid' }, account('valid')], { activeAccountId: 'invalid-one' });
    const index = JSON.parse(sqlite.values.get(key)!);
    const secretRef = index.credentials.find((item: { id: string }) => item.id === 'shared-invalid').secretRef;
    await new LargeSecureValueStore().write(secretRef, JSON.stringify({ mode: 'unsupported', value: 'old' }));
    const restored = await store.loadVault();
    expect(restored.accounts.map(item => item.id)).toEqual(['valid']);
    expect(restored.credentials.map(item => item.session)).toEqual([account('valid').session]);
    expect(restored.activeAccountId).toBe('valid');
    expect((await createStore().loadVault()).accounts.map(item => item.id)).toEqual(['valid']);
  });

  it('发现坏凭据后若其它凭据 I/O 失败，不提交任何删除', async () => {
    const store = createStore();
    await store.upsertAccount(account('invalid'));
    await store.upsertAccount(account('valid'));
    const before = sqlite.values.get(key)!;
    const index = JSON.parse(before);
    const invalidRef = index.credentials.find((item: { id: string }) => item.id === 'credential:invalid').secretRef;
    const validRef = index.credentials.find((item: { id: string }) => item.id === 'credential:valid').secretRef;
    await new LargeSecureValueStore().write(invalidRef, '{unsupported');
    const read = vi.mocked(SecureStore.getItemAsync);
    const original = read.getMockImplementation()!;
    read.mockImplementation(async name => {
      if (name === `${validRef}.manifest`) throw new Error('credential unavailable');
      return original(name);
    });
    try {
      await expect(store.loadVault()).rejects.toMatchObject({ code: 'credential_storage' });
      expect(sqlite.values.get(key)).toBe(before);
    } finally { read.mockImplementation(original); }
    expect((await store.loadVault()).accounts.map(item => item.id)).toEqual(['valid']);
  });

  it('清空当前账号库后不恢复已解除的账号', async () => {
    const store = createStore();
    await store.upsertAccount(account('current'));
    await expect(store.clear()).resolves.toEqual({ committed: true, cleanupFailures: [] });
    expect((await createStore().loadVault()).accounts).toEqual([]);
    expect((await createStore().loadVault()).credentials).toEqual([]);
  });
});

describe('SecureSessionStore commit failure recovery', () => {
  const INDEX = 'rranker.provider.sessions.index.v4';
  beforeEach(() => { secure.values.clear(); sqlite.values.clear(); vi.clearAllMocks(); });

  it.each(['missing', 'existing'] as const)('keeps every referenced credential when cancellation rollback fails with %s baseline', async baseline => {
    const controller = new AbortController();
    let armed = false;
    const failure = new Error('rollback blocked');
    const storage = { ...kvStore,
      setItem: async (key: string, value: string) => {
        if (armed && controller.signal.aborted) throw failure;
        await kvStore.setItem(key, value);
        if (armed) controller.abort(new Error('cancelled'));
      },
      removeItem: async (key: string) => { if (armed) throw failure; await kvStore.removeItem(key); },
    };
    const store = new SecureSessionStore(storage);
    if (baseline === 'existing') await store.upsertAccount(account('first'));
    armed = true;
    await expect(store.upsertAccount(account('committed'), controller.signal)).rejects.toMatchObject({ code: 'local_commit', cause: failure });
    const vault = await store.loadVault();
    expect(vault.accounts.map(item => item.id)).toEqual(baseline === 'existing' ? ['first', 'committed'] : ['committed']);
    expect(vault.credentials.find(item => item.id.endsWith(':committed'))?.session).toEqual(account('committed').session);
  });

  it('preserves new secrets when the actual index cannot be read after a failed write', async () => {
    let committed = false;
    const storage = { ...kvStore,
      getItem: async (key: string) => { if (committed) throw new Error('readback unavailable'); return kvStore.getItem(key); },
      setItem: async (key: string, value: string) => { await kvStore.setItem(key, value); committed = true; throw new Error('write reported failure'); },
    };
    await expect(new SecureSessionStore(storage).upsertAccount(account('recoverable'))).rejects.toMatchObject({ code: 'local_commit' });
    expect((await createStore().loadVault()).credentials[0]?.session).toEqual(account('recoverable').session);
  });

  it('does not delete credentials when committing the empty index fails', async () => {
    const original = createStore(); await original.upsertAccount(account('retained'));
    const raw = sqlite.values.get(INDEX);
    const secrets = [...secure.values.entries()];
    const store = new SecureSessionStore({ ...kvStore, setItem: async () => { throw new Error('empty commit failed'); } });
    await expect(store.clear()).rejects.toMatchObject({ code: 'local_commit' });
    expect(sqlite.values.get(INDEX)).toBe(raw);
    expect([...secure.values.entries()]).toEqual(secrets);
    expect((await original.loadVault()).credentials[0]?.session).toEqual(account('retained').session);
  });

});

describe('SecureSessionStore atomic account batches', () => {
  const INDEX = 'rranker.provider.sessions.index.v4';
  const originalSession = { mode: 'osu-oauth', accessToken: 'original-access', refreshToken: 'original-refresh',
    expiresAt: 2_000_000_000_000, persistable: true } as const;
  const refreshedSession = { ...originalSession, accessToken: 'new-access', refreshToken: 'new-refresh' };
  const modes = (userId: number, session: StoredProviderAccountInput['session'] = originalSession): StoredProviderAccountInput[] => (
    ['osu-standard', 'osu-mania'] as const
  ).map(gameId => ({ id: `${gameId}:osu:${userId}`, gameId, providerId: 'osu', credentialId: `osu:shared:${userId}`,
    displayName: `player-${userId}`, scoreDisplay: '1234', session }));

  beforeEach(() => { secure.values.clear(); sqlite.values.clear(); vi.clearAllMocks(); });

  it('writes a shared credential once and restores the first selected account as active', async () => {
    const storage = { ...kvStore, setItem: vi.fn(kvStore.setItem) };
    const inputs = modes(2);
    await new SecureSessionStore(storage).upsertAccounts(inputs, { activeAccountId: inputs[0].id });
    expect(vi.mocked(SecureStore.setItemAsync).mock.calls.filter(([key]) => key.endsWith('.manifest'))).toHaveLength(1);
    const index = JSON.parse(sqlite.values.get(INDEX)!);
    expect(index.accounts.map((item: { id: string }) => item.id)).toEqual(inputs.map(item => item.id));
    expect(index.credentials).toHaveLength(1);
    const restored = await new SecureSessionStore(storage).loadVault();
    expect(restored.activeAccountId).toBe(inputs[0].id);
    expect(restored.credentials).toEqual([{ id: inputs[0].credentialId, providerId: 'osu', session: originalSession }]);
    expect(restored.accounts.map(item => item.id)).toEqual(inputs.map(item => item.id));
  });

  it('restores all shared modes with the new session after reauthorizing only mania', async () => {
    const store = createStore(), inputs = modes(2);
    await store.upsertAccounts(inputs, { activeAccountId: inputs[0].id });
    await store.upsertAccounts([{ ...inputs[1], displayName: 'updated player', session: refreshedSession }],
      { activeAccountId: inputs[1].id });
    const restored = await createStore().loadVault();
    expect(restored.activeAccountId).toBe(inputs[1].id);
    expect(restored.accounts).toHaveLength(2);
    expect(restored.accounts.every(item => item.credentialId === inputs[0].credentialId)).toBe(true);
    expect(restored.accounts.find(item => item.id === inputs[1].id)?.displayName).toBe('updated player');
    expect(restored.credentials).toEqual([{ id: inputs[0].credentialId, providerId: 'osu', session: refreshedSession }]);
  });

  it.each(['secure-write', 'index-write'] as const)('preserves every shared mode after a %s reauthorization failure', async failureStage => {
    let armed = false;
    const storage = { ...kvStore, setItem: async (key: string, value: string) => {
      if (armed && failureStage === 'index-write') throw new Error('index commit failed');
      await kvStore.setItem(key, value);
    } };
    const store = new SecureSessionStore(storage);
    const inputs = modes(2);
    await store.upsertAccounts(inputs, { activeAccountId: inputs[0].id });
    const raw = sqlite.values.get(INDEX);
    const originalSecrets = [...secure.values.entries()];
    if (failureStage === 'secure-write') vi.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('native write failed'));
    armed = true;
    await expect(store.upsertAccounts([{ ...inputs[1], displayName: 'new name', session: refreshedSession }],
      { activeAccountId: inputs[1].id })).rejects.toMatchObject({ code: failureStage === 'index-write' ? 'local_commit' : 'credential_storage' });
    expect(sqlite.values.get(INDEX)).toBe(raw);
    expect([...secure.values.entries()]).toEqual(originalSecrets);
    const restored = await new SecureSessionStore(storage).loadVault();
    expect(restored.activeAccountId).toBe(inputs[0].id);
    expect(restored.accounts.map(item => item.id)).toEqual(inputs.map(item => item.id));
    expect(restored.credentials[0].session).toEqual(originalSession);
  });

  it.each(['signal', 'generation'] as const)('rolls back the complete batch when %s becomes invalid during the index write', async guard => {
    const controller = new AbortController();
    const reason = new Error('binding is no longer current');
    let armed = false, current = true;
    const assertCurrent = () => { if (!current) throw reason; };
    const storage = { ...kvStore, setItem: async (key: string, value: string) => {
      await kvStore.setItem(key, value);
      if (armed) {
        armed = false;
        if (guard === 'signal') controller.abort(reason);
        else current = false;
      }
    } };
    const store = new SecureSessionStore(storage);
    const inputs = modes(2);
    await store.upsertAccounts(inputs, { activeAccountId: inputs[0].id });
    const raw = sqlite.values.get(INDEX), originalSecrets = [...secure.values.entries()];
    armed = true;
    await expect(store.upsertAccounts(modes(2, refreshedSession), { activeAccountId: inputs[1].id,
      signal: controller.signal, assertCurrent })).rejects.toBe(reason);
    expect(sqlite.values.get(INDEX)).toBe(raw);
    expect([...secure.values.entries()]).toEqual(originalSecrets);
    expect((await new SecureSessionStore(storage).loadVault()).credentials[0].session).toEqual(originalSession);
  });

  it('discards earlier new credentials when a later credential in the same batch cannot be saved', async () => {
    const store = createStore();
    await store.upsertAccount(account('existing'));
    const raw = sqlite.values.get(INDEX), originalSecrets = [...secure.values.entries()];
    const writing = vi.mocked(SecureStore.setItemAsync), previousWrite = writing.getMockImplementation();
    let manifests = 0;
    writing.mockImplementation(async (key, value) => {
      if (key.endsWith('.manifest') && ++manifests === 2) throw new Error('second credential failed');
      secure.values.set(key, value);
    });
    try {
      const inputs = [...modes(2), ...modes(3)];
      await expect(store.upsertAccounts(inputs, { activeAccountId: inputs[0].id })).rejects.toMatchObject({ code: 'credential_storage' });
      expect(manifests).toBe(2);
      expect(sqlite.values.get(INDEX)).toBe(raw);
      expect([...secure.values.entries()]).toEqual(originalSecrets);
      expect((await createStore().loadVault()).accounts.map(item => item.id)).toEqual(['existing']);
    } finally { writing.mockImplementation(previousWrite!); }
  });

  it('removes a newly created index when the batch is cancelled during its first commit', async () => {
    const controller = new AbortController(), reason = new Error('cancelled');
    const storage = { ...kvStore, setItem: async (key: string, value: string) => {
      await kvStore.setItem(key, value); controller.abort(reason);
    } };
    const inputs = modes(2);
    await expect(new SecureSessionStore(storage).upsertAccounts(inputs, { activeAccountId: inputs[0].id,
      signal: controller.signal })).rejects.toBe(reason);
    expect(sqlite.values.has(INDEX)).toBe(false);
    expect([...secure.values]).toEqual([]);
    expect((await new SecureSessionStore(storage).loadVault()).accounts).toEqual([]);
  });

  it('checks the binding generation again after waiting behind another store instance', async () => {
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { started = resolve; });
    let blocked = false, current = true;
    const reason = new Error('source account removed');
    const storage = { ...kvStore, setItem: async (key: string, value: string) => {
      if (blocked) { blocked = false; started(); await gate; }
      await kvStore.setItem(key, value);
    } };
    const first = new SecureSessionStore(storage), second = new SecureSessionStore(storage);
    await first.upsertAccount(account('existing'));
    const originalSecrets = [...secure.values.entries()];
    vi.mocked(SecureStore.setItemAsync).mockClear();
    blocked = true;
    const preceding = first.setActiveAccountId('existing');
    await ready;
    const inputs = modes(2);
    const pending = second.upsertAccounts(inputs, { activeAccountId: inputs[0].id, assertCurrent: () => { if (!current) throw reason; } });
    const rejection = expect(pending).rejects.toBe(reason);
    current = false; release();
    await preceding; await rejection;
    expect(vi.mocked(SecureStore.setItemAsync)).not.toHaveBeenCalled();
    expect([...secure.values.entries()]).toEqual(originalSecrets);
    expect((await first.loadVault()).accounts.map(item => item.id)).toEqual(['existing']);
  });

  it('serializes concurrent complete batches across store instances without losing accounts', async () => {
    let release!: () => void, started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { started = resolve; });
    let blocked = false;
    const storage = { ...kvStore, getItem: async (key: string) => {
      const value = await kvStore.getItem(key);
      if (blocked && key === INDEX) { blocked = false; started(); await gate; }
      return value;
    } };
    const first = new SecureSessionStore(storage), second = new SecureSessionStore(storage);
    await first.upsertAccount(account('existing'));
    const batchB = modes(2), batchC = modes(3);
    blocked = true;
    const savingB = first.upsertAccounts(batchB, { activeAccountId: batchB[0].id });
    await ready;
    const savingC = second.upsertAccounts(batchC, { activeAccountId: batchC[0].id });
    release(); await Promise.all([savingB, savingC]);
    const restored = await new SecureSessionStore(storage).loadVault();
    expect(restored.accounts.map(item => item.id)).toEqual(['existing', ...batchB.map(item => item.id), ...batchC.map(item => item.id)]);
    expect(restored.credentials).toHaveLength(3);
    expect(restored.activeAccountId).toBe(batchC[0].id);
  });

  it('preserves the committed batch when cancellation arrives during old credential cleanup', async () => {
    const store = createStore(), inputs = modes(2);
    await store.upsertAccounts(inputs, { activeAccountId: inputs[0].id });
    const controller = new AbortController();
    vi.mocked(SecureStore.deleteItemAsync).mockImplementationOnce(async key => {
      secure.values.delete(key); controller.abort(new Error('left after commit'));
    });
    await expect(store.upsertAccounts(modes(2, refreshedSession), { activeAccountId: inputs[1].id,
      signal: controller.signal })).resolves.toBeUndefined();
    expect(controller.signal.aborted).toBe(true);
    const restored = await createStore().loadVault();
    expect(restored.activeAccountId).toBe(inputs[1].id);
    expect(restored.accounts).toHaveLength(2);
    expect(restored.credentials[0].session).toEqual(refreshedSession);
  });
});

describe('Rizline password mutation lifetime', () => {
  beforeEach(() => { secure.values.clear(); vi.clearAllMocks(); });

  it('restores the previous password when cancellation arrives during the secure write', async () => {
    await writeRizlinePassword('cancelled-password', 'previous');
    const controller = new AbortController(); const reason = new Error('cancelled');
    vi.mocked(SecureStore.setItemAsync).mockImplementationOnce(async (key, value) => { secure.values.set(key, value); controller.abort(reason); });
    await expect(writeRizlinePassword('cancelled-password', 'late', { signal: controller.signal })).rejects.toBe(reason);
    await expect(readRizlinePassword('cancelled-password')).resolves.toBe('previous');
  });

  it('serializes deletion with an in-flight write and leaves no password behind', async () => {
    let release!: () => void; let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { started = resolve; });
    vi.mocked(SecureStore.setItemAsync).mockImplementationOnce(async (key, value) => { started(); await gate; secure.values.set(key, value); });
    const writing = writeRizlinePassword('removed-password', 'late');
    const rejected = expect(writing).rejects.toThrow('密码保存已失效');
    await ready;
    const deleting = deleteRizlinePassword('removed-password');
    release();
    await rejected; await deleting;
    await expect(hasRizlinePassword('removed-password')).resolves.toBe(false);
  });

  it('rejects an old generation and allows a new write after queued deletion', async () => {
    let current = true;
    const old = writeRizlinePassword('rebound-password', 'old', { assertCurrent: () => { if (!current) throw new Error('account replaced'); } });
    current = false;
    await expect(old).rejects.toThrow('account replaced');
    const deleting = deleteRizlinePassword('rebound-password');
    const newer = writeRizlinePassword('rebound-password', 'new');
    await Promise.all([deleting, newer]);
    await expect(readRizlinePassword('rebound-password')).resolves.toBe('new');
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
  it('clears the separately stored password when clearing all login data', async () => {
    const store = createStore(); await store.upsertAccount(input);
    await writeRizlinePassword(input.id, 'secret-password');
    await expect(store.clear()).resolves.toEqual({ committed: true, cleanupFailures: [] });
    expect((await store.loadVault()).accounts).toEqual([]);
    await expect(hasRizlinePassword(input.id)).resolves.toBe(false);
  });
  it('rotates a Rizline session when expected matches by token rather than JSON field order', async () => {
    const store = createStore();
    await store.upsertAccount(input);
    const reordered = { persistable: true, channelId: '1', deviceId: session.deviceId, phone: session.phone, token: session.token, mode: 'rizline' } as const;
    await expect(store.updateAccountSession(input.id, { ...session, token: 'rotated' }, { expected: reordered })).resolves.toBe('applied');
    expect((await store.loadVault()).credentials[0].session).toEqual({ ...session, token: 'rotated' });
  });
  it('does not overwrite credentials saved by a newer login', async () => {
    const store = createStore();
    await store.upsertAccount(input);
    const newer = { ...session, token: 'new-login' };
    await store.upsertAccount({ ...input, session: newer });
    await expect(store.updateAccountSession(input.id, { ...session, token: 'old-request-rotation' }, { expected: session })).resolves.toBe('stale');
    expect((await store.loadVault()).credentials[0].session).toEqual(newer);
  });
  it('reports a missing account without saving a rotation', async () => {
    const store = createStore();
    await expect(store.updateAccountSession(input.id, { ...session, token: 'rotated' }, { expected: session })).resolves.toBe('missing');
    expect((await store.loadVault()).credentials).toEqual([]);
  });
  it('rejects a cancelled rotation', async () => {
    const store = createStore(); await store.upsertAccount(input);
    const controller = new AbortController(); controller.abort(new Error('cancelled'));
    await expect(store.updateAccountSession(input.id, { ...session, token: 'late' }, { expected: session, signal: controller.signal })).rejects.toThrow('cancelled');
    expect((await store.loadVault()).credentials[0].session).toEqual(session);
  });

  it('reports the unbind as committed even when the password cleanup fails', async () => {
    const store = createStore();
    await store.upsertAccount(input);
    await writeRizlinePassword(input.id, 'secret-password');
    const deleteItemAsync = vi.mocked(SecureStore.deleteItemAsync);
    const originalDelete = deleteItemAsync.getMockImplementation();
    // 只让附属密码引用删除失败；凭据索引与其它清理仍然成功。
    deleteItemAsync.mockImplementation(async (key: string) => {
      if (String(key).includes('rizline-password')) throw new Error('keychain busy');
      secure.values.delete(key);
    });
    try {
      await expect(store.removeAccount(input.id)).resolves.toEqual({
        committed: true,
        cleanupFailures: ['密码'],
      });
    } finally {
      if (originalDelete) deleteItemAsync.mockImplementation(originalDelete);
      else deleteItemAsync.mockReset();
    }

    // 提交点已经过去：账号与凭据确实已删除，附属清理失败不能反推账号还在。
    const vault = await store.loadVault();
    expect(vault.accounts).toEqual([]);
    expect(vault.credentials).toEqual([]);
  });

  it('keeps the account on disk when the unbind submission itself fails', async () => {
    let failWrites = false;
    const store = new SecureSessionStore({
      ...kvStore,
      setItem: async (key, value) => {
        if (failWrites) throw new Error('disk full');
        await kvStore.setItem(key, value);
      },
    });
    await store.upsertAccount(input);
    failWrites = true;

    await expect(store.removeAccount(input.id)).rejects.toMatchObject({ code: 'local_commit', cause: new Error('disk full') });

    failWrites = false;
    const vault = await store.loadVault();
    expect(vault.accounts.map(item => item.id)).toEqual([input.id]);
    expect(vault.credentials).toHaveLength(1);
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
