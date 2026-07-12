import type { ProviderSession, ScoreProvider } from '@/providers/contracts';

export async function validateScoreProvider(provider: ScoreProvider): Promise<void> {
  await Promise.all([provider.getPlayer(), provider.getRecords()]);
}

interface SessionActivationDependencies {
  createProvider: (session: ProviderSession) => ScoreProvider;
  save: (session: ProviderSession) => Promise<void>;
  activate: (session: ProviderSession) => void;
}

export async function validateAndActivateSession(
  session: ProviderSession,
  dependencies: SessionActivationDependencies,
): Promise<void> {
  await validateScoreProvider(dependencies.createProvider(session));
  await dependencies.save(session);
  dependencies.activate(session);
}
