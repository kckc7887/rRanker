import type { ProviderSession, RizlineSession } from '@/providers/contracts';
import type { HttpCookieSession } from '@/providers/http-cookies';
import type { LxnsTokenRotationUpdate } from '@/providers/lxns-oauth-request';
import { lxnsRotationAncestors } from '@/providers/lxns-oauth';
import { osuRotationAncestors } from '@/providers/osu-oauth';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { nextRuntimeOperationId, recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';
import { releaseResolvedProviders } from '@/state/session-provider-resolver';
import { refreshActiveSessionView, sessionsForCredentialUpdate, useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';

type OsuOAuthSession = Extract<ProviderSession, { mode: 'osu-oauth' }>;
type RotatableOAuthSession = Extract<ProviderSession, { mode: 'lxns-oauth' | 'osu-oauth' }>;
type OAuthRotationCommitResult = 'applied' | 'pending-persist' | 'stale' | 'removed';

type PendingRotationWrite = {
  operationId: number;
  session: RotatableOAuthSession;
  acceptedRefreshTokens: readonly string[];
  attempts: number;
  nextAttemptAt: number;
};

const credentials = new SecureSessionStore();
const pendingRotationWrites = new Map<string, PendingRotationWrite>();
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000] as const;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryInFlight: Promise<number> | null = null;

function accountIdsForCredential(credentialId: string): string[] {
  return Object.entries(useSession.getState().credentialIdsByAccountId)
    .filter(([, id]) => id === credentialId)
    .map(([accountId]) => accountId);
}

function scheduleRetry(): void {
  if (retryTimer !== null) return;
  const eligible = [...pendingRotationWrites.values()].filter(entry => entry.attempts < RETRY_DELAYS_MS.length);
  if (eligible.length === 0) return;
  const delay = Math.max(0, Math.min(...eligible.map(entry => entry.nextAttemptAt)) - Date.now());
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void retryPendingWrites(true);
  }, delay);
}

export function retryPendingRotationWrites(): Promise<number> {
  return retryPendingWrites(false);
}

async function retryPendingWrites(automatic: boolean): Promise<number> {
  if (retryInFlight) return retryInFlight;
  if (pendingRotationWrites.size === 0) return 0;
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const attempt = (async () => {
    let applied = 0;
    for (const [credentialId, entry] of [...pendingRotationWrites]) {
      const state = useSession.getState();
      if (!accountIdsForCredential(credentialId).some(id => state.sessionsByAccountId[id] === entry.session)) {
        pendingRotationWrites.delete(credentialId);
        continue;
      }
      if (automatic && (entry.attempts >= RETRY_DELAYS_MS.length || entry.nextAttemptAt > Date.now())) continue;
      try {
        const result = await credentials.updateCredentialSession(credentialId, entry.session, {
          acceptedRefreshTokens: entry.acceptedRefreshTokens,
        });
        if (pendingRotationWrites.get(credentialId) !== entry) continue;
        pendingRotationWrites.delete(credentialId);
        if (result === 'applied') {
          applied += 1;
          void recordRuntimeDiagnostic('session', { credentialWrite: 'applied', operationId: entry.operationId,
            phase: 'credential-persist', attempts: entry.attempts + 1, result: 'success' });
        } else {
          void recordRuntimeDiagnostic('session', { credentialWrite: 'dropped', result,
            operationId: entry.operationId, phase: 'credential-persist' });
        }
      } catch (error) {
        if (pendingRotationWrites.get(credentialId) !== entry) continue;
        const attempts = entry.attempts + 1;
        pendingRotationWrites.set(credentialId, { ...entry, attempts,
          nextAttemptAt: Date.now() + RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)]! });
        void recordRuntimeDiagnostic('session', { credentialWrite: attempts >= RETRY_DELAYS_MS.length ? 'waiting' : 'retry-scheduled',
          attempts, operationId: entry.operationId, phase: 'credential-persist', errorCode: 'credential_storage', error, severity: 'warn' });
      }
    }
    scheduleRetry();
    return applied;
  })().finally(() => { retryInFlight = null; });
  retryInFlight = attempt;
  return attempt;
}

