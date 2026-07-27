import {
  CHUNITHM_TEMP_ACCOUNT_ID,
  LOCAL_MAIMAI_ACCOUNT_ID,
  MAIMAI_TEST_ACCOUNT_ID,
} from '@/domain/bound-account';
import type { StoredProviderAccountInput } from '@/storage/secure-session-store';

const secure = vi.hoisted(() => ({ values: new Map<string, string>() }));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secure.values.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { secure.values.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { secure.values.delete(key); }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

// The store must be imported after the in-memory SecureStore mock.
// eslint-disable-next-line import/first
import { SecureSessionStore } from '@/storage/secure-session-store';

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
  beforeEach(() => secure.values.clear());

  it('允许内置账号作为上次活跃账号且不写入远程账号数组', async () => {
    const store = new SecureSessionStore();
    await store.upsertAccount(account('maimai:diving-fish:a'));
    await store.setActiveAccountId(MAIMAI_TEST_ACCOUNT_ID);
    const vault = await store.loadVault();
    expect(vault.activeAccountId).toBe(MAIMAI_TEST_ACCOUNT_ID);
    expect(vault.accounts.map((item) => item.id)).toEqual(['maimai:diving-fish:a']);
  });

  it('允许额外本地玩家作为上次活跃账号', async () => {
    const store = new SecureSessionStore();
    await store.setActiveAccountId('maimai:local:second');
    const vault = await store.loadVault();
    expect(vault.activeAccountId).toBe('maimai:local:second');
    expect(vault.accounts).toEqual([]);
  });

  it('允许中二临时账号作为上次活跃账号', async () => {
    const store = new SecureSessionStore();
    await store.setActiveAccountId(CHUNITHM_TEMP_ACCOUNT_ID);
    const vault = await store.loadVault();
    expect(vault.activeAccountId).toBe(CHUNITHM_TEMP_ACCOUNT_ID);
    expect(vault.accounts).toEqual([]);
  });

  it('远程账号删除仍保留其他远程账号和内置活跃状态', async () => {
    const store = new SecureSessionStore();
    await store.upsertAccount(account('maimai:diving-fish:a'));
    await store.upsertAccount(account('maimai:diving-fish:b'));
    await store.setActiveAccountId(LOCAL_MAIMAI_ACCOUNT_ID);
    await store.removeAccount('maimai:diving-fish:b');
    const vault = await store.loadVault();
    expect(vault.activeAccountId).toBe(LOCAL_MAIMAI_ACCOUNT_ID);
    expect(vault.accounts.map((item) => item.id)).toEqual(['maimai:diving-fish:a']);
  });

  it('在 v3 记录中持久化可选课题模式元数据且不改变当前账号', async () => {
    const store = new SecureSessionStore();
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
    const vault = await new SecureSessionStore().loadVault();
    expect(vault.version).toBe(3);
    expect(vault.accounts[0].credentialId).toBe('credential:maimai:diving-fish:a');
    expect(vault.credentials).toHaveLength(1);
    expect(secure.values.has('rranker.provider.sessions.v2')).toBe(false);
  });

  it('双游戏账号共享一份 LXNS 凭据并在最后解绑时清除', async () => {
    const store = new SecureSessionStore();
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
});
