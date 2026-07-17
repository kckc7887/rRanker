import { enrichRecordsWithCatalog } from '@/domain/catalog';
import { buildBest50 } from '@/domain/rating';
import type { CatalogSnapshot, Player, ScoreRecord, ScoreSnapshot } from '@/domain/models';
import {
  isCatalogDrivenScoreProvider,
  type AnyScoreProvider,
  type DetailedCatalogProvider,
} from '@/providers/contracts';
import type { CatalogRepository } from '@/repositories/catalog-repository';
import type { SnapshotRepository } from '@/repositories/snapshot-repository';
import { ProviderError } from '@/providers/errors';

export function buildScoreSnapshot(
  player: Player,
  rawRecords: readonly ScoreRecord[],
  catalog: CatalogSnapshot,
): ScoreSnapshot {
  const records = enrichRecordsWithCatalog(rawRecords, catalog);
  let best50 = buildBest50(player, records, catalog, player.source);
  const derivesRatingFromBest50 = player.source.kind === 'local' || player.source.kind === 'generated';
  const effectivePlayer = derivesRatingFromBest50
    ? { ...player, rating: best50.rating }
    : player;
  if (effectivePlayer !== player) best50 = { ...best50, player: effectivePlayer };
  return {
    player: effectivePlayer,
    records,
    best50,
    source: player.source,
    catalogSource: catalog.source,
  };
}

export class ScoreService {
  constructor(
    private readonly scoreProvider: AnyScoreProvider,
    private readonly catalogProvider: DetailedCatalogProvider,
    private readonly accountId: string,
    private readonly snapshotRepository?: SnapshotRepository,
    private readonly catalogRepository?: CatalogRepository,
  ) {}

  private async loadCatalog(): Promise<CatalogSnapshot> {
    try {
      const catalog = await this.catalogProvider.getDetailedCatalog();
      await this.catalogRepository?.saveCatalog(catalog);
      return catalog;
    } catch (error) {
      const cached = await this.catalogRepository?.getLatestCatalog();
      if (!cached) throw error;
      return {
        ...cached,
        source: {
          ...cached.source,
          kind: 'cache',
          label: `LXNS 详细曲库缓存（原：${cached.source.label}）`,
          isStale: true,
        },
      };
    }
  }

  async load(): Promise<ScoreSnapshot> {
    try {
      let player: Player;
      let rawRecords: ScoreRecord[];
      let catalog: CatalogSnapshot;
      if (isCatalogDrivenScoreProvider(this.scoreProvider)) {
        [player, catalog] = await Promise.all([
          this.scoreProvider.getPlayer(),
          this.loadCatalog(),
        ]);
        rawRecords = await this.scoreProvider.getRecordsFromCatalog(catalog);
      } else {
        [player, rawRecords, catalog] = await Promise.all([
          this.scoreProvider.getPlayer(),
          this.scoreProvider.getRecords(),
          this.loadCatalog(),
        ]);
      }
      const snapshot = buildScoreSnapshot(player, rawRecords, catalog);
      await this.snapshotRepository?.save(this.accountId, snapshot);
      return snapshot;
    } catch (error) {
      const cached = await this.snapshotRepository?.getLatest(this.accountId);
      if (cached) {
        const needsLogin = error instanceof ProviderError && (error.code === 'authentication' || error.code === 'permission');
        return {
          ...cached,
          source: {
            ...cached.source,
            kind: 'cache',
            label: `${needsLogin ? '登录已失效，请重新登录；' : ''}最近有效成绩快照（原：${cached.source.label}）`,
            isStale: true,
          },
        };
      }
      throw error;
    }
  }
}
