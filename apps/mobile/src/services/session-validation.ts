import type { ProviderSession, ScoreProvider } from '@/providers/contracts';
import type { Player } from '@/domain/models';

export async function validateScoreProvider(provider: ScoreProvider, signal?: AbortSignal): Promise<Player> {
  if (signal?.aborted) throw signal.reason;
  const [player] = await Promise.all([provider.getPlayer(signal), provider.getRecords(signal)]);
  if (signal?.aborted) throw signal.reason;
  return player;
}

interface SessionActivationDependencies {
  createProvider: (session: ProviderSession) => ScoreProvider;
  save: (session: ProviderSession, player: Player) => Promise<void>;
  activate: (session: ProviderSession, player: Player) => void;
  signal?: AbortSignal;
  assertCurrent?: () => void;
}

export async function validateAndActivateSession(
  session: ProviderSession,
  dependencies: SessionActivationDependencies,
): Promise<Player> {
  const assertCurrent = () => {
    if (dependencies.signal?.aborted) throw dependencies.signal.reason;
    dependencies.assertCurrent?.();
  };
  assertCurrent();
  const provider = dependencies.createProvider(session);
  const player = await validateScoreProvider(provider, dependencies.signal);
  assertCurrent();
  await dependencies.save(session, player);
  assertCurrent();
  dependencies.activate(session, player);
  return player;
}
