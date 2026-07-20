import { create } from 'zustand';
import {
  createMaimaiBoundAccount,
  createPhigrosBoundAccount,
  LOCAL_MAIMAI_ACCOUNT_ID,
  type BoundAccount,
} from '@/domain/bound-account';
import type { GameId, ProviderId, RemoteProviderId } from '@/domain/game-bind-options';
import type { AnyScoreProvider, DetailedCatalogProvider, ProviderSession } from '@/providers/contracts';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { EmptyCatalogProvider, EmptyScoreProvider } from '@/providers/empty-provider';
import { LxnsCatalogProvider } from '@/providers/lxns-catalog-provider';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { LocalMaimaiScoreProvider } from '@/providers/local-score-provider';
import { MaxedMaimaiTestProvider } from '@/providers/maxed-maimai-test-provider';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import type { SessionVault, StoredProviderAccount } from '@/storage/secure-session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const localRepository = new SqliteSnapshotRepository();

/** 无已绑定账号时的占位 ID；页面按空数据处理。 */
export const UNBOUND_ACCOUNT_ID = 'maimai:unbound';

type LxnsOAuthSession = Extract<ProviderSession, { mode: 'lxns-oauth' }>;

export async function applyLxnsTokenRotation(accountId: string, next: LxnsOAuthSession): Promise<void> {
  const state = useSession.getState();
  useSession.setState({
    sessionsByAccountId: {
      ...state.sessionsByAccountId,
      [accountId]: next,
    },
    session: state.activeAccountId === accountId ? next : state.session,
  });
  const { SecureSessionStore } = await import('@/storage/secure-session-store');
  await new SecureSessionStore().updateAccountSession(accountId, next);
}

function emptyProviders(): {
  scoreProvider: AnyScoreProvider;
  catalogProvider: DetailedCatalogProvider;
} {
  return {
    scoreProvider: new EmptyScoreProvider(),
    catalogProvider: new EmptyCatalogProvider(),
  };
}

function maimaiProviders(
  providerId: ProviderId,
  session: ProviderSession | null,
  accountId?: string,
  displayName?: string,
): {
  scoreProvider: AnyScoreProvider;
  catalogProvider: DetailedCatalogProvider;
} {
  if (providerId === 'local') {
    return {
      scoreProvider: new LocalMaimaiScoreProvider(
        localRepository,
        accountId ?? LOCAL_MAIMAI_ACCOUNT_ID,
        displayName ?? '本地玩家',
      ),
      catalogProvider: new LxnsCatalogProvider(),
    };
  }
  if (providerId === 'maimai-test') {
    return {
      scoreProvider: new MaxedMaimaiTestProvider(
        accountId,
        displayName ?? '示例账号',
      ),
      catalogProvider: new LxnsCatalogProvider(),
    };
  }
  if (providerId === 'lxns' && session?.mode === 'lxns-oauth') {
    const boundAccountId = accountId ?? useSession.getState().activeAccountId;
    return {
      scoreProvider: new LxnsScoreProvider(
        session,
        (next) => applyLxnsTokenRotation(boundAccountId, next),
      ),
      catalogProvider: new LxnsCatalogProvider(),
    };
  }
  if (providerId === 'diving-fish' && session) {
    return {
      scoreProvider: new DivingFishProvider(session),
      catalogProvider: new LxnsCatalogProvider(),
    };
  }
  return emptyProviders();
}

function phigrosProviders(
  account: BoundAccount,
  sessionsByAccountId: SessionsByAccountId,
): {
  scoreProvider: AnyScoreProvider;
  catalogProvider: DetailedCatalogProvider;
} {
  const session = sessionsByAccountId[account.id] ?? null;
  if (session?.mode === 'phi-session') {
    return {
      scoreProvider: new PhigrosScoreProvider(session),
      catalogProvider: new PhigrosCatalogProvider() as unknown as DetailedCatalogProvider,
    };
  }
  return emptyProviders();
}

export type SessionRestoreStatus = 'restoring' | 'ready' | 'error';

export type SessionsByAccountId = Record<string, ProviderSession>;

