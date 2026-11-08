import { captureResourceWrites } from './snapshot-cache-utils';
import type { Credential, CredentialCommitResult } from '@rranker/sdk/credentials';
import { accountIsAvailable, useAccountStore } from '@rranker/sdk/state/account-store';
import { nextRuntimeOperationId, recordRuntimeDiagnostic } from '@rranker/sdk/services/runtime-diagnostics-recorder';
import { SecureSessionStore } from '@rranker/sdk/storage/secure-session-store';
import { sessionMatchesExpected } from '@rranker/sdk/storage/secure-session-codec';

type PendingCredentialWrite = {
  operationId: number;
  session: Credential;
  expected: Credential;
  previous: Credential;
  assertCurrent: () => void;
  attempts: number;
  nextAttemptAt: number;
};

const credentials = new SecureSessionStore();
const pendingWrites = new Map<string, PendingCredentialWrite>();
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000] as const;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryInFlight: Promise<number> | null = null;

function scheduleRetry(): void {
  if (retryTimer !== null) return;
  const eligible = [...pendingWrites.values()].filter(entry => entry.attempts < RETRY_DELAYS_MS.length);
  if (!eligible.length) return;
  const delay = Math.max(0, Math.min(...eligible.map(entry => entry.nextAttemptAt)) - Date.now());
  retryTimer = setTimeout(() => { retryTimer = null; void retryPendingWrites(true); }, delay);
}

export function retryPendingRotationWrites(): Promise<number> {
  return retryPendingWrites(false);
}

async function retryPendingWrites(automatic: boolean): Promise<number> {
  if (retryInFlight) return retryInFlight;
  if (!pendingWrites.size) return 0;
  if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null; }
  const attempt = (async () => {
    let applied = 0;
    for (const [credentialId, entry] of [...pendingWrites]) {
      let eligible = useAccountStore.getState().credentialsById[credentialId] === entry.session;
      try { entry.assertCurrent(); } catch { eligible = false; }
      if (!eligible) { pendingWrites.delete(credentialId); continue; }
      if (automatic && (entry.attempts >= RETRY_DELAYS_MS.length || entry.nextAttemptAt > Date.now())) continue;
      try {
        const result = await credentials.updateCredentialSession(credentialId, entry.session, {
          expected: entry.expected, assertCurrent: entry.assertCurrent,
        });
        if (pendingWrites.get(credentialId) !== entry) continue;
        pendingWrites.delete(credentialId);
        if (result === 'applied') applied += 1;
        else if (useAccountStore.getState().credentialsById[credentialId] === entry.session) useAccountStore.getState().updateCredential(credentialId, entry.previous);
        recordRuntimeDiagnostic('session', { credentialWrite: result === 'applied' ? 'applied' : 'dropped',
          operationId: entry.operationId, phase: 'credential-persist', attempts: entry.attempts + 1, result });
      } catch (error) {
        if (pendingWrites.get(credentialId) !== entry) continue;
        const attempts = entry.attempts + 1;
        pendingWrites.set(credentialId, { ...entry, attempts,
          nextAttemptAt: Date.now() + RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)]! });
        recordRuntimeDiagnostic('session', { credentialWrite: attempts >= RETRY_DELAYS_MS.length ? 'waiting' : 'retry-scheduled',
          attempts, operationId: entry.operationId, phase: 'credential-persist', errorCode: 'credential_storage', error, severity: 'warn' });
      }
    }
    scheduleRetry();
    return applied;
  })().finally(() => { retryInFlight = null; });
  retryInFlight = attempt;
  return attempt;
}

export async function commitCredential({ credentialId, providerId, next, expected, assertCurrent: assertRequest }: {
  credentialId: string; providerId: string; next: Credential; expected: Credential; assertCurrent?: () => void;
}): Promise<CredentialCommitResult> {
  const references = () => useAccountStore.getState().boundAccounts.filter(account => account.credentialId === credentialId && account.providerId === providerId);
  if (!references().length) return 'removed';
  const assertCredential = captureResourceWrites('credential:' + credentialId);
  const assertCurrent = () => {
    assertRequest?.();
    assertCredential();
    if (!references().some(accountIsAvailable)) throw new Error('凭据请求已失效');
  };
  assertCurrent();
  const state = useAccountStore.getState();
  const current = state.credentialsById[credentialId];
  if (!current || !sessionMatchesExpected(providerId, current, expected)) return 'stale';
  let previous = pendingWrites.get(credentialId);
  if (previous?.session !== current) previous = undefined;
  try { previous?.assertCurrent(); } catch { previous = undefined; }
  const persistedExpected = previous?.expected ?? expected;
  state.updateCredential(credentialId, next);
  try {
    const result = await credentials.updateCredentialSession(credentialId, next, { expected: persistedExpected, assertCurrent });
    if (pendingWrites.get(credentialId)?.session === next) pendingWrites.delete(credentialId);
    if (result !== 'applied' && useAccountStore.getState().credentialsById[credentialId] === next) {
      useAccountStore.getState().updateCredential(credentialId, current);
    }
    return result === 'missing' ? 'removed' : result;
  } catch (error) {
    if (useAccountStore.getState().credentialsById[credentialId] !== next) return 'stale';
    assertCurrent();
    const entry: PendingCredentialWrite = {
      operationId: nextRuntimeOperationId(), session: next, expected: persistedExpected, previous: current,
      assertCurrent, attempts: 0, nextAttemptAt: Date.now() + RETRY_DELAYS_MS[0],
    };
    pendingWrites.set(credentialId, entry);
    scheduleRetry();
    recordRuntimeDiagnostic('session', { credentialWrite: 'pending', phase: 'credential-persist', operationId: entry.operationId,
      result: 'pending', errorCode: 'credential_storage', error, severity: 'warn' });
    return 'pending-persist';
  }
}
