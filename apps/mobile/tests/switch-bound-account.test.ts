import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalMaimaiAccount,
  createMaxedChunithmTestAccount,
  createMaxedMaimaiTestAccount,
  createMaxedPhigrosTestAccount,
} from '@/domain/bound-account';
import { queryClient } from '@/state/query-client';
import { switchBoundAccount } from '@/services/switch-bound-account';

const mocks = vi.hoisted(() => ({
  setActiveAccountId: vi.fn(async () => undefined),
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
    (demo) => {
      const removeQueries = vi.spyOn(queryClient, 'removeQueries');

      switchBoundAccount(demo.id, { navigateToOverview: false });
      expect(mocks.sessionState?.activeAccountId).toBe(demo.id);
      switchBoundAccount(local.id, { navigateToOverview: false });
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
});
