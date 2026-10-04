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
import type { ProviderSession } from '@/providers/contracts';
import type { SessionProviders } from '@/services/session-providers';
import { resolveSessionProviders, releaseResolvedProviders } from '@/state/session-provider-resolver';
import {
  credentialIdsMapFromVault,
  sessionsMapFromVault,
  type SessionVault,
} from '@/domain/session-vault';
import { startTimer } from '@/utils/startup-timing';
import { clearOsuRotationCache } from '@/providers/osu-oauth';
import { EmptyScoreProvider } from '@/providers/empty-provider';

export const UNBOUND_ACCOUNT_ID = 'maimai:unbound';
const emptyScoreProvider = new EmptyScoreProvider();

export type SessionsByAccountId = Record<string, ProviderSession>;

type OsuOAuthSession = Extract<ProviderSession, { mode: 'osu-oauth' }>;

export type SessionState = {
  sessionsByAccountId: SessionsByAccountId;
  credentialIdsByAccountId: Record<string, string>;
  boundAccounts: BoundAccount[];
  activeAccountId: string;
  activeGameId: GameId;
  activeProviderId: ProviderId | null;
  scoreProvider: SessionProviders['scoreProvider'];
  catalogProvider: SessionProviders['catalogProvider'];
  protocolScoreProvider: SessionProviders['protocolScoreProvider'];
  restoreStatus: SessionRestoreStatus;
  restoreError: string | null;
  migrationRecovery: SessionVault['recovery'] | null;
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
  setOsuBinding: (input: {
    accounts: BoundAccount[];
    credentialId: string;
    session: OsuOAuthSession;
    activeAccountId: string;
  }) => void;
  clearSession: () => void;
  finishRestore: (vault: SessionVault | ProviderSession | null, optionalAccounts?: BoundAccount[]) => void;
  failRestore: (message: string) => void;
};

export type SessionRestoreStatus = 'restoring' | 'ready' | 'error';

export function refreshActiveSessionView(sessionsByAccountId: SessionsByAccountId): void {
  const state = useSession.getState();
  const account = state.boundAccounts.find((item) => item.id === state.activeAccountId);
  useSession.setState({ sessionsByAccountId,
    ...(account && (sessionsByAccountId[account.id] ?? null) !== state.session
      ? activeAccountFields(account, sessionsByAccountId, state.credentialIdsByAccountId) : {}) });
}

export function replaceRestoredOptionalAccounts(matches: (account: BoundAccount) => boolean, accounts: BoundAccount[]): void {
  const state = useSession.getState();
  const restored = [...state.boundAccounts.filter((account) => !matches(account)), ...accounts];
  const next = restored.some((account) => account.gameId === 'chunithm' && account.providerId === 'lxns')
    ? restored.filter((account) => account.providerId !== 'chunithm-temp') : restored;
  useSession.setState({ ...activateAccount(next, state.sessionsByAccountId, state.credentialIdsByAccountId, state.activeAccountId),
    restoreStatus: state.restoreStatus, restoreError: state.restoreError });
}

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
    ...resolveSessionProviders(account, credentialIdsByAccountId[account.id] ?? null, sessionsByAccountId[account.id] ?? null),
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
  return [...accounts.filter((account) => account.id !== next.id), next];
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
    scoreProvider: emptyScoreProvider,
    catalogProvider: null,
    protocolScoreProvider: null,
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

export function sessionsForCredentialUpdate(
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
  migrationRecovery: null,
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
    const nextAccounts = boundAccounts.filter((account) => account.id !== accountId);
    if (removed?.mode === 'osu-oauth'
      && !Object.values(restSessions).some((session) => session?.mode === 'osu-oauth')) {
      clearOsuRotationCache();
    }
    releaseResolvedProviders([accountId]);
    set(activateAccount(
      nextAccounts,
      restSessions,
      restCredentialIds,
      activeAccountId === accountId ? null : activeAccountId,
    ));
  },
  setOsuBinding: (input) => {
    const state = get();
    const active = input.accounts.find((account) => account.id === input.activeAccountId)!;
    const nextCredentialIds = { ...state.credentialIdsByAccountId };
    for (const account of input.accounts) {
      nextCredentialIds[account.id] = input.credentialId;
    }
    const nextSessions = sessionsForCredentialUpdate(state.sessionsByAccountId, nextCredentialIds, input.credentialId, input.session);
    const nextAccounts = input.accounts.reduce(upsertAccountList, state.boundAccounts);
    releaseResolvedProviders(Object.keys(nextCredentialIds).filter(accountId => nextCredentialIds[accountId] === input.credentialId));
    set({
      sessionsByAccountId: nextSessions,
      credentialIdsByAccountId: nextCredentialIds,
      boundAccounts: nextAccounts,
      ...activeAccountFields(active, nextSessions, nextCredentialIds),
      restoreStatus: 'ready',
      restoreError: null,
    });
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
    releaseResolvedProviders(dropped);
    set(activateAccount(kept, {}, {}, kept[0]?.id ?? null));
  },
  finishRestore: (input, optionalAccounts = []) => {
    const migrationRecovery = input && 'version' in input ? input.recovery ?? null : null;
    const finish = (profile: ReturnType<typeof activateAccount>) => set({ ...profile, migrationRecovery });
    // 兼容旧单会话 restore
    if (input && 'mode' in input) {
      const session = input as ProviderSession;
      const pending = createMaimaiBoundAccount({
        providerId: 'diving-fish',
        displayName: '水鱼玩家',
        rating: 0,
        playerId: 'restored',
      });
      finish(activateAccount(
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
      finish(activateAccount(
        [...compatibleOptionalAccounts, ...vault.accounts.map(boundAccountFromStored)],
        sessionsByAccountId,
        credentialIdsByAccountId,
        vault.activeAccountId,
      ));
      return;
    }

    finish(activateAccount(optionalAccounts, {}, {}, optionalAccounts[0]?.id ?? null));
  },
  failRestore: (message) => {
    set({
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
      ? await loadOptionalAccounts()
      : [];
    stopOptional();
    useSession.getState().finishRestore(input, optionalAccounts);
  } catch {
    useSession.getState().failRestore('无法读取本机登录状态，请重试恢复。');
  }
}

export {
  applyLxnsTokenRotation,
  applyOsuTokenRotation,
  applyRizlineSessionRotation,
  applyMajdataSessionRotation,
  retryPendingRotationWrites,
} from '@/services/session-credential-service';
