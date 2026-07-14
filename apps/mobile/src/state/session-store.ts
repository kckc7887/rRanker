import { create } from 'zustand';
import {
  createLocalMaimaiAccount,
  createMaimaiBoundAccount,
  createTestBoundAccount,
  LOCAL_MAIMAI_ACCOUNT_ID,
  TEST_ACCOUNT_ID,
  type BoundAccount,
} from '@/domain/bound-account';
import type { GameId, ProviderId } from '@/domain/game-bind-options';
import { fixturePlayer } from '@/fixtures/sanitized';
import type { DetailedCatalogProvider, ProviderSession, ScoreProvider } from '@/providers/contracts';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { EmptyCatalogProvider, EmptyScoreProvider } from '@/providers/empty-provider';
import { FixtureCatalogProvider, FixtureProvider } from '@/providers/fixture-provider';
import { LxnsCatalogProvider } from '@/providers/lxns-catalog-provider';

export type SessionRestoreStatus = 'restoring' | 'ready' | 'error';

export type GameSessionSlots = Partial<Record<GameId, ProviderSession | null>>;

interface SessionState {
  sessionsByGame: GameSessionSlots;
  boundAccounts: BoundAccount[];
  activeAccountId: string;
  activeGameId: GameId;
  activeProviderId: ProviderId | null;
  scoreProvider: ScoreProvider;
  catalogProvider: DetailedCatalogProvider;
  restoreStatus: SessionRestoreStatus;
  restoreError: string | null;
  session: ProviderSession | null;
  setSession: (session: ProviderSession, accountMeta?: { displayName: string; rating: number; playerId?: string; providerId?: ProviderId }) => void;
  upsertBoundAccount: (account: BoundAccount) => void;
  updateBoundAccountScore: (accountId: string, scoreDisplay: string, displayName?: string) => void;
  selectBoundAccount: (accountId: string) => void;
  setActiveProviderId: (providerId: ProviderId) => void;
  setActiveGameId: (gameId: GameId) => void;
  clearSession: () => void;
  finishRestore: (session: ProviderSession | null) => void;
  failRestore: (message: string) => void;
}

function maimaiProviders(session: ProviderSession | null): {
  scoreProvider: ScoreProvider;
  catalogProvider: DetailedCatalogProvider;
} {
  if (session) {
    return {
      scoreProvider: new DivingFishProvider(session),
      catalogProvider: new LxnsCatalogProvider(),
    };
  }
  return {
    scoreProvider: new FixtureProvider(),
    catalogProvider: new FixtureCatalogProvider(),
  };
}

function providersForAccount(account: BoundAccount, sessionsByGame: GameSessionSlots) {
  if (account.gameId === 'test' || account.gameId === 'phigros') {
    return {
      scoreProvider: new EmptyScoreProvider(),
      catalogProvider: new EmptyCatalogProvider(),
    };
  }
  return maimaiProviders(sessionsByGame.maimai ?? null);
}

function withMaimaiSession(
  sessionsByGame: GameSessionSlots,
  session: ProviderSession | null,
): GameSessionSlots {
  return { ...sessionsByGame, maimai: session };
}

function defaultBoundAccounts(hasMaimaiSession: boolean): BoundAccount[] {
  const accounts = [createTestBoundAccount()];
  if (!hasMaimaiSession) {
    accounts.unshift(createLocalMaimaiAccount(fixturePlayer.displayName, fixturePlayer.rating));
  }
  return accounts;
}

function replaceMaimaiAccounts(accounts: BoundAccount[], next: BoundAccount | null): BoundAccount[] {
  const withoutMaimai = accounts.filter((account) => account.gameId !== 'maimai');
  return next ? [next, ...withoutMaimai] : withoutMaimai;
}

function ensureTestAccount(accounts: BoundAccount[]): BoundAccount[] {
  if (accounts.some((account) => account.id === TEST_ACCOUNT_ID)) return accounts;
  return [...accounts, createTestBoundAccount()];
}

