import { phigrosPayloadFromSnapshot, type PhigrosGameDataPayload } from '@/domain/game-data';
import { resolvePhigrosAvatarUrl } from '@/services/phigros-avatar-resolver';
import { formatPhigrosDataMoney } from '@/domain/phigros';
import type { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import type { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { phigrosResources } from './phigros-resources';
import { type PhigrosSaveCache, stalePhigrosPayload } from './phigros-save-cache';

export async function loadPhigrosGameData({
  accountId, scoreProvider, catalogProvider, cache, hasSessionData, signal, assertCurrent,
}: {
  accountId: string;
  scoreProvider: Pick<PhigrosScoreProvider, 'invalidateCache' | 'getPlayer' | 'getRecords' | 'getBestSections' | 'getSummary' | 'getUserProfile' | 'getGameProgress' | 'getSaveUpdatedAt'>;
  catalogProvider: Pick<PhigrosCatalogProvider, 'getGameVersion' | 'getResourceUpdatedAt'>;
  cache: Pick<PhigrosSaveCache, 'load' | 'save'>;
  hasSessionData: boolean;
  signal: AbortSignal;
  assertCurrent: () => void;
}): Promise<PhigrosGameDataPayload> {
  const stored = hasSessionData ? null : await cache.load(accountId);
  let compatibleStored = stored;
  if (stored) {
    try {
      const release = await phigrosResources.load(signal);
      if (stored.resourceRevision !== release.revision) compatibleStored = null;
    } catch {
      if (signal.aborted) throw signal.reason;
    }
  }
  assertCurrent();
  if (compatibleStored) return stalePhigrosPayload(compatibleStored);

  const release = await phigrosResources.load(signal);
  scoreProvider.invalidateCache();
  const [player, records, bestSections, gameVersion, summary, userProfile, gameProgress] = await Promise.all([
    scoreProvider.getPlayer(signal),
    scoreProvider.getRecords(signal),
    scoreProvider.getBestSections(signal),
    catalogProvider.getGameVersion(signal),
    scoreProvider.getSummary(signal),
    scoreProvider.getUserProfile(signal),
    scoreProvider.getGameProgress(signal),
  ]);
  const checkRelease = () => {
    assertCurrent();
    if (signal.aborted) throw signal.reason;
    if (phigrosResources.peek()?.revision !== release.revision) throw new Error('Phigros release changed during score loading');
  };
  checkRelease();
  const saveUpdatedAt = scoreProvider.getSaveUpdatedAt() ?? new Date().toISOString();
  const avatarUrl = await resolvePhigrosAvatarUrl(gameVersion, summary.avatar);
  checkRelease();
  const payload = phigrosPayloadFromSnapshot({
    player, records, bestSections,
    challengeModeRank: summary.challengeModeRank,
    source: { kind: 'generated', label: 'TapTap云存档', updatedAt: saveUpdatedAt, isStale: false },
    progress: { cleared: summary.cleared, fullCombo: summary.fullCombo, phi: summary.phi },
  }, {
    kind: 'generated', label: `Phigros${gameVersion}`,
    updatedAt: catalogProvider.getResourceUpdatedAt() ?? saveUpdatedAt, isStale: false,
  }, {
    resourceRevision: release.revision, avatarUrl,
    avatarKey: userProfile?.avatar || summary.avatar || null,
    backgroundSongId: userProfile?.backgroundSongId || null,
    dataAmount: formatPhigrosDataMoney(gameProgress?.money ?? []),
  });
  void cache.save(accountId, payload, checkRelease).catch(() => undefined);
  return payload;
}
