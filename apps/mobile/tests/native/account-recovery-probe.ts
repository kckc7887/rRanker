import { fetch } from 'expo/fetch';
import { z } from 'zod';
import { bindLxnsAccount } from '@/services/lxns-account-binding';
import { restoreAppAccounts } from '@/services/account-restoration';
import { fetchMe } from '@/services/score-hub-client';
import { useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { scoreHubAccountStore } from '@/storage/score-hub-account-store';
import { ACCOUNT_PROBE_ORIGIN } from './expo-fetch-adapter';
import type { ProviderErrorCode } from '@/providers/errors';

export type AccountProbeStep = 'command' | 'source-identity'
  | 'initial-main-store' | 'initial-scorehub-store' | 'fixture-fetch' | 'fixture-parse'
  | 'lxns-bind' | 'scorehub-write' | 'main-readback' | 'scorehub-readback'
  | 'restore' | 'restore-check' | 'scorehub-read' | 'authenticate' | 'clear' | 'clear-readback';

type ProbeFailureCode = ProviderErrorCode | 'invariant' | 'command' | 'source-identity' | 'type' | 'cancelled';
const FAILURE_CODES: readonly ProbeFailureCode[] = [
  'authentication', 'permission', 'rate_limit', 'timeout', 'upstream_schema', 'no_data',
  'cache_corrupt', 'network', 'unknown', 'authorization_prepare', 'authorization_open',
  'authorization_callback', 'verification', 'configuration', 'credential_storage', 'local_commit',
  'invariant', 'command', 'source-identity', 'type', 'cancelled',
];

export class AccountProbeError extends Error {
  constructor(readonly code: 'invariant' | 'command' | 'source-identity') {
    super(`Account probe ${code} failed`);
  }
}

/** Only fixed categories may leave the test process; messages and causes can contain credentials. */
export function accountProbeFailureCode(error: unknown): ProbeFailureCode {
  if (!error || typeof error !== 'object') return 'unknown';
  const { code, name } = error as { code?: unknown; name?: unknown };
  if (typeof code === 'string' && FAILURE_CODES.includes(code as ProbeFailureCode)) return code as ProbeFailureCode;
  if (name === 'AbortError') return 'cancelled';
  if (name === 'ZodError') return 'upstream_schema';
  if (name === 'TypeError') return 'type';
  return 'unknown';
}

const FRIEND_CODE = '123456789012345';
const ACCOUNT_ID = `maimai:lxns:${FRIEND_CODE}`;
const fixtureSchema = z.object({
  runId: z.string(),
  lxns: z.object({ mode: z.literal('lxns-oauth'), accessToken: z.string().min(1),
    refreshToken: z.string().min(1), expiresAt: z.number(), persistable: z.literal(true) }),
  hubToken: z.string().min(1),
});

export function accountProbeCommand(url: string | null): { stage: 'seed' | 'recover'; runId: string } {
  let parsed: URL;
  try { parsed = new URL(url ?? ''); } catch { throw new AccountProbeError('command'); }
  const stage = parsed.searchParams.get('stage');
  const runId = parsed.searchParams.get('run') ?? '';
  if (parsed.protocol !== 'rranker-nativeprobe:' || parsed.hostname !== 'account-recovery'
    || !['seed', 'recover'].includes(stage ?? '') || !/^[a-f0-9]{32}$/.test(runId)
    || [...parsed.searchParams.keys()].length !== 2) throw new AccountProbeError('command');
  return { stage: stage as 'seed' | 'recover', runId };
}

function check(condition: unknown): asserts condition {
  if (!condition) throw new AccountProbeError('invariant');
}

export async function clearAccountProbe(): Promise<void> {
  await new SecureSessionStore().clear();
  await scoreHubAccountStore.clear();
}

export async function runAccountRecoveryProbe(
  stage: 'seed' | 'recover', runId: string, publishStep: (step: AccountProbeStep) => void = () => undefined,
): Promise<void> {
  const sessions = new SecureSessionStore();
  if (stage === 'seed') {
    publishStep('initial-main-store');
    check((await sessions.loadVault()).accounts.length === 0);
    publishStep('initial-scorehub-store');
    check(Object.keys((await scoreHubAccountStore.loadAll()).accounts).length === 0);
    publishStep('fixture-fetch');
    const response = await fetch(`${ACCOUNT_PROBE_ORIGIN}/fixture?run=${runId}`);
    check(response.ok);
    publishStep('fixture-parse');
    const fixture = fixtureSchema.parse(await response.json());
    check(fixture.runId === runId);
    publishStep('lxns-bind');
    const binding = await bindLxnsAccount({ gameId: 'maimai', session: fixture.lxns,
      credentialId: `lxns:probe:${runId}` });
    check(binding.account.id === ACCOUNT_ID);
    publishStep('scorehub-write');
    await scoreHubAccountStore.upsert({ friendCode: FRIEND_CODE, token: fixture.hubToken, hasCabinetBound: true });
    publishStep('main-readback');
    const vault = await sessions.loadVault();
    check(vault.accounts.length === 1 && vault.activeAccountId === ACCOUNT_ID);
    const stored = vault.credentials.find(credential => credential.id === binding.credentialId)?.session;
    check(stored?.mode === 'lxns-oauth' && stored.accessToken === fixture.lxns.accessToken);
    publishStep('scorehub-readback');
    check((await scoreHubAccountStore.load()).token === fixture.hubToken);
    return;
  }

  publishStep('restore');
  await restoreAppAccounts();
  publishStep('restore-check');
  const state = useSession.getState();
  check(state.restoreStatus === 'ready' && state.activeAccountId === ACCOUNT_ID);
  check(state.boundAccounts.length === 1 && state.credentialIdsByAccountId[ACCOUNT_ID] === `lxns:probe:${runId}`);
  check(state.sessionsByAccountId[ACCOUNT_ID]?.mode === 'lxns-oauth' && state.scoreProvider);
  publishStep('scorehub-read');
  const hub = await scoreHubAccountStore.load();
  check(hub.friendCode === FRIEND_CODE && hub.token);
  publishStep('authenticate');
  const [player, me] = await Promise.all([state.scoreProvider.getPlayer(), fetchMe(hub.token)]);
  check(player.id === FRIEND_CODE && me.friendCode === FRIEND_CODE && me.hasCabinetUserId);
  publishStep('clear');
  await clearAccountProbe();
  publishStep('clear-readback');
  check((await sessions.loadVault()).accounts.length === 0);
  check(Object.keys((await scoreHubAccountStore.loadAll()).accounts).length === 0);
}
