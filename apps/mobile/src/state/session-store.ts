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
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import type { SessionVault, StoredProviderAccount } from '@/storage/secure-session-store';

type LxnsOAuthSession = Extract<ProviderSession, { mode: 'lxns-oauth' }>;

function applyLxnsTokenRotation(accountId: string, next: LxnsOAuthSession) {
  const state = useSession.getState();
  useSession.setState({
    sessionsByAccountId: {
      ...state.sessionsByAccountId,
      [accountId]: next,
    },
    session: state.activeAccountId === accountId ? next : state.session,
  });
  void import('@/storage/secure-session-store').then(({ SecureSessionStore }) => {
    void new SecureSessionStore().updateAccountSession(accountId, next);
  });
}

function maimaiProviders(session: ProviderSession | null, accountId?: string): {
  scoreProvider: ScoreProvider;
  catalogProvider: DetailedCatalogProvider;
} {
  if (session?.mode === 'lxns-oauth') {
    const boundAccountId = accountId ?? useSession.getState().activeAccountId;
    return {
      scoreProvider: new LxnsScoreProvider(session, (next) => {
        applyLxnsTokenRotation(boundAccountId, next);
      }),
      catalogProvider: new LxnsCatalogProvider(),
    };
  }
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

export type SessionRestoreStatus = 'restoring' | 'ready' | 'error';

export type SessionsByAccountId = Record<string, ProviderSession>;

interface SessionState {
  sessionsByAccountId: SessionsByAccountId;
  boundAccounts: BoundAccount[];
  activeAccountId: string;
  activeGameId: GameId;
  activeProviderId: ProviderId | null;
  scoreProvider: ScoreProvider;
  catalogProvider: DetailedCatalogProvider;
  restoreStatus: SessionRestoreStatus;
  restoreError: string | null;
  /** 当前激活账号的会话；切换账号时随之更换。 */
  session: ProviderSession | null;
  setSession: (session: ProviderSession, accountMeta?: {
    displayName: string;
    rating: number;
    playerId?: string;
    providerId?: ProviderId;
  }) => void;
  upsertBoundAccount: (account: BoundAccount) => void;
  updateBoundAccountScore: (accountId: string, scoreDisplay: string, displayName?: string) => void;
  selectBoundAccount: (accountId: string) => void;
  removeBoundAccount: (accountId: string) => void;
  setActiveProviderId: (providerId: ProviderId) => void;
  setActiveGameId: (gameId: GameId) => void;
  clearSession: () => void;
  finishRestore: (vault: SessionVault | ProviderSession | null) => void;
  failRestore: (message: string) => void;
}

function providersForAccount(account: BoundAccount, sessionsByAccountId: SessionsByAccountId) {
  if (account.gameId === 'test' || account.gameId === 'phigros') {
    return {
      scoreProvider: new EmptyScoreProvider(),
      catalogProvider: new EmptyCatalogProvider(),
    };
  }
  return maimaiProviders(sessionsByAccountId[account.id] ?? null, account.id);
}

function ensureTestAccount(accounts: BoundAccount[]): BoundAccount[] {
  if (accounts.some((account) => account.id === TEST_ACCOUNT_ID)) return accounts;
  return [...accounts, createTestBoundAccount()];
}

function withoutLocalPreview(accounts: BoundAccount[]): BoundAccount[] {
  return accounts.filter((account) => account.id !== LOCAL_MAIMAI_ACCOUNT_ID);
}

function withLocalPreviewIfNoMaimai(accounts: BoundAccount[]): BoundAccount[] {
  if (accounts.some((account) => account.gameId === 'maimai' && account.id !== LOCAL_MAIMAI_ACCOUNT_ID)) {
    return accounts;
  }
  if (accounts.some((account) => account.id === LOCAL_MAIMAI_ACCOUNT_ID)) return accounts;
  return [createLocalMaimaiAccount(fixturePlayer.displayName, fixturePlayer.rating), ...accounts];
}

function upsertAccountList(accounts: BoundAccount[], next: BoundAccount): BoundAccount[] {
  const withoutSelf = accounts.filter((account) => account.id !== next.id);
  const withoutLocal = next.gameId === 'maimai' ? withoutLocalPreview(withoutSelf) : withoutSelf;
  return ensureTestAccount([...withoutLocal, next]);
}

function boundFromStored(account: StoredProviderAccount): BoundAccount {
  return createMaimaiBoundAccount({
    providerId: account.providerId,
    displayName: account.displayName,
    rating: Number.parseInt(account.scoreDisplay, 10) || 0,
    playerId: account.id.split(':').slice(2).join(':') || account.displayName,
  });
}

function sessionsMapFromVault(vault: SessionVault): SessionsByAccountId {
  const map: SessionsByAccountId = {};
  for (const account of vault.accounts) {
    map[account.id] = account.session;
  }
  return map;
}

export const useSession = create<SessionState>((set, get) => ({
  sessionsByAccountId: {},
  boundAccounts: ensureTestAccount([
    createLocalMaimaiAccount(fixturePlayer.displayName, fixturePlayer.rating),
  ]),
  activeAccountId: LOCAL_MAIMAI_ACCOUNT_ID,
  session: null,
  activeGameId: 'maimai',
  activeProviderId: 'diving-fish',
  scoreProvider: new FixtureProvider(),
  catalogProvider: new FixtureCatalogProvider(),
  restoreStatus: 'restoring',
  restoreError: null,
  setSession: (session, accountMeta) => {
    const providerId = accountMeta?.providerId
      ?? (session.mode === 'lxns-oauth' ? 'lxns' : 'diving-fish');
    const maimaiAccount = createMaimaiBoundAccount({
      providerId,
      displayName: accountMeta?.displayName
        ?? (providerId === 'lxns' ? '落雪玩家' : '水鱼玩家'),
      rating: accountMeta?.rating ?? 0,
      playerId: accountMeta?.playerId,
    });
    const sessionsByAccountId = {
      ...get().sessionsByAccountId,
      [maimaiAccount.id]: session,
    };
    set({
      sessionsByAccountId,
      session,
      boundAccounts: upsertAccountList(get().boundAccounts, maimaiAccount),
      activeAccountId: maimaiAccount.id,
      activeGameId: 'maimai',
      activeProviderId: providerId,
      ...maimaiProviders(session, maimaiAccount.id),
      restoreStatus: 'ready',
      restoreError: null,
    });
  },
  upsertBoundAccount: (account) => {
    set({ boundAccounts: upsertAccountList(get().boundAccounts, account) });
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
    const { sessionsByAccountId } = get();
    const session = sessionsByAccountId[accountId] ?? null;
    set({
      activeAccountId: account.id,
      activeGameId: account.gameId,
      activeProviderId: account.providerId,
      session,
      ...providersForAccount(account, sessionsByAccountId),
    });
  },
  removeBoundAccount: (accountId) => {
    const { sessionsByAccountId, boundAccounts, activeAccountId } = get();
    const { [accountId]: _removed, ...restSessions } = sessionsByAccountId;
    let nextAccounts = ensureTestAccount(boundAccounts.filter((account) => account.id !== accountId));
    nextAccounts = withLocalPreviewIfNoMaimai(nextAccounts);

    const nextActiveId = activeAccountId === accountId
      ? (nextAccounts.find((account) => account.gameId === 'maimai')?.id
        ?? nextAccounts[0]?.id
        ?? LOCAL_MAIMAI_ACCOUNT_ID)
      : activeAccountId;
    const nextActive = nextAccounts.find((account) => account.id === nextActiveId)
      ?? createLocalMaimaiAccount(fixturePlayer.displayName, fixturePlayer.rating);
    const session = restSessions[nextActive.id] ?? null;

    set({
      sessionsByAccountId: restSessions,
      boundAccounts: nextAccounts.some((account) => account.id === nextActive.id)
        ? nextAccounts
        : ensureTestAccount([nextActive, ...nextAccounts]),
      activeAccountId: nextActive.id,
      activeGameId: nextActive.gameId,
      activeProviderId: nextActive.providerId,
      session,
      ...providersForAccount(nextActive, restSessions),
      restoreStatus: 'ready',
      restoreError: null,
    });
  },
  setActiveProviderId: (providerId) => {
    const { boundAccounts } = get();
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
    });
  },
  setActiveGameId: (gameId) => {
    const match = get().boundAccounts.find((account) => account.gameId === gameId);
    if (match) get().selectBoundAccount(match.id);
  },
  clearSession: () => {
    const local = createLocalMaimaiAccount(fixturePlayer.displayName, fixturePlayer.rating);
    set({
      sessionsByAccountId: {},
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
  finishRestore: (input) => {
    // 兼容旧单会话 restore
    if (input && 'mode' in input) {
      const session = input as ProviderSession;
      const pending = createMaimaiBoundAccount({
        providerId: 'diving-fish',
        displayName: '水鱼玩家',
        rating: 0,
        playerId: 'restored',
      });
      set({
        sessionsByAccountId: { [pending.id]: session },
        session,
        boundAccounts: ensureTestAccount([pending]),
        activeAccountId: pending.id,
        activeGameId: 'maimai',
        activeProviderId: 'diving-fish',
        ...maimaiProviders(session, pending.id),
        restoreStatus: 'ready',
        restoreError: null,
      });
      return;
    }

    const vault = input as SessionVault | null;
    if (vault && vault.accounts.length > 0) {
      const sessionsByAccountId = sessionsMapFromVault(vault);
      const boundAccounts = ensureTestAccount(vault.accounts.map(boundFromStored));
      const activeId = vault.activeAccountId
        && boundAccounts.some((account) => account.id === vault.activeAccountId)
        ? vault.activeAccountId
        : boundAccounts.find((account) => account.gameId === 'maimai')?.id
          ?? boundAccounts[0].id;
      const active = boundAccounts.find((account) => account.id === activeId)!;
      const session = sessionsByAccountId[active.id] ?? null;
      set({
        sessionsByAccountId,
        session,
        boundAccounts,
        activeAccountId: active.id,
        activeGameId: active.gameId,
        activeProviderId: active.providerId,
        ...providersForAccount(active, sessionsByAccountId),
        restoreStatus: 'ready',
        restoreError: null,
      });
      return;
    }

    const local = createLocalMaimaiAccount(fixturePlayer.displayName, fixturePlayer.rating);
    set({
      sessionsByAccountId: {},
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
      sessionsByAccountId: {},
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

export async function restoreSession(
  load: () => Promise<SessionVault | ProviderSession | null>,
): Promise<void> {
  try {
    useSession.getState().finishRestore(await load());
  } catch {
    useSession.getState().failRestore('无法读取本机登录状态，当前使用脱敏测试数据');
  }
}