async function commitOAuthRotation(input: {
  accountId: string;
  next: RotatableOAuthSession;
  acceptedRefreshTokens: readonly string[];
}): Promise<OAuthRotationCommitResult> {
  const state = useSession.getState();
  const credentialId = Object.entries(state.credentialIdsByAccountId).find(([accountId]) => {
    const session = state.sessionsByAccountId[accountId];
    return session?.mode === input.next.mode && input.acceptedRefreshTokens.includes(session.refreshToken);
  })?.[1];
  if (!credentialId) return state.credentialIdsByAccountId[input.accountId] ? 'stale' : 'removed';
  const sessions = sessionsForCredentialUpdate(state.sessionsByAccountId, state.credentialIdsByAccountId, credentialId, input.next);
  releaseResolvedProviders(accountIdsForCredential(credentialId));
  refreshActiveSessionView(sessions);
  try {
    const result = await credentials.updateCredentialSession(credentialId, input.next, {
      acceptedRefreshTokens: input.acceptedRefreshTokens,
    });
    if (result === 'applied' && pendingRotationWrites.get(credentialId)?.session === input.next) pendingRotationWrites.delete(credentialId);
    return result === 'applied' ? 'applied' : result === 'stale' ? 'stale' : 'removed';
  } catch (error) {
    if (!accountIdsForCredential(credentialId).some(id => useSession.getState().sessionsByAccountId[id] === input.next)) return 'stale';
    /** 上游已消费旧 refresh token；保存失败时补写新会话。 */
    const entry = {
      operationId: nextRuntimeOperationId(),
      session: input.next,
      acceptedRefreshTokens: input.acceptedRefreshTokens,
      attempts: 0,
      nextAttemptAt: Date.now() + RETRY_DELAYS_MS[0],
    };
    pendingRotationWrites.set(credentialId, entry);
    scheduleRetry();
    void recordRuntimeDiagnostic('session', { credentialWrite: 'pending', phase: 'credential-persist',
      operationId: entry.operationId, result: 'pending', errorCode: 'credential_storage', error, severity: 'warn' });
    return 'pending-persist';
  }
}

export async function applyLxnsTokenRotation(accountId: string, update: LxnsTokenRotationUpdate): Promise<OAuthRotationCommitResult> {
  await retryPendingRotationWrites();
  return commitOAuthRotation({ accountId, next: update.next,
    acceptedRefreshTokens: [update.previous.refreshToken, ...lxnsRotationAncestors(update.next.refreshToken)] });
}

export async function applyOsuTokenRotation(accountId: string, next: OsuOAuthSession, expected?: OsuOAuthSession): Promise<OAuthRotationCommitResult> {
  await retryPendingRotationWrites();
  return commitOAuthRotation({ accountId, next,
    acceptedRefreshTokens: [expected?.refreshToken ?? next.refreshToken, ...osuRotationAncestors(next.refreshToken)] });
}

export async function applyRizlineSessionRotation(accountId: string, next: RizlineSession, expected: RizlineSession, signal?: AbortSignal): Promise<void> {
  const assertCurrent = captureResourceWrites('rizline', signal, accountId);
  assertCurrent();
  const before = useSession.getState().sessionsByAccountId[accountId];
  if (before?.mode !== 'rizline' || before.token !== expected.token) return;
  const result = await credentials.updateAccountSession(accountId, next, { expected, signal });
  if (result !== 'applied') return;
  assertCurrent();
  const state = useSession.getState();
  const current = state.sessionsByAccountId[accountId];
  if (current?.mode !== 'rizline' || current.token !== expected.token) return;
  const credentialId = state.credentialIdsByAccountId[accountId];
  releaseResolvedProviders(accountIdsForCredential(credentialId));
  refreshActiveSessionView(sessionsForCredentialUpdate(state.sessionsByAccountId, state.credentialIdsByAccountId, credentialId, next));
}

export async function applyMajdataSessionRotation(accountId: string, next: HttpCookieSession, expected: HttpCookieSession, signal?: AbortSignal): Promise<void> {
  const assertCurrent = captureResourceWrites('majdata-net', signal, accountId);
  assertCurrent();
  if (useSession.getState().sessionsByAccountId[accountId] !== expected) return;
  const result = await credentials.updateAccountSession(accountId, next, { expected, signal });
  if (result !== 'applied') return;
  assertCurrent();
  const state = useSession.getState();
  if (state.sessionsByAccountId[accountId] !== expected) return;
  const credentialId = state.credentialIdsByAccountId[accountId];
  releaseResolvedProviders(accountIdsForCredential(credentialId));
  refreshActiveSessionView(sessionsForCredentialUpdate(state.sessionsByAccountId, state.credentialIdsByAccountId, credentialId, next));
}
