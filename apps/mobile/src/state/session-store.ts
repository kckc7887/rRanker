import { captureResourceWrites, invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { create } from 'zustand';
import {
  boundAccountFromStored,
  createMajdataBoundAccount,
  createRizlineBoundAccount,
  createChunithmBoundAccount,
  createMaimaiBoundAccount,
  createPhigrosBoundAccount,
  type BoundAccount,
} from '@/domain/bound-account';
import type { GameId, ProviderId, RemoteProviderId } from '@/domain/game-bind-options';
import type { AnyScoreProvider, DetailedCatalogProvider, ProviderSession, RizlineSession } from '@/providers/contracts';
import {
  credentialIdsMapFromVault,
  sessionsMapFromVault,
  type SessionVault,
} from '@/storage/secure-session-store';
import { startTimer } from '@/utils/startup-timing';
import { createSessionProviders } from '@/services/session-providers';
import { clearOsuRotationCache, osuRotationAncestors, osuRotationMayReplace } from '@/providers/osu-oauth';

/** 无已绑定账号时的占位 ID；页面按空数据处理。 */
export const UNBOUND_ACCOUNT_ID = 'maimai:unbound';

export type SessionsByAccountId = Record<string, ProviderSession>;

type LxnsOAuthSession = Extract<ProviderSession, { mode: 'lxns-oauth' }>;
type OsuOAuthSession = Extract<ProviderSession, { mode: 'osu-oauth' }>;

function sessionsWithSharedCredential(
  sessionsByAccountId: SessionsByAccountId,
  credentialIdsByAccountId: Record<string, string>,
  accountId: string,
  credentialId: string,
  session: ProviderSession,
): SessionsByAccountId {
  const next = {
    ...sessionsByAccountId,
    [accountId]: session,
  };
  for (const [linkedAccountId, linkedCredentialId] of Object.entries(credentialIdsByAccountId)) {
    if (linkedCredentialId === credentialId) next[linkedAccountId] = session;
  }
  return next;
}

export async function applyLxnsTokenRotation(accountId: string, next: LxnsOAuthSession): Promise<void> {
  const state = useSession.getState();
  const credentialId = state.credentialIdsByAccountId[accountId] ?? '';
  const sessionsByAccountId = sessionsWithSharedCredential(
    state.sessionsByAccountId,
    state.credentialIdsByAccountId,
    accountId,
    credentialId,
    next,
  );
  const activeAccount = state.boundAccounts.find((account) => account.id === state.activeAccountId);
  const activeScoreProvider = sessionsByAccountId[state.activeAccountId] === next
    && activeAccount?.gameId === 'maimai'
    && activeAccount.providerId === 'lxns'
    ? createSessionProviders(activeAccount, next, applyLxnsTokenRotation).scoreProvider
    : state.scoreProvider;
  useSession.setState({
    sessionsByAccountId,
    session: sessionsByAccountId[state.activeAccountId] === next ? next : state.session,
    scoreProvider: activeScoreProvider,
  });
  const { SecureSessionStore } = await import('@/storage/secure-session-store');
  await new SecureSessionStore().updateAccountSession(accountId, next);
}

/** osu! 令牌轮换：新会话广播到共享 credential 的所有模式账号并持久化。 */
export async function applyOsuTokenRotation(
  accountId: string,
  next: OsuOAuthSession,
  expected?: OsuOAuthSession,
): Promise<void> {
  const state = useSession.getState();
  const current = state.sessionsByAccountId[accountId];
  if (expected && current?.mode === 'osu-oauth' && !osuRotationMayReplace(current.refreshToken, next.refreshToken)) return;
  const { SecureSessionStore } = await import('@/storage/secure-session-store');
  await new SecureSessionStore().updateAccountSession(accountId, next, expected ? {
    acceptedOsuRefreshTokens: [expected.refreshToken, ...osuRotationAncestors(next.refreshToken)],
  } : undefined);
  const latest = useSession.getState();
  const latestSession = latest.sessionsByAccountId[accountId];
  if (expected && latestSession?.mode === 'osu-oauth' && !osuRotationMayReplace(latestSession.refreshToken, next.refreshToken)) return;
  const credentialId = latest.credentialIdsByAccountId[accountId] ?? '';
  const sessionsByAccountId = sessionsWithSharedCredential(
    latest.sessionsByAccountId,
    latest.credentialIdsByAccountId,
    accountId,
    credentialId,
    next,
  );
  useSession.setState({
    sessionsByAccountId,
    session: sessionsByAccountId[latest.activeAccountId] === next ? next : latest.session,
  });
}

function sameRizlineToken(current: ProviderSession | undefined, expected: RizlineSession): boolean {
  return current?.mode === 'rizline' && current.token === expected.token;
}

export async function applyRizlineSessionRotation(
  accountId: string,
  next: RizlineSession,
  expected: RizlineSession,
  signal?: AbortSignal,
): Promise<void> {
  const assertCurrent = captureResourceWrites('rizline', signal, accountId);
  assertCurrent();
  if (!sameRizlineToken(useSession.getState().sessionsByAccountId[accountId], expected)) return;
  const { SecureSessionStore } = await import('@/storage/secure-session-store');
  assertCurrent();
  await new SecureSessionStore().updateAccountSession(accountId, next, { expected, signal });
  assertCurrent();
  const state = useSession.getState();
  if (!sameRizlineToken(state.sessionsByAccountId[accountId], expected) || !state.boundAccounts.some(account => account.id === accountId)) return;
  const credentialId = state.credentialIdsByAccountId[accountId];
  const sessionsByAccountId = credentialId
    ? sessionsWithSharedCredential(state.sessionsByAccountId, state.credentialIdsByAccountId, accountId, credentialId, next)
    : { ...state.sessionsByAccountId, [accountId]: next };
  useSession.setState({ sessionsByAccountId, session: sessionsByAccountId[state.activeAccountId] ?? state.session });
}

export type SessionRestoreStatus = 'restoring' | 'ready' | 'error';

interface SessionState {
  sessionsByAccountId: SessionsByAccountId;
  credentialIdsByAccountId: Record<string, string>;
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
    rating: number | null;
    playerId?: string;
    providerId?: RemoteProviderId;
    gameId?: GameId;
    accountId?: string;
    credentialId?: string;
    avatarUrl?: string | null;
    ratingPossession?: string | null;
  }) => void;
  upsertBoundAccount: (account: BoundAccount) => void;
  updateBoundAccountScore: (
    accountId: string,
    scoreDisplay: string,
    displayName?: string,
    avatarUrl?: string | null,
    challengeModeRank?: number | null,
    ratingPossession?: string | null,
  ) => void;
  renameLocalAccount: (accountId: string, displayName: string) => void;
  selectBoundAccount: (accountId: string) => void;
  removeBoundAccount: (accountId: string) => void;
  /** osu! 多模式绑定激活：一次写入多个模式账号（共享 credential）并激活其中一个。 */
  setOsuBinding: (input: {
    accounts: BoundAccount[];
    credentialId: string;
    session: OsuOAuthSession;
    activeAccountId: string;
  }) => void;
  setActiveProviderId: (providerId: ProviderId) => void;
  setActiveGameId: (gameId: GameId) => void;
  clearSession: () => void;
  finishRestore: (vault: SessionVault | ProviderSession | null, optionalAccounts?: BoundAccount[]) => void;
  failRestore: (message: string) => void;
}

