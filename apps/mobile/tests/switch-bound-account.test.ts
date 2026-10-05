import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalMaimaiAccount,
  createMaxedChunithmTestAccount,
  createMaxedMaimaiTestAccount,
  createMaxedPhigrosTestAccount,
} from '@/domain/bound-account';
import { queryClient } from '@/state/query-client';
import { notifyAccountSwitchError, switchBoundAccount } from '@/services/switch-bound-account';

const mocks = vi.hoisted(() => ({
  setActiveAccountId: vi.fn(async (_accountId: string): Promise<void> => undefined),
  canDismiss: vi.fn(() => false),
  dismissTo: vi.fn(),
  navigate: vi.fn(),
  sessionState: null as null | {
    activeAccountId: string;
    boundAccounts: ReturnType<typeof createLocalMaimaiAccount>[];
    selectBoundAccount: (accountId: string) => void;
  },
}));

vi.mock('expo-router', () => ({
  router: {
    canDismiss: mocks.canDismiss,
    dismissTo: mocks.dismissTo,
    navigate: mocks.navigate,
  },
}));

vi.mock('@/storage/secure-session-store', () => ({
  SecureSessionStore: class {
    setActiveAccountId = mocks.setActiveAccountId;
  },
}));

vi.mock('@/state/session-store', () => ({
  useSession: {
    getState: () => mocks.sessionState,
  },
}));

const local = createLocalMaimaiAccount('本地玩家', 0);
const demoAccounts = [
  createMaxedMaimaiTestAccount(),
  createMaxedChunithmTestAccount(),
  createMaxedPhigrosTestAccount(),
];
const accounts = [local, ...demoAccounts];

describe('switchBoundAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    mocks.sessionState = {
      boundAccounts: accounts,
      activeAccountId: local.id,
      selectBoundAccount: (accountId) => {
        if (mocks.sessionState) mocks.sessionState.activeAccountId = accountId;
      },
    };
    for (const account of accounts) {
      queryClient.setQueryData(['game-data', account.id], { accountId: account.id });
      queryClient.setQueryData(['score-snapshot', account.id], { accountId: account.id });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  it.each(demoAccounts)(
    'preserves warm account caches when switching to and from $providerId',
    async (demo) => {
      const removeQueries = vi.spyOn(queryClient, 'removeQueries');

      await switchBoundAccount(demo.id, { navigateToOverview: false });
      expect(mocks.sessionState?.activeAccountId).toBe(demo.id);
      await switchBoundAccount(local.id, { navigateToOverview: false });
      expect(mocks.sessionState?.activeAccountId).toBe(local.id);

      expect(removeQueries).not.toHaveBeenCalled();
      for (const account of accounts) {
        expect(queryClient.getQueryData(['game-data', account.id])).toEqual({ accountId: account.id });
        expect(queryClient.getQueryData(['score-snapshot', account.id])).toEqual({ accountId: account.id });
      }
      expect(mocks.setActiveAccountId).toHaveBeenCalledWith(demo.id);
      expect(mocks.setActiveAccountId).toHaveBeenCalledWith(local.id);
    },
  );

  it('persists the active account again without repeating state selection or navigation in place', async () => {
    const select = vi.spyOn(mocks.sessionState!, 'selectBoundAccount');
    await switchBoundAccount(local.id, { navigateToOverview: false });

    expect(mocks.setActiveAccountId).toHaveBeenCalledWith(local.id);
    expect(select).not.toHaveBeenCalled();
    expect(mocks.dismissTo).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('keeps the immediate selection on write failure and retries the same target', async () => {
    const failure = new Error('storage failed');
    mocks.setActiveAccountId.mockRejectedValueOnce(failure);
    await expect(switchBoundAccount(demoAccounts[0].id, { navigateToOverview: false })).rejects.toMatchObject({ cause: failure });
    expect(mocks.sessionState?.activeAccountId).toBe(demoAccounts[0].id);
    await expect(switchBoundAccount(demoAccounts[0].id, { navigateToOverview: false })).resolves.toBe(true);
    expect(mocks.setActiveAccountId).toHaveBeenCalledTimes(2);
  });

  it('shows a fixed retry message for the current failed choice', async () => {
    mocks.setActiveAccountId.mockRejectedValueOnce(new Error('private storage detail'));
    const error = await switchBoundAccount(demoAccounts[0].id, { navigateToOverview: false }).catch(error => error);
    const notify = vi.fn();
    notifyAccountSwitchError(error, notify);
    expect(notify).toHaveBeenCalledWith({ title: '当前账号未保存',
      message: '当前已切换，账号选择未保存，请重新选择', variant: 'error' });
  });

  it('suppresses an old failed B choice even after a later C then B choice', async () => {
    let reject!: (reason: unknown) => void;
    mocks.setActiveAccountId.mockReturnValueOnce(new Promise<void>((_resolve, fail) => { reject = fail; }));
    const old = switchBoundAccount(demoAccounts[0].id, { navigateToOverview: false }).catch(error => error);
    await switchBoundAccount(demoAccounts[1].id, { navigateToOverview: false });
    await switchBoundAccount(demoAccounts[0].id, { navigateToOverview: false });
    reject(new Error('late failure'));
    const notify = vi.fn(); notifyAccountSwitchError(await old, notify);
    expect(notify).not.toHaveBeenCalled();
  });

  it('returns false for an old successful choice so callers cannot announce stale success', async () => {
    let resolve!: () => void;
    mocks.setActiveAccountId.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    const old = switchBoundAccount(demoAccounts[0].id, { navigateToOverview: false });
    await switchBoundAccount(demoAccounts[1].id, { navigateToOverview: false });
    resolve(); await expect(old).resolves.toBe(false);
  });

  it('ignores an account id that is not currently bound', async () => {
    await switchBoundAccount('phira:community:missing');

    expect(mocks.sessionState?.activeAccountId).toBe(local.id);
    expect(mocks.setActiveAccountId).not.toHaveBeenCalled();
    expect(mocks.dismissTo).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
