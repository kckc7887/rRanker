import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
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
import type { LxnsTokenRotationUpdate } from '@/providers/lxns-oauth-request';
import {
  credentialIdsMapFromVault,
  sessionsMapFromVault,
  type SessionVault,
} from '@/storage/secure-session-store';
import { startTimer } from '@/utils/startup-timing';
import { sessionRuntime } from '@/state/session-runtime';
import { clearOsuRotationCache } from '@/providers/osu-oauth';
import type { SessionCredentialCoordinator } from '@/services/session-credential-coordinator';

/** 无已绑定账号时的占位 ID；页面按空数据处理。 */
export const UNBOUND_ACCOUNT_ID = 'maimai:unbound';

export type SessionsByAccountId = Record<string, ProviderSession>;

type OsuOAuthSession = Extract<ProviderSession, { mode: 'osu-oauth' }>;

/**
 * 规范账号数据与派生内存视图。Store 只做纯变换：
 * Provider 实例来自注入的运行时端口，凭据落盘与轮换来自凭据提交协调器。
 */
export type SessionState = {
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
};

export type SessionRestoreStatus = 'restoring' | 'ready' | 'error';

/** 账号被移除后释放它的 Provider 缓存：同一账号只保留当前实例。 */
function releaseAccountProviders(accountIds: readonly string[]): void {
  sessionRuntime().release(accountIds);
}

/**
 * 多账号操作改了规范数据（例如共享凭据轮换把新会话广播给所有关联账号）后，
 * 让激活账号的派生视图按同一批数据重新解析：调用方不再需要自己拼 Provider 字段。
 * 传入 `sessionsByAccountId` 可让会话与派生视图落在同一次提交里。
 */
export function refreshActiveSessionView(sessionsByAccountId?: SessionsByAccountId): void {
  const state = useSession.getState();
  const sessions = sessionsByAccountId ?? state.sessionsByAccountId;
  const account = state.boundAccounts.find((item) => item.id === state.activeAccountId);
  if (!account) return;
  useSession.setState(activeAccountFields(account, sessions, state.credentialIdsByAccountId));
}

/**
 * 一次转换生成激活账号的全部派生字段：当前 ID、游戏、Provider 与内存会话
 * 在同一份状态提交里同时可见，不存在只看得到一半的中间态。
 */
function activeAccountFields(
  account: BoundAccount,
  sessionsByAccountId: SessionsByAccountId,
  credentialIdsByAccountId: Record<string, string>,
) {
  return {
    session: sessionsByAccountId[account.id] ?? null,
    activeAccountId: account.id,
    activeGameId: account.gameId,
    activeProviderId: account.providerId,
    ...providersForAccountWithCredential(account, sessionsByAccountId, credentialIdsByAccountId),
  };
}

function providersForAccountWithCredential(
  account: BoundAccount | null,
  sessionsByAccountId: SessionsByAccountId,
  credentialIdsByAccountId: Record<string, string>,
) {
  const { providers } = sessionRuntime().resolve({
    account,
    credentials: {
      id: account ? credentialIdsByAccountId[account.id] ?? null : null,
      session: account ? sessionsByAccountId[account.id] ?? null : null,
    },
  });
  return providers;
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
    ...providersForAccountWithCredential(null, {}, {}),
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
    ...activeAccountFields(active, sessionsByAccountId, credentialIdsByAccountId),
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
  const credentialIdsByAccountId = { ...state.credentialIdsByAccountId, [account.id]: credentialId };
  const sessionsByAccountId = shareCredential
    ? sessionsForCredentialUpdate(state.sessionsByAccountId, credentialIdsByAccountId, credentialId, session)
    : { ...state.sessionsByAccountId, [account.id]: session };
  return activateAccount(
    upsertAccountList(state.boundAccounts, account),
    sessionsByAccountId,
    credentialIdsByAccountId,
    account.id,
  );
}

