import { PasswordLoginPanel } from '@/components/game-content/PasswordLoginPanel';
import { MajdataProvider } from '@/providers/majdata-provider';
import type { LoginCredentials } from '@/providers/contracts';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';

async function login(credentials: LoginCredentials, signal: AbortSignal) {
  const provider = new MajdataProvider();
  const session = await provider.login(credentials, signal);
  const player = await provider.getPlayer(signal);
  if (signal.aborted) throw signal.reason;
  const id = `majdata-net:account:${player.username.toLowerCase()}`;
  const credentialId = await new SecureSessionStore().upsertAccount({ id, gameId: 'majdata-net', providerId: 'majdata-net',
    displayName: player.username, scoreDisplay: '—', session }, signal);
  if (signal.aborted) return;
  useSession.getState().setSession(session, { gameId: 'majdata-net', providerId: 'majdata-net', accountId: id,
    displayName: player.username, playerId: player.username, rating: null, credentialId });
  await queryClient.invalidateQueries({ queryKey: ['game-data'] });
}
export function MajdataLoginPanel(props: { visible: boolean; onSuccess: () => void; onBusyChange: (busy: boolean) => void }) {
  return <PasswordLoginPanel {...props} login={login} />;
}