function providersForAccount(account: BoundAccount | null, sessionsByAccountId: SessionsByAccountId) {
  return createSessionProviders(account, account ? sessionsByAccountId[account.id] ?? null : null, applyLxnsTokenRotation);
}

function activeAccountFields(account: BoundAccount, sessionsByAccountId: SessionsByAccountId) {
  return {
    session: sessionsByAccountId[account.id] ?? null,
    activeAccountId: account.id,
    activeGameId: account.gameId,
    activeProviderId: account.providerId,
    ...providersForAccount(account, sessionsByAccountId),
  };
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
    credentialIdsByAccountId: {} as Record<string, string>,
    session: null as ProviderSession | null,
    boundAccounts: [] as BoundAccount[],
    activeAccountId: UNBOUND_ACCOUNT_ID,
    activeGameId: 'maimai' as GameId,
    activeProviderId: null as ProviderId | null,
    ...providersForAccount(null, {}),
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
  credentialIdsByAccountId: Record<string, string>,
  preferredId: string | null | undefined,
) {
  const boundAccounts = dedupeAccounts(accounts);
  const active = pickActiveAccount(boundAccounts, sessionsByAccountId, preferredId);
  if (!active) {
    return unboundState({ boundAccounts, restoreStatus: 'ready' as const, restoreError: null });
  }
  return {
    sessionsByAccountId,
    credentialIdsByAccountId,
    boundAccounts,
    ...activeAccountFields(active, sessionsByAccountId),
    restoreStatus: 'ready' as const,
    restoreError: null,
  };
}