interface SessionState {
  sessionsByAccountId: SessionsByAccountId;
  boundAccounts: BoundAccount[];
  activeAccountId: string;
  activeGameId: GameId;
  activeProviderId: ProviderId | null;
  scoreProvider: AnyScoreProvider;
  catalogProvider: DetailedCatalogProvider;
  restoreStatus: SessionRestoreStatus;
  restoreError: string | null;
  /** 当前激活账号的会话；切换账号时随之更换。 */
  session: ProviderSession | null;
  setSession: (session: ProviderSession, accountMeta?: {
    displayName: string;
    rating: number;
    playerId?: string;
    providerId?: RemoteProviderId;
  }) => void;
  upsertBoundAccount: (account: BoundAccount) => void;
  updateBoundAccountScore: (accountId: string, scoreDisplay: string, displayName?: string) => void;
  renameLocalAccount: (accountId: string, displayName: string) => void;
  selectBoundAccount: (accountId: string) => void;
  removeBoundAccount: (accountId: string) => void;
  setActiveProviderId: (providerId: ProviderId) => void;
  setActiveGameId: (gameId: GameId) => void;
  clearSession: () => void;
  finishRestore: (vault: SessionVault | ProviderSession | null, optionalAccounts?: BoundAccount[]) => void;
  failRestore: (message: string) => void;
}

function providersForAccount(account: BoundAccount, sessionsByAccountId: SessionsByAccountId) {
  if (account.gameId === 'test' || !account.providerId) {
    return emptyProviders();
  }
  if (account.gameId === 'phigros') {
    return phigrosProviders(account, sessionsByAccountId);
  }
  return maimaiProviders(
    account.providerId,
    sessionsByAccountId[account.id] ?? null,
    account.id,
    account.displayName,
  );
}

function dedupeAccounts(accounts: BoundAccount[]): BoundAccount[] {
  const seen = new Set<string>();
  const result: BoundAccount[] = [];
  for (const account of accounts) {
    if (seen.has(account.id)) continue;
    seen.add(account.id);
    result.push(account);
  }
  return result;
}

function upsertAccountList(accounts: BoundAccount[], next: BoundAccount): BoundAccount[] {
  return dedupeAccounts([...accounts.filter((account) => account.id !== next.id), next]);
}

function unboundState(extra?: Partial<SessionState>) {
  return {
    sessionsByAccountId: {} as SessionsByAccountId,
    session: null as ProviderSession | null,
    boundAccounts: [] as BoundAccount[],
    activeAccountId: UNBOUND_ACCOUNT_ID,
    activeGameId: 'maimai' as GameId,
    activeProviderId: null as ProviderId | null,
    ...emptyProviders(),
    ...extra,
  };
}

function pickActiveAccount(
  accounts: BoundAccount[],
  sessionsByAccountId: SessionsByAccountId,
  preferredId: string | null | undefined,
): BoundAccount | undefined {
  if (preferredId) {
    const preferred = accounts.find((account) => account.id === preferredId);
    if (preferred) return preferred;
  }
  return accounts.find((account) => account.gameId === 'maimai' && sessionsByAccountId[account.id])
    ?? accounts.find((account) => (
      account.gameId === 'maimai'
      && account.providerId !== 'local'
      && account.providerId !== 'maimai-test'
    ))
    ?? accounts.find((account) => account.gameId === 'maimai')
    ?? accounts[0];
}

function activateAccount(
  accounts: BoundAccount[],
  sessionsByAccountId: SessionsByAccountId,
  preferredId: string | null | undefined,
) {
  const boundAccounts = dedupeAccounts(accounts);
  const active = pickActiveAccount(boundAccounts, sessionsByAccountId, preferredId);
  if (!active) {
    return unboundState({ boundAccounts, restoreStatus: 'ready' as const, restoreError: null });
  }
  const session = sessionsByAccountId[active.id] ?? null;
  return {
    sessionsByAccountId,
    session,
    boundAccounts,
    activeAccountId: active.id,
    activeGameId: active.gameId,
    activeProviderId: active.providerId,
    ...providersForAccount(active, sessionsByAccountId),
    restoreStatus: 'ready' as const,
    restoreError: null,
  };
}

