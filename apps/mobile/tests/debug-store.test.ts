import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DebugPreferencesStore } from '@/storage/debug-preferences-store';
import { createCatalogTestAccount, createLocalMaimaiAccount, createMaxedChunithmTestAccount, createMaxedMaimaiTestAccount,
  createMaxedMuseDashTestAccount, createMaxedPhigrosTestAccount } from '@/domain/bound-account';

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

it('hides every fixture provider, falls back to a real account and restores visibility without stealing selection', async () => {
  const { useDebugStore } = await import('@/state/debug-store');
  const { useSession, UNBOUND_ACCOUNT_ID } = await import('@/state/session-store');
  const { debugPreferencesStore } = await import('@/storage/debug-preferences-store');
  vi.spyOn(debugPreferencesStore, 'load').mockResolvedValue({ testAccountsEnabled: true });
  const save = vi.spyOn(debugPreferencesStore, 'save').mockResolvedValue();
  await useDebugStore.getState().hydrate();
  const examples = [createMaxedMaimaiTestAccount(), createMaxedChunithmTestAccount(), createMaxedPhigrosTestAccount(), createMaxedMuseDashTestAccount(),
    ...(['example', 'rizline', 'phira', 'adofai', 'majdata-net', 'osu-standard', 'osu-mania', 'osu-catch', 'osu-taiko'] as const).map(game => createCatalogTestAccount(game))];
  const real = createLocalMaimaiAccount('本地玩家', 1);
  useSession.getState().finishRestore(null, [...examples, real]);
  useSession.getState().selectBoundAccount('example:test');
  save.mockRejectedValueOnce(new Error('disk full'));
  await expect(useDebugStore.getState().setTestAccountsEnabled(false)).rejects.toThrow('disk full');
  expect(useSession.getState().activeAccountId).toBe('example:test');
  await useDebugStore.getState().setTestAccountsEnabled(false);
  expect(useSession.getState().activeAccountId).toBe(real.id);
  expect(useSession.getState().boundAccounts).toHaveLength(examples.length + 1);
  for (const example of examples) {
    useSession.getState().selectBoundAccount(example.id);
    expect(useSession.getState().activeAccountId).toBe(real.id);
  }
  await useDebugStore.getState().setTestAccountsEnabled(true);
  expect(useSession.getState().activeAccountId).toBe(real.id);
  for (const example of examples) {
    useSession.getState().selectBoundAccount(example.id);
    expect(useSession.getState().activeAccountId).toBe(example.id);
  }
  useSession.getState().removeBoundAccount(real.id);
  await useDebugStore.getState().setTestAccountsEnabled(false);
  expect(useSession.getState().activeAccountId).toBe(UNBOUND_ACCOUNT_ID);
  await useDebugStore.getState().setTestAccountsEnabled(true);
  expect(useSession.getState().activeAccountId).toBe(examples[0].id);
});

it('restores a preferred example only after preferences load and keeps it inactive after a read failure', async () => {
  const { useDebugStore } = await import('@/state/debug-store');
  const { useSession, UNBOUND_ACCOUNT_ID } = await import('@/state/session-store');
  const { debugPreferencesStore } = await import('@/storage/debug-preferences-store');
  const { SecureSessionStore } = await import('@/storage/secure-session-store');
  const { catalogDemoAccountStore } = await import('@/storage/catalog-demo-account-store');
  const { restoreAppAccounts } = await import('@/services/account-restoration');
  const account = createCatalogTestAccount('example');
  await catalogDemoAccountStore('example').save(account);
  vi.spyOn(SecureSessionStore.prototype, 'loadVault').mockResolvedValue({ version: 3, activeAccountId: account.id, credentials: [], accounts: [] });
  const load = vi.spyOn(debugPreferencesStore, 'load').mockRejectedValueOnce(new Error('storage unavailable'));
  await restoreAppAccounts();
  expect(useSession.getState().activeAccountId).toBe(UNBOUND_ACCOUNT_ID);
  expect(useSession.getState().boundAccounts).toContainEqual(account);
  expect(useDebugStore.getState().hydrated).toBe(false);
  let finish!: (value: { testAccountsEnabled: boolean }) => void;
  load.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const restoring = restoreAppAccounts();
  expect(useSession.getState().activeAccountId).toBe(UNBOUND_ACCOUNT_ID);
  finish({ testAccountsEnabled: true });
  await restoring;
  expect(useSession.getState().activeAccountId).toBe(account.id);
});

