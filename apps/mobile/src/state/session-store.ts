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
import { lxnsRotationAncestors, lxnsRotationMayReplace } from '@/providers/lxns-oauth';
import type { LxnsTokenRotationUpdate } from '@/providers/lxns-oauth-request';
import { recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';

/** 无已绑定账号时的占位 ID；页面按空数据处理。 */
export const UNBOUND_ACCOUNT_ID = 'maimai:unbound';

export type SessionsByAccountId = Record<string, ProviderSession>;

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

/** 仍关联某个凭据的账号，按凭据去重后取当前内存会话。 */
function sessionsByCredential(
  sessionsByAccountId: SessionsByAccountId,
  credentialIdsByAccountId: Record<string, string>,
): Map<string, ProviderSession> {
  const byCredential = new Map<string, ProviderSession>();
  for (const [accountId, credentialId] of Object.entries(credentialIdsByAccountId)) {
    const session = sessionsByAccountId[accountId];
    if (session && !byCredential.has(credentialId)) byCredential.set(credentialId, session);
  }
  return byCredential;
}

/** 可轮换的 OAuth 会话：落雪与 osu! 共用同一套凭据世代判定。 */
type RotatableOAuthSession = Extract<ProviderSession, { mode: 'lxns-oauth' | 'osu-oauth' }>;

/** 一个协议的轮换世代规则：协议差异只体现在 refresh token 的前代关系里。 */
type OAuthRotationLineage = {
  mode: RotatableOAuthSession['mode'];
  mayReplace: (currentRefreshToken: string, nextRefreshToken: string) => boolean;
  ancestors: (nextRefreshToken: string) => readonly string[];
};

const LXNS_ROTATION_LINEAGE: OAuthRotationLineage = {
  mode: 'lxns-oauth',
  mayReplace: lxnsRotationMayReplace,
  ancestors: lxnsRotationAncestors,
};

const OSU_ROTATION_LINEAGE: OAuthRotationLineage = {
  mode: 'osu-oauth',
  mayReplace: osuRotationMayReplace,
  ancestors: osuRotationAncestors,
};

/**
 * 解析本次轮换应提交到哪个凭据：以请求开始时消费掉的会话世代为准，
 * 而不是发起账号当前指向的凭据，因此同 ID 重绑、重新授权、发起账号被解绑
 * （共享凭据仍被其它账号引用）都不会写到错误的凭据上。
 */
function resolveRotationCredential(
  sessionsByAccountId: SessionsByAccountId,
  credentialIdsByAccountId: Record<string, string>,
  lineage: OAuthRotationLineage,
  next: RotatableOAuthSession,
  acceptedRefreshTokens: readonly string[],
): string | null {
  for (const [credentialId, session] of sessionsByCredential(sessionsByAccountId, credentialIdsByAccountId)) {
    if (session.mode !== lineage.mode) continue;
    if (acceptedRefreshTokens.includes(session.refreshToken)) return credentialId;
  }
  return null;
}

/** 只更新仍关联该凭据的账号；发起账号已被解绑时不会把它的会话写回来。 */
function sessionsForCredentialUpdate(
  sessionsByAccountId: SessionsByAccountId,
  credentialIdsByAccountId: Record<string, string>,
  credentialId: string,
  session: ProviderSession,
): SessionsByAccountId {
  const next = { ...sessionsByAccountId };
  for (const [linkedAccountId, linkedCredentialId] of Object.entries(credentialIdsByAccountId)) {
    if (linkedCredentialId === credentialId) next[linkedAccountId] = session;
  }
  return next;
}

/** OAuth 轮换提交结果：pending-persist 表示内存已更新、本机落盘失败待补写。 */
export type OAuthRotationCommitResult = 'applied' | 'pending-persist' | 'stale' | 'removed';

/** 落盘失败仍待提交的轮换：上游已消费旧 refresh token，不能再重新刷新一次。 */
type PendingRotationWrite = {
  accountId: string;
  session: RotatableOAuthSession;
  acceptedRefreshTokens: readonly string[];
  attempts: number;
};

const pendingRotationWrites = new Map<string, PendingRotationWrite>();
/** 有界退避：3 次自动补写后停止，保留可观察摘要等待下次显式触发。 */
const PENDING_ROTATION_RETRY_DELAYS_MS = [5_000, 30_000, 120_000] as const;
let pendingRotationRetryTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRotationRetryInFlight: Promise<number> | null = null;

/** 仍未落盘的轮换摘要（凭据 id、发起账号、已尝试次数）；不包含 token 本身。 */
export function pendingRotationWritesSnapshot(): readonly {
  credentialId: string;
  accountId: string;
  attempts: number;
}[] {
  return [...pendingRotationWrites].map(([credentialId, entry]) => ({
    credentialId,
    accountId: entry.accountId,
    attempts: entry.attempts,
  }));
}

function schedulePendingRotationRetry(): void {
  if (pendingRotationWrites.size === 0 || pendingRotationRetryTimer !== null) return;
  const pendingAttempts = [...pendingRotationWrites.values()].map((entry) => entry.attempts);
  const delay = PENDING_ROTATION_RETRY_DELAYS_MS[
    Math.min(Math.min(...pendingAttempts), PENDING_ROTATION_RETRY_DELAYS_MS.length - 1)
  ]!;
  pendingRotationRetryTimer = setTimeout(() => {
    pendingRotationRetryTimer = null;
    void retryPendingRotationWrites();
  }, delay);
  // 定时器不应阻止进程或测试退出。
  (pendingRotationRetryTimer as unknown as { unref?: () => void }).unref?.();
}

/**
 * 补写仍挂起的轮换。幂等：同一时刻只跑一次；单项成功或已过期就丢弃，
 * 落盘继续失败按有界退避重试，超过上限后留下可观察摘要不再自动重试。
 */
export async function retryPendingRotationWrites(): Promise<number> {
  if (pendingRotationRetryInFlight) return pendingRotationRetryInFlight;
  if (pendingRotationWrites.size === 0) return 0;
  const attempt = (async () => {
    const { SecureSessionStore } = await import('@/storage/secure-session-store');
    const store = new SecureSessionStore();
    let applied = 0;
    for (const [credentialId, entry] of [...pendingRotationWrites]) {
      try {
        const result = await store.updateCredentialSession(credentialId, entry.session, {
          acceptedRefreshTokens: entry.acceptedRefreshTokens,
        });
        if (result === 'applied') {
          applied += 1;
          pendingRotationWrites.delete(credentialId);
          void recordRuntimeDiagnostic('session', { credentialWrite: 'applied' });
          continue;
        }
        // 已不属于该世代、或凭据与关联账号都已消失：过期任务不再补写。
        pendingRotationWrites.delete(credentialId);
        void recordRuntimeDiagnostic('session', { credentialWrite: 'dropped', reason: result });
      } catch {
        const attempts = entry.attempts + 1;
        if (attempts > PENDING_ROTATION_RETRY_DELAYS_MS.length) {
          pendingRotationWrites.delete(credentialId);
          void recordRuntimeDiagnostic('session', { credentialWrite: 'abandoned', attempts });
        } else {
          pendingRotationWrites.set(credentialId, { ...entry, attempts });
          void recordRuntimeDiagnostic('session', { credentialWrite: 'retry-scheduled', attempts });
        }
      }
    }
    if (pendingRotationWrites.size > 0) schedulePendingRotationRetry();
    return applied;
  })().finally(() => {
    pendingRotationRetryInFlight = null;
  });
  pendingRotationRetryInFlight = attempt;
  return attempt;
}

/** 测试用：清空挂起轮换与定时器。 */
export function resetPendingRotationWritesForTests(): void {
  pendingRotationWrites.clear();
  if (pendingRotationRetryTimer !== null) {
    clearTimeout(pendingRotationRetryTimer);
    pendingRotationRetryTimer = null;
  }
}

/** 提交一次 OAuth 轮换：只更新仍关联该凭据的账号，落盘失败转入有界补写。 */
async function commitOAuthRotation(input: {
  accountId: string;
  lineage: OAuthRotationLineage;
  next: RotatableOAuthSession;
  acceptedRefreshTokens: readonly string[];
  /** 落雪舞萌账号的 Provider 持有会话实例，提交后需要重建；osu! 的 Provider 另行创建。 */
  refreshActiveMaimaiProvider?: boolean;
}): Promise<OAuthRotationCommitResult> {
  const state = useSession.getState();
  const credentialId = resolveRotationCredential(
    state.sessionsByAccountId,
    state.credentialIdsByAccountId,
    input.lineage,
    input.next,
    input.acceptedRefreshTokens,
  );
  if (!credentialId) {
    // 发起账号已不在绑定列表且没有账号仍引用该凭据时按已移除处理，否则视为过期结果。
    return state.credentialIdsByAccountId[input.accountId] ? 'stale' : 'removed';
  }
  const sessionsByAccountId = sessionsForCredentialUpdate(
    state.sessionsByAccountId,
    state.credentialIdsByAccountId,
    credentialId,
    input.next,
  );
  const activeAccount = state.boundAccounts.find((account) => account.id === state.activeAccountId);
  const activeScoreProvider = input.refreshActiveMaimaiProvider
    && sessionsByAccountId[state.activeAccountId] === input.next
    && activeAccount?.gameId === 'maimai'
    && activeAccount.providerId === 'lxns'
    ? createSessionProviders(activeAccount, input.next, applyLxnsTokenRotation).scoreProvider
    : state.scoreProvider;
  useSession.setState({
    sessionsByAccountId,
    session: sessionsByAccountId[state.activeAccountId] ?? state.session,
    scoreProvider: activeScoreProvider,
  });
  const { SecureSessionStore } = await import('@/storage/secure-session-store');
  try {
    const result = await new SecureSessionStore().updateCredentialSession(credentialId, input.next, {
      acceptedRefreshTokens: input.acceptedRefreshTokens,
    });
    if (result === 'applied') pendingRotationWrites.delete(credentialId);
    return result === 'applied' ? 'applied' : result === 'stale' ? 'stale' : 'removed';
  } catch {
    // 本机落盘失败时保留内存中的新会话并登记补写：上游已消费旧 refresh token，
    // 再次刷新只会失败。进程退出前仍未保存成功时用户可能需要重新授权。
    pendingRotationWrites.set(credentialId, {
      accountId: input.accountId,
      session: input.next,
      acceptedRefreshTokens: input.acceptedRefreshTokens,
      attempts: 0,
    });
    schedulePendingRotationRetry();
    void recordRuntimeDiagnostic('session', { credentialWrite: 'pending' });
    return 'pending-persist';
  }
}

/**
 * 落雪令牌轮换提交：必须携带请求开始时使用的会话（凭据世代）。
 * 只有当前仍关联该凭据、且会话属于本次轮换世代的账号接受新令牌；
 * 发起账号被解绑不会丢弃其它账号仍需的新令牌，新授权也不会被旧轮换覆盖。
 */
export async function applyLxnsTokenRotation(
  accountId: string,
  update: LxnsTokenRotationUpdate,
): Promise<OAuthRotationCommitResult> {
  // 先补交上次落盘失败的轮换，再提交本次结果。
  await retryPendingRotationWrites();
  return commitOAuthRotation({
    accountId,
    lineage: LXNS_ROTATION_LINEAGE,
    next: update.next,
    acceptedRefreshTokens: [
      update.previous.refreshToken,
      ...lxnsRotationAncestors(update.next.refreshToken),
    ],
    refreshActiveMaimaiProvider: true,
  });
}

/**
 * osu! 令牌轮换：与落雪共用凭据世代提交规则，只更新仍关联该凭据的模式账号。
 * osu! 的 refresh token 单次使用，因此提交必须携带发起时持有的会话（expected）；
 * 拿不到 expected 时只允许幂等重写当前已存在的同一个会话。
 */
export async function applyOsuTokenRotation(
  accountId: string,
  next: OsuOAuthSession,
  expected?: OsuOAuthSession,
): Promise<OAuthRotationCommitResult> {
  // 先补交上次落盘失败的轮换，再提交本次结果。
  await retryPendingRotationWrites();
  return commitOAuthRotation({
    accountId,
    lineage: OSU_ROTATION_LINEAGE,
    next,
    acceptedRefreshTokens: [
      expected?.refreshToken ?? next.refreshToken,
      ...osuRotationAncestors(next.refreshToken),
    ],
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
