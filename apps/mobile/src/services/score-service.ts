import { enrichRecordsWithCatalog } from '@/domain/catalog';
import { buildBest50 } from '@/domain/rating';
import type { ScoreSnapshot } from '@/domain/models';
import type { CatalogProvider, ScoreProvider } from '@/providers/contracts';
import type { CatalogRepository } from '@/repositories/catalog-repository';
import type { SnapshotRepository } from '@/repositories/snapshot-repository';
import { CatalogService } from './catalog-service';

export class ScoreService {
  constructor(
    private readonly scoreProvider: ScoreProvider,
    private readonly catalogProvider: CatalogProvider,
    private readonly snapshotRepository?: SnapshotRepository,
    private readonly catalogRepository?: CatalogRepository,
  ) {}

  async load(): Promise<ScoreSnapshot> {
    try {
      const [player, rawRecords, catalog] = await Promise.all([
        this.scoreProvider.getPlayer(),
        this.scoreProvider.getRecords(),
        new CatalogService(this.catalogProvider, this.catalogRepository).load(),
      ]);
      const records = enrichRecordsWithCatalog(rawRecords, catalog);
      const best50 = buildBest50(player, records, catalog, player.source);
      const snapshot: ScoreSnapshot = {
        player,
        records,
        best50,
        source: player.source,
        catalogSource: catalog.source,
      };
      await this.snapshotRepository?.save(snapshot);
      return snapshot;
    } catch (error) {
      const cached = await this.snapshotRepository?.getLatest();
      if (cached) {
        return {
          ...cached,
          source: {
            ...cached.source,
            kind: 'cache',
            label: `最近有效成绩快照（原：${cached.source.label}）`,
            isStale: true,
          },
        };
      }
      throw error;
    }
  }
}
