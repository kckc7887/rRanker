import { fetch } from 'expo/fetch';
import { z } from 'zod';
import { bindLxnsAccount } from '@/services/lxns-account-binding';
import { restoreAppAccounts } from '@/services/account-restoration';
import { fetchMe } from '@/services/score-hub-client';
import { useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { scoreHubAccountStore } from '@/storage/score-hub-account-store';
import { ACCOUNT_PROBE_ORIGIN } from './expo-fetch-adapter';

const FRIEND_CODE = '123456789012345';
const ACCOUNT_ID = `maimai:lxns:${FRIEND_CODE}`;
const fixtureSchema = z.object({
  runId: z.string(),
  lxns: z.object({ mode: z.literal('lxns-oauth'), accessToken: z.string().min(1),
    refreshToken: z.string().min(1), expiresAt: z.number(), persistable: z.literal(true) }),
  hubToken: z.string().min(1),
});

export function accountProbeCommand(url: string | null): { stage: 'seed' | 'recover'; runId: string } {
  const parsed = new URL(url ?? '');
  const stage = parsed.searchParams.get('stage');
  const runId = parsed.searchParams.get('run') ?? '';
  if (parsed.protocol !== 'rranker-nativeprobe:' || parsed.hostname !== 'account-recovery'
    || !['seed', 'recover'].includes(stage ?? '') || !/^[a-f0-9]{32}$/.test(runId)
    || [...parsed.searchParams.keys()].length !== 2) throw new Error('Invalid account probe command');
  return { stage: stage as 'seed' | 'recover', runId };
}

function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('Account recovery invariant failed');
}

export async function clearAccountProbe(): Promise<void> {
  await new SecureSessionStore().clear();
  await scoreHubAccountStore.clear();
}

export async function runAccountRecoveryProbe(stage: 'seed' | 'recover', runId: string): Promise<void> {
  const sessions = new SecureSessionStore();
  if (stage === 'seed') {
    check((await sessions.loadVault()).accounts.length === 0);
    check(Object.keys((await scoreHubAccountStore.loadAll()).accounts).length === 0);
    const response = await fetch(`${ACCOUNT_PROBE_ORIGIN}/fixture?run=${runId}`);
    check(response.ok);
    const fixture = fixtureSchema.parse(await response.json());
    check(fixture.runId === runId);
    const binding = await bindLxnsAccount({ gameId: 'maimai', session: fixture.lxns,
      credentialId: `lxns:probe:${runId}` });
    check(binding.account.id === ACCOUNT_ID);
    await scoreHubAccountStore.upsert({ friendCode: FRIEND_CODE, token: fixture.hubToken, hasCabinetBound: true });
    const vault = await sessions.loadVault();
    check(vault.accounts.length === 1 && vault.activeAccountId === ACCOUNT_ID);
    const stored = vault.credentials.find(credential => credential.id === binding.credentialId)?.session;
    check(stored?.mode === 'lxns-oauth' && stored.accessToken === fixture.lxns.accessToken);
    check((await scoreHubAccountStore.load()).token === fixture.hubToken);
    return;
  }

  await restoreAppAccounts();
  const state = useSession.getState();
  check(state.restoreStatus === 'ready' && state.activeAccountId === ACCOUNT_ID);
  check(state.boundAccounts.length === 1 && state.credentialIdsByAccountId[ACCOUNT_ID] === `lxns:probe:${runId}`);
  check(state.sessionsByAccountId[ACCOUNT_ID]?.mode === 'lxns-oauth' && state.scoreProvider);
  const hub = await scoreHubAccountStore.load();
  check(hub.friendCode === FRIEND_CODE && hub.token);
  const [player, me] = await Promise.all([state.scoreProvider.getPlayer(), fetchMe(hub.token)]);
  check(player.id === FRIEND_CODE && me.friendCode === FRIEND_CODE && me.hasCabinetUserId);
  await clearAccountProbe();
  check((await sessions.loadVault()).accounts.length === 0);
  check(Object.keys((await scoreHubAccountStore.loadAll()).accounts).length === 0);
}
