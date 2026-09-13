import type { BoundAccount } from '@/domain/bound-account';
import type { AnyScoreProvider, DetailedCatalogProvider, ProviderSession } from '@/providers/contracts';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { EmptyCatalogProvider, EmptyScoreProvider } from '@/providers/empty-provider';
import { LxnsCatalogProvider } from '@/providers/lxns-catalog-provider';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { LocalMaimaiScoreProvider } from '@/providers/local-score-provider';
import { MaxedMaimaiTestProvider } from '@/providers/maxed-maimai-test-provider';
import { MaxedPhigrosTestProvider } from '@/providers/maxed-phigros-test-provider';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

type SessionProviders = { scoreProvider: AnyScoreProvider; catalogProvider: DetailedCatalogProvider };
type LxnsTokenRotation = (accountId: string, session: Extract<ProviderSession, { mode: 'lxns-oauth' }>) => Promise<void>;

const localRepository = new SqliteSnapshotRepository();

export function createSessionProviders(
  account: BoundAccount | null,
  session: ProviderSession | null,
  onLxnsTokenRotation: LxnsTokenRotation,
): SessionProviders {
  if (!account?.providerId) return { scoreProvider: new EmptyScoreProvider(), catalogProvider: new EmptyCatalogProvider() };
  if (account?.gameId === 'maimai') {
    const catalogProvider = new LxnsCatalogProvider();
    switch (account.providerId) {
      case 'local':
        return { scoreProvider: new LocalMaimaiScoreProvider(localRepository, account.id, account.displayName), catalogProvider };
      case 'maimai-test':
        return { scoreProvider: new MaxedMaimaiTestProvider(account.id, account.displayName), catalogProvider };
      case 'lxns':
        if (session?.mode === 'lxns-oauth') {
          return { scoreProvider: new LxnsScoreProvider(session, (next) => onLxnsTokenRotation(account.id, next)), catalogProvider };
        }
        break;
      case 'diving-fish':
        if (session) return { scoreProvider: new DivingFishProvider(session), catalogProvider };
        break;
    }
  }
  if (account?.gameId === 'phigros') {
    if (account.providerId === 'phigros-test') {
      return {
        scoreProvider: new MaxedPhigrosTestProvider(account.displayName),
        catalogProvider: new PhigrosCatalogProvider() as unknown as DetailedCatalogProvider,
      };
    }
    if (session?.mode === 'phi-session') {
      return {
        scoreProvider: new PhigrosScoreProvider(session),
        catalogProvider: new PhigrosCatalogProvider() as unknown as DetailedCatalogProvider,
      };
    }
  }
  return { scoreProvider: new EmptyScoreProvider(), catalogProvider: new EmptyCatalogProvider() };
}
