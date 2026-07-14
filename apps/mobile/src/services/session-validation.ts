import type { ProviderSession, ScoreProvider } from '@/providers/contracts';
import type { Player } from '@/domain/models';

export async function validateScoreProvider(provider: ScoreProvider): Promise<Player> {
  const [player] = await Promise.all([provider.getPlayer(), provider.getRecords()]);
  return player;
}

interface SessionActivationDependencies {
  createProvider: (session: ProviderSession) => ScoreProvider;
  save: (session: ProviderSession, player: Player) => Promise<void>;
  activate: (session: ProviderSession, player: Player) => void;
}

export async function validateAndActivateSession(
  session: ProviderSession,
  dependencies: SessionActivationDependencies,
): Promise<Player> {
  const provider = dependencies.createProvider(session);
  const player = await validateScoreProvider(provider);
  await dependencies.save(session, player);
  dependencies.activate(session, player);
  return player;
}
