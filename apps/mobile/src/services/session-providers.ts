import type { BoundAccount } from '@/domain/bound-account';
import type { AnyScoreProvider, DetailedCatalogProvider, ProviderSession } from '@/providers/contracts';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { EmptyScoreProvider } from '@/providers/empty-provider';
import { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import { isOsuGameId } from '@/domain/game-mode-family';
import { LxnsCatalogProvider } from '@/providers/lxns-catalog-provider';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { LocalMaimaiScoreProvider } from '@/providers/local-score-provider';
import { MaxedMaimaiTestProvider } from '@/providers/maxed-maimai-test-provider';
import { MaxedPhigrosTestProvider } from '@/providers/maxed-phigros-test-provider';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { applyLxnsTokenRotation, applyOsuTokenRotation } from '@/services/session-credential-service';

export type SessionProviders = {
  scoreProvider: AnyScoreProvider;
  catalogProvider: DetailedCatalogProvider | null;
  protocolScoreProvider: ChunithmScoreProvider | OsuScoreProvider | null;
};
const EMPTY_PROVIDERS: SessionProviders = {
  scoreProvider: new EmptyScoreProvider(),
  catalogProvider: null,
  protocolScoreProvider: null,
};

export function createSessionProviders(
  account: BoundAccount,
  session: ProviderSession | null,
): SessionProviders {
  if (!account.providerId) return EMPTY_PROVIDERS;
  if (account.gameId === 'maimai') return createMaimaiSessionProviders(account, session);
  if (account.gameId === 'phigros') {
    if (account.providerId === 'phigros-test') {
      return { ...EMPTY_PROVIDERS, scoreProvider: new MaxedPhigrosTestProvider(account.displayName) };
    }
    if (session?.mode === 'phi-session') {
      return { ...EMPTY_PROVIDERS, scoreProvider: new PhigrosScoreProvider(session) };
    }
  }
  if (account.gameId === 'chunithm' && account.providerId === 'lxns' && session?.mode === 'lxns-oauth') {
    return { ...EMPTY_PROVIDERS, protocolScoreProvider: new ChunithmScoreProvider(session, (update) => applyLxnsTokenRotation(account.id, update)) };
  }
  if (isOsuGameId(account.gameId) && account.providerId === 'osu' && session?.mode === 'osu-oauth') {
    return { ...EMPTY_PROVIDERS, protocolScoreProvider: new OsuScoreProvider(session, (next, expected) => applyOsuTokenRotation(account.id, next, expected)) };
  }
  return EMPTY_PROVIDERS;
}

function createMaimaiSessionProviders(account: BoundAccount, session: ProviderSession | null): SessionProviders {
  const catalogProvider = new LxnsCatalogProvider();
  switch (account.providerId) {
    case 'local': {
      return { ...EMPTY_PROVIDERS, scoreProvider: new LocalMaimaiScoreProvider(account.id, account.displayName), catalogProvider };
    }
    case 'maimai-test':
      return { ...EMPTY_PROVIDERS, scoreProvider: new MaxedMaimaiTestProvider(account.id, account.displayName), catalogProvider };
    case 'lxns':
      if (session?.mode === 'lxns-oauth') {
        return { ...EMPTY_PROVIDERS, scoreProvider: new LxnsScoreProvider(session, (update) => applyLxnsTokenRotation(account.id, update)), catalogProvider };
      }
      break;
    case 'diving-fish':
      if (session) return { ...EMPTY_PROVIDERS, scoreProvider: new DivingFishProvider(session), catalogProvider };
      break;
  }
  return EMPTY_PROVIDERS;
}