it('defaults to disabled for missing, malformed and non-boolean preferences, and persists the choice', async () => {
  let raw: string | null = null;
  const storage = {
    getItem: async () => raw,
    setItem: async (_key: string, value: string) => { raw = value; },
    removeItem: async () => { raw = null; },
  };
  for (const value of [null, '{', '{}', '{"testAccountsEnabled":"true"}']) {
    raw = value;
    await expect(new DebugPreferencesStore(storage).load()).resolves.toEqual({ testAccountsEnabled: false });
  }
  await new DebugPreferencesStore(storage).save({ testAccountsEnabled: true });
  await expect(new DebugPreferencesStore(storage).load()).resolves.toEqual({ testAccountsEnabled: true });
  await new DebugPreferencesStore(storage).save({ testAccountsEnabled: false });
  await expect(new DebugPreferencesStore(storage).load()).resolves.toEqual({ testAccountsEnabled: false });
});

it('shares initialization and does not reveal a persisted enabled choice before the read completes', async () => {
  const { debugPreferencesStore } = await import('@/storage/debug-preferences-store');
  let finish!: (value: { testAccountsEnabled: boolean }) => void;
  const load = vi.spyOn(debugPreferencesStore, 'load').mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const { useDebugStore } = await import('@/state/debug-store');
  const first = useDebugStore.getState().hydrate();
  expect(useDebugStore.getState().hydrate()).toBe(first);
  expect(useDebugStore.getState()).toMatchObject({ hydrated: false, testAccountsEnabled: false });
  finish({ testAccountsEnabled: true });
  await first;
  expect(load).toHaveBeenCalledTimes(1);
  expect(useDebugStore.getState()).toMatchObject({ hydrated: true, testAccountsEnabled: true });
});

it('waits for initialization before committing a user change', async () => {
  const { debugPreferencesStore } = await import('@/storage/debug-preferences-store');
  let finish!: (value: { testAccountsEnabled: boolean }) => void;
  vi.spyOn(debugPreferencesStore, 'load').mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const save = vi.spyOn(debugPreferencesStore, 'save').mockResolvedValue();
  const { useDebugStore } = await import('@/state/debug-store');
  const pending = useDebugStore.getState().setTestAccountsEnabled(false);
  await Promise.resolve();
  expect(save).not.toHaveBeenCalled();
  finish({ testAccountsEnabled: true });
  await pending;
  expect(save).toHaveBeenCalledWith({ testAccountsEnabled: false });
  expect(useDebugStore.getState()).toMatchObject({ hydrated: true, testAccountsEnabled: false, saving: false });
});

it('serializes writes, preserves the last saved state on failure, and permits retry', async () => {
  const { debugPreferencesStore } = await import('@/storage/debug-preferences-store');
  vi.spyOn(debugPreferencesStore, 'load').mockResolvedValue({ testAccountsEnabled: false });
  const save = vi.spyOn(debugPreferencesStore, 'save').mockRejectedValueOnce(new Error('disk full')).mockResolvedValue();
  const { useDebugStore } = await import('@/state/debug-store');
  await expect(useDebugStore.getState().setTestAccountsEnabled(true)).rejects.toThrow('disk full');
  expect(useDebugStore.getState()).toMatchObject({ testAccountsEnabled: false, saving: false });
  let finish!: () => void;
  save.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = useDebugStore.getState().setTestAccountsEnabled(true);
  const second = useDebugStore.getState().setTestAccountsEnabled(false);
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(useDebugStore.getState()).toMatchObject({ testAccountsEnabled: false, saving: true });
  finish();
  await Promise.all([first, second]);
  expect(save.mock.calls.map(([value]) => value.testAccountsEnabled)).toEqual([true, true, false]);
  expect(useDebugStore.getState()).toMatchObject({ testAccountsEnabled: false, saving: false });
});