function boundFromStored(account: StoredProviderAccount): BoundAccount {
  if (account.gameId === 'phigros' && account.providerId === 'phi-taptap') {
    return createPhigrosBoundAccount({
      playerId: account.displayName,
      rating: Number.parseInt(account.scoreDisplay, 10) || 0,
    });
  }
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
  ...unboundState(),
  restoreStatus: 'restoring',
  restoreError: null,
  setSession: (session, accountMeta) => {
    if (session.mode === 'phi-session') {
      const phigrosAccount = createPhigrosBoundAccount({
        playerId: session.playerId,
        rating: 0,
      });
      const sessionsByAccountId = {
        ...get().sessionsByAccountId,
        [phigrosAccount.id]: session,
      };
      set({
        sessionsByAccountId,
        session,
        boundAccounts: upsertAccountList(get().boundAccounts, phigrosAccount),
        activeAccountId: phigrosAccount.id,
        activeGameId: 'phigros',
        activeProviderId: 'phi-taptap',
        ...phigrosProviders(phigrosAccount, sessionsByAccountId),
        restoreStatus: 'ready',
        restoreError: null,
      });
      return;
    }

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
      ...maimaiProviders(providerId, session, maimaiAccount.id),
      restoreStatus: 'ready',
      restoreError: null,
    });
  },
  upsertBoundAccount: (account) => {
    set({ boundAccounts: upsertAccountList(get().boundAccounts, account) });
  },
  updateBoundAccountScore: (accountId, scoreDisplay, displayName) => {
    if (!get().boundAccounts.some((account) => account.id === accountId)) return;
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
  renameLocalAccount: (accountId, displayName) => {
    const current = get();
    const account = current.boundAccounts.find(
      (item) => item.id === accountId && item.providerId === 'local',
    );
    if (!account) return;
    const renamed = { ...account, displayName };
    set({
      boundAccounts: current.boundAccounts.map((item) => (
        item.id === accountId ? renamed : item
      )),
      ...(current.activeAccountId === accountId
        ? providersForAccount(renamed, current.sessionsByAccountId)
        : {}),
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
    const nextAccounts = dedupeAccounts(boundAccounts.filter((account) => account.id !== accountId));
    set(activateAccount(
      nextAccounts,
      restSessions,
      activeAccountId === accountId ? null : activeAccountId,
    ));
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
    const kept = get().boundAccounts.filter(
      (account) => account.providerId === 'local' || account.providerId === 'maimai-test',
    );
    set(activateAccount(kept, {}, kept[0]?.id ?? null));
  },
  finishRestore: (input, optionalAccounts = []) => {
    // 兼容旧单会话 restore
    if (input && 'mode' in input) {
      const session = input as ProviderSession;
      const pending = createMaimaiBoundAccount({
        providerId: 'diving-fish',
        displayName: '水鱼玩家',
        rating: 0,
        playerId: 'restored',
      });
      set(activateAccount(
        [...optionalAccounts, pending],
        { [pending.id]: session },
        pending.id,
      ));
      return;
    }

    const vault = input as SessionVault | null;
    if (vault) {
      const sessionsByAccountId = sessionsMapFromVault(vault);
      set(activateAccount(
        [...optionalAccounts, ...vault.accounts.map(boundFromStored)],
        sessionsByAccountId,
        vault.activeAccountId,
      ));
      return;
    }

    set(activateAccount(optionalAccounts, {}, optionalAccounts[0]?.id ?? null));
  },
  failRestore: (message) => {
    set({
      ...unboundState(),
      restoreStatus: 'error',
      restoreError: message,
    });
  },
}));

export async function restoreSession(
  load: () => Promise<SessionVault | ProviderSession | null>,
  loadOptionalAccounts?: () => Promise<BoundAccount[]>,
): Promise<void> {
  try {
    const input = await load();
    const optionalAccounts = loadOptionalAccounts
      ? await loadOptionalAccounts().catch(() => [])
      : [];
    useSession.getState().finishRestore(input, optionalAccounts);
  } catch {
    useSession.getState().failRestore('无法读取本机登录状态，当前未加载任何账号');
  }
}