export const useSession = create<SessionState>((set, get) => ({
  sessionsByGame: {},
  boundAccounts: defaultBoundAccounts(false),
  activeAccountId: LOCAL_MAIMAI_ACCOUNT_ID,
  session: null,
  activeGameId: 'maimai',
  activeProviderId: 'diving-fish',
  scoreProvider: new FixtureProvider(),
  catalogProvider: new FixtureCatalogProvider(),
  restoreStatus: 'restoring',
  restoreError: null,
  setSession: (session, accountMeta) => {
    const providerId = accountMeta?.providerId ?? 'diving-fish';
    const maimaiAccount = createMaimaiBoundAccount({
      providerId,
      displayName: accountMeta?.displayName ?? '水鱼玩家',
      rating: accountMeta?.rating ?? 0,
      playerId: accountMeta?.playerId,
    });
    const sessionsByGame = withMaimaiSession(get().sessionsByGame, session);
    set({
      sessionsByGame,
      session,
      boundAccounts: ensureTestAccount(replaceMaimaiAccounts(get().boundAccounts, maimaiAccount)),
      activeAccountId: maimaiAccount.id,
      activeGameId: 'maimai',
      activeProviderId: providerId,
      ...maimaiProviders(session),
      restoreStatus: 'ready',
      restoreError: null,
    });
  },
  upsertBoundAccount: (account) => {
    const others = get().boundAccounts.filter((item) => item.id !== account.id);
    set({ boundAccounts: ensureTestAccount([...others, account]) });
  },
  updateBoundAccountScore: (accountId, scoreDisplay, displayName) => {
    set({
      boundAccounts: get().boundAccounts.map((account) => {
        if (account.id !== accountId) return account;
        return {
          ...account,
          scoreDisplay,
          displayName: displayName ?? account.displayName,
        };
      }),
    });
  },
  selectBoundAccount: (accountId) => {
    const account = get().boundAccounts.find((item) => item.id === accountId);
    if (!account) return;
    const { sessionsByGame } = get();
    set({
      activeAccountId: account.id,
      activeGameId: account.gameId,
      activeProviderId: account.providerId,
      session: sessionsByGame.maimai ?? null,
      ...providersForAccount(account, sessionsByGame),
    });
  },
  setActiveProviderId: (providerId) => {
    const { sessionsByGame, boundAccounts } = get();
    const match = boundAccounts.find(
      (account) => account.gameId === 'maimai' && account.providerId === providerId,
    );
    if (match) {
      get().selectBoundAccount(match.id);
      return;
    }
    set({
      activeGameId: 'maimai',
      activeProviderId: providerId,
      session: sessionsByGame.maimai ?? null,
      ...maimaiProviders(sessionsByGame.maimai ?? null),
    });
  },
  setActiveGameId: (gameId) => {
    const match = get().boundAccounts.find((account) => account.gameId === gameId);
    if (match) get().selectBoundAccount(match.id);
  },
  clearSession: () => {
    const local = createLocalMaimaiAccount(fixturePlayer.displayName, fixturePlayer.rating);
    const sessionsByGame = withMaimaiSession(get().sessionsByGame, null);
    set({
      sessionsByGame,
      session: null,
      boundAccounts: ensureTestAccount(replaceMaimaiAccounts([], local)),
      activeAccountId: local.id,
      activeGameId: 'maimai',
      activeProviderId: 'diving-fish',
      ...maimaiProviders(null),
      restoreStatus: 'ready',
      restoreError: null,
    });
  },
  finishRestore: (session) => {
    if (session) {
      const pending = createMaimaiBoundAccount({
        providerId: 'diving-fish',
        displayName: '水鱼玩家',
        rating: 0,
      });
      set({
        sessionsByGame: withMaimaiSession({}, session),
        session,
        boundAccounts: ensureTestAccount([pending]),
        activeAccountId: pending.id,
        activeGameId: 'maimai',
        activeProviderId: 'diving-fish',
        ...maimaiProviders(session),
        restoreStatus: 'ready',
        restoreError: null,
      });
      return;
    }
    const local = createLocalMaimaiAccount(fixturePlayer.displayName, fixturePlayer.rating);
    set({
      sessionsByGame: {},
      session: null,
      boundAccounts: ensureTestAccount([local]),
      activeAccountId: local.id,
      activeGameId: 'maimai',
      activeProviderId: 'diving-fish',
      ...maimaiProviders(null),
      restoreStatus: 'ready',
      restoreError: null,
    });
  },
  failRestore: (message) => {
    const local = createLocalMaimaiAccount(fixturePlayer.displayName, fixturePlayer.rating);
    set({
      sessionsByGame: {},
      session: null,
      boundAccounts: ensureTestAccount([local]),
      activeAccountId: local.id,
      activeGameId: 'maimai',
      activeProviderId: 'diving-fish',
      ...maimaiProviders(null),
      restoreStatus: 'error',
      restoreError: message,
    });
  },
}));

export async function restoreSession(load: () => Promise<ProviderSession | null>): Promise<void> {
  try {
    useSession.getState().finishRestore(await load());
  } catch {
    useSession.getState().failRestore('无法读取本机登录状态，当前使用脱敏测试数据');
  }
}
