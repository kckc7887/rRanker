import { LOCAL_MAIMAI_ACCOUNT_ID, MAIMAI_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import type { StoredProviderAccount } from '@/storage/secure-session-store';

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

function account(id: string): StoredProviderAccount {
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

  it('在 v2 记录中持久化可选课题模式元数据且不改变当前账号', async () => {
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
});