function bindSessionAccount(
  state: SessionState,
  account: BoundAccount,
  session: ProviderSession,
  credentialId = `credential:${account.id}`,
  shareCredential = false,
) {
  const sessionsByAccountId = shareCredential
    ? sessionsWithSharedCredential(state.sessionsByAccountId, state.credentialIdsByAccountId, account.id, credentialId, session)
    : { ...state.sessionsByAccountId, [account.id]: session };
  return activateAccount(
    upsertAccountList(state.boundAccounts, account),
    sessionsByAccountId,
    { ...state.credentialIdsByAccountId, [account.id]: credentialId },
    account.id,
  );
}

export const useSession = create<SessionState>((set, get) => ({
  ...unboundState(),
  restoreStatus: 'restoring',
  restoreError: null,
  setSession: (session, accountMeta) => {
    if (session.mode === 'rizline' && accountMeta?.gameId === 'rizline' && accountMeta.playerId) {
      const account = createRizlineBoundAccount({ userId: accountMeta.playerId,
        username: accountMeta.displayName, totalRks: accountMeta.rating });
      set(bindSessionAccount(get(), account, session, accountMeta.credentialId));
      return;
    }
    if (accountMeta?.gameId === 'majdata-net' && accountMeta.accountId) {
      const account = createMajdataBoundAccount({ accountId: accountMeta.accountId,
        displayName: accountMeta.displayName, avatarUrl: accountMeta.avatarUrl,
        scoreDisplay: get().boundAccounts.find(item => item.id === accountMeta.accountId)?.scoreDisplay });
      set(bindSessionAccount(get(), account, session, accountMeta.credentialId));
      return;
    }
    if (session.mode === 'phi-session') {
      const phigrosAccount = createPhigrosBoundAccount({
        playerId: session.playerId,
        rating: 0,
      });
      set(bindSessionAccount(get(), phigrosAccount, session, accountMeta?.credentialId));
      return;
    }

    const providerId = accountMeta?.providerId
      ?? (session.mode === 'lxns-oauth' ? 'lxns' : 'diving-fish');
    if (accountMeta?.gameId === 'chunithm') {
      const chunithmAccount = createChunithmBoundAccount({
        accountId: accountMeta.accountId,
        displayName: accountMeta.displayName,
        rating: accountMeta.rating,
        playerId: accountMeta.playerId,
        avatarUrl: accountMeta.avatarUrl,
        ratingPossession: accountMeta.ratingPossession,
      });
      set(bindSessionAccount(get(), chunithmAccount, session, accountMeta.credentialId, true));
      return;
    }
    const maimaiAccount = createMaimaiBoundAccount({
      accountId: accountMeta?.accountId,
      providerId,
      displayName: accountMeta?.displayName
        ?? (providerId === 'lxns' ? '落雪玩家' : '水鱼玩家'),
      rating: accountMeta?.rating ?? 0,
      playerId: accountMeta?.playerId,
    });
    const visibleMaimaiAccount = accountMeta?.rating === null
      ? { ...maimaiAccount, scoreDisplay: '—' }
      : maimaiAccount;
    set(bindSessionAccount(get(), visibleMaimaiAccount, session, accountMeta?.credentialId, true));
  },
  upsertBoundAccount: (account) => {
    set({ boundAccounts: upsertAccountList(get().boundAccounts, account) });
  },
  updateBoundAccountScore: (
    accountId,
    scoreDisplay,
    displayName,
    avatarUrl,
    challengeModeRank,
    ratingPossession,
  ) => {
    const accounts = get().boundAccounts;
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return;
    const next = {
      ...account,
      scoreDisplay,
      displayName: displayName ?? account.displayName,
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      ...(challengeModeRank !== undefined ? { challengeModeRank } : {}),
      ...(ratingPossession !== undefined ? { ratingPossession } : {}),
    };
    if (account.scoreDisplay === next.scoreDisplay && account.displayName === next.displayName
      && account.avatarUrl === next.avatarUrl && account.challengeModeRank === next.challengeModeRank
      && account.ratingPossession === next.ratingPossession) return;
    set({ boundAccounts: accounts.map((item) => item === account ? next : item) });
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
    set(activeAccountFields(account, sessionsByAccountId));
  },
  removeBoundAccount: (accountId) => {
    invalidateResourceWrites('account:' + accountId);
    const {
      sessionsByAccountId,
      credentialIdsByAccountId,
      boundAccounts,
      activeAccountId,
    } = get();
    const removed = sessionsByAccountId[accountId];
    const { [accountId]: _removed, ...restSessions } = sessionsByAccountId;
    const { [accountId]: _removedCredential, ...restCredentialIds } = credentialIdsByAccountId;
    const nextAccounts = dedupeAccounts(boundAccounts.filter((account) => account.id !== accountId));
    if (removed?.mode === 'osu-oauth'
      && !Object.values(restSessions).some((session) => session?.mode === 'osu-oauth')) {
      clearOsuRotationCache();
    }
    set(activateAccount(
      nextAccounts,
      restSessions,
      restCredentialIds,
      activeAccountId === accountId ? null : activeAccountId,
    ));
  },
  setOsuBinding: (input) => {
    const nextSessions = { ...get().sessionsByAccountId };
    const nextCredentialIds = { ...get().credentialIdsByAccountId };
    for (const account of input.accounts) {
      nextSessions[account.id] = input.session;
      nextCredentialIds[account.id] = input.credentialId;
    }
    const nextAccounts = dedupeAccounts([
      ...get().boundAccounts,
      ...input.accounts,
    ]);
    const active = input.accounts.find((account) => account.id === input.activeAccountId)
      ?? input.accounts[0];
    if (!active) return;
    set({
      sessionsByAccountId: nextSessions,
      credentialIdsByAccountId: nextCredentialIds,
      boundAccounts: nextAccounts,
      ...activeAccountFields(active, nextSessions),
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
    clearOsuRotationCache();
    const kept = get().boundAccounts.filter(
      (account) => account.providerId === 'local'
        || account.providerId === 'maimai-test'
        || account.providerId === 'chunithm-test'
        || account.providerId === 'phigros-test'
        || account.providerId === 'musedash-test'
        || account.providerId === 'chunithm-temp'
        || account.providerId === 'tuf'
        || account.providerId === 'phira-community'
        || account.providerId === 'musedash-moe',
    );
    set(activateAccount(kept, {}, {}, kept[0]?.id ?? null));
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
        { [pending.id]: `credential:${pending.id}` },
        pending.id,
      ));
      return;
    }

    const vault = input as SessionVault | null;
    if (vault) {
      const sessionsByAccountId = sessionsMapFromVault(vault);
      const credentialIdsByAccountId = credentialIdsMapFromVault(vault);
      const hasFormalChunithmAccount = vault.accounts.some(
        (account) => account.gameId === 'chunithm' && account.providerId === 'lxns',
      );
      const compatibleOptionalAccounts = hasFormalChunithmAccount
        ? optionalAccounts.filter((account) => account.providerId !== 'chunithm-temp')
        : optionalAccounts;
      set(activateAccount(
        [...compatibleOptionalAccounts, ...vault.accounts.map(boundAccountFromStored)],
        sessionsByAccountId,
        credentialIdsByAccountId,
        vault.activeAccountId,
      ));
      return;
    }

    set(activateAccount(optionalAccounts, {}, {}, optionalAccounts[0]?.id ?? null));
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
    const stopLoad = startTimer('restore.loadVault');
    const input = await load();
    stopLoad();
    const stopOptional = startTimer('restore.loadOptionalAccounts');
    const optionalAccounts = loadOptionalAccounts
      ? await loadOptionalAccounts().catch(() => [])
      : [];
    stopOptional();
    useSession.getState().finishRestore(input, optionalAccounts);
  } catch {
    useSession.getState().failRestore('无法读取本机登录状态，当前未加载任何账号');
  }
}