/** 共享凭据广播：同一凭据下的账号一起拿到新会话，不改变账号集合。 */
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
    const state = get();
    const next = upsertAccountList(state.boundAccounts, account);
    if (next.length === state.boundAccounts.length
      && next.every((item, index) => item === state.boundAccounts[index])) return;
    const isActive = state.activeAccountId === account.id;
    set({
      boundAccounts: next,
      ...(isActive ? activeAccountFields(account, state.sessionsByAccountId, state.credentialIdsByAccountId) : {}),
    });
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
    const isActive = get().activeAccountId === accountId;
    const state = get();
    set({
      boundAccounts: accounts.map((item) => item === account ? next : item),
      // 展示名会进 Provider 实例（本地玩家名），激活账号改名时同步重建派生视图。
      ...(isActive && next.displayName !== account.displayName
        ? activeAccountFields(next, state.sessionsByAccountId, state.credentialIdsByAccountId)
        : {}),
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
      // 本地 Provider 实例内嵌玩家名：改名后必须解析出新实例。
      ...(current.activeAccountId === accountId
        ? activeAccountFields(renamed, current.sessionsByAccountId, current.credentialIdsByAccountId)
        : {}),
    });
  },
  selectBoundAccount: (accountId) => {
    const state = get();
    const account = state.boundAccounts.find((item) => item.id === accountId);
    if (!account) return;
    set(activeAccountFields(account, state.sessionsByAccountId, state.credentialIdsByAccountId));
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
    // 解绑使该账号的 Provider 实例失效：缓存条目按账号释放，不会留给下次绑定复用。
    releaseAccountProviders([accountId]);
    set(activateAccount(
      nextAccounts,
      restSessions,
      restCredentialIds,
      activeAccountId === accountId ? null : activeAccountId,
    ));
  },
  setOsuBinding: (input) => {
    const state = get();
    const nextSessions = { ...state.sessionsByAccountId };
    const nextCredentialIds = { ...state.credentialIdsByAccountId };
    for (const account of input.accounts) {
      nextSessions[account.id] = input.session;
      nextCredentialIds[account.id] = input.credentialId;
    }
    const nextAccounts = dedupeAccounts([
      ...state.boundAccounts,
      ...input.accounts,
    ]);
    const active = input.accounts.find((account) => account.id === input.activeAccountId)
      ?? input.accounts[0];
    if (!active) return;
    set({
      sessionsByAccountId: nextSessions,
      credentialIdsByAccountId: nextCredentialIds,
      boundAccounts: nextAccounts,
      ...activeAccountFields(active, nextSessions, nextCredentialIds),
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
    const dropped = get().boundAccounts
      .filter((account) => !kept.includes(account))
      .map((account) => account.id);
    releaseAccountProviders(dropped);
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

/**
 * 兼容入口桥接：轮换提交、挂起补写与 Rizline 轮换都在凭据提交协调器里，
 * 这里按需加载协调器并复用同一实例，Store 自身不 import 存储实现或 Provider 构造路径。
 */
let credentialCoordinatorBridge: Promise<SessionCredentialCoordinator> | null = null;
let credentialCoordinatorInstance: SessionCredentialCoordinator | null = null;

function loadCredentialCoordinator(): Promise<SessionCredentialCoordinator> {
  credentialCoordinatorBridge ??= import('@/services/session-credential-coordinator').then(
    ({ SessionCredentialCoordinator }) => {
      credentialCoordinatorInstance = new SessionCredentialCoordinator({
        getState: () => useSession.getState(),
        setState: (partial) => useSession.setState(partial as Partial<SessionState>),
        refreshActiveSessionView,
      });
      return credentialCoordinatorInstance;
    },
  );
  return credentialCoordinatorBridge;
}

export async function applyLxnsTokenRotation(
  accountId: string,
  update: LxnsTokenRotationUpdate,
): Promise<'applied' | 'pending-persist' | 'stale' | 'removed'> {
  return (await loadCredentialCoordinator()).applyLxnsTokenRotation(accountId, update);
}

export async function applyOsuTokenRotation(
  accountId: string,
  next: OsuOAuthSession,
  expected?: OsuOAuthSession,
): Promise<'applied' | 'pending-persist' | 'stale' | 'removed'> {
  return (await loadCredentialCoordinator()).applyOsuTokenRotation(accountId, next, expected);
}

export async function applyRizlineSessionRotation(
  accountId: string,
  next: RizlineSession,
  expected: RizlineSession,
  signal?: AbortSignal,
): Promise<void> {
  await (await loadCredentialCoordinator()).applyRizlineSessionRotation(accountId, next, expected, signal);
}

/** 仍未落盘的轮换摘要：状态跟着同一协调器单例，兼容入口不维护第二份。 */
export function pendingRotationWritesSnapshot(): readonly {
  credentialId: string;
  accountId: string;
  attempts: number;
}[] {
  return credentialCoordinatorInstance?.pendingRotationWritesSnapshot() ?? [];
}

export async function retryPendingRotationWrites(): Promise<number> {
  return (await loadCredentialCoordinator()).retryPendingRotationWrites();
}

/** 测试用：清空挂起轮换、定时器与已装配的协调器。 */
export function resetPendingRotationWritesForTests(): void {
  credentialCoordinatorInstance?.resetPendingRotationWritesForTests();
  credentialCoordinatorInstance = null;
  credentialCoordinatorBridge = null;
}
