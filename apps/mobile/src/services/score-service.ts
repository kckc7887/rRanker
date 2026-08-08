import { enrichRecordsWithCatalog, isUtageSongId } from '@/domain/catalog';
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
import { startTimer, timed } from '@/utils/startup-timing';

export function buildScoreSnapshot(
  player: Player,
  rawRecords: readonly ScoreRecord[],
  catalog: CatalogSnapshot,
): ScoreSnapshot {
  const records = enrichRecordsWithCatalog(
    rawRecords.filter((record) => !isUtageSongId(record.songId) || record.type === 'UTAGE'),
    catalog,
  );
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

function withoutInvalidUtageRecords(snapshot: ScoreSnapshot): ScoreSnapshot {
  const records = snapshot.records.filter(
    (record) => !isUtageSongId(record.songId) || record.type === 'UTAGE',
  );
  const removedInvalidRecordCount = snapshot.records.length - records.length;
  const b35 = snapshot.best50.b35.filter(
    (record) => !isUtageSongId(record.songId) && record.type !== 'UTAGE',
  );
  const b15 = snapshot.best50.b15.filter(
    (record) => !isUtageSongId(record.songId) && record.type !== 'UTAGE',
  );
  if (records.length === snapshot.records.length &&
    b35.length === snapshot.best50.b35.length &&
    b15.length === snapshot.best50.b15.length) {
    return snapshot;
  }
  return {
    ...snapshot,
    records,
    best50: {
      ...snapshot.best50,
      b35,
      b15,
      rating: [...b35, ...b15].reduce((total, record) => total + record.rating, 0),
      unmatchedRecordCount: Math.max(
        0,
        snapshot.best50.unmatchedRecordCount - removedInvalidRecordCount,
      ),
    },
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
      const stopSave = startTimer('score.saveCatalog');
      await this.catalogRepository?.saveCatalog(catalog);
      stopSave();
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
    const stopLoad = startTimer('score.load');
    try {
      let player: Player;
      let rawRecords: ScoreRecord[];
      let catalog: CatalogSnapshot;
      if (isCatalogDrivenScoreProvider(this.scoreProvider)) {
        const scoreProvider = this.scoreProvider;
        [player, catalog] = await Promise.all([
          timed('score.getPlayer', () => scoreProvider.getPlayer()),
          timed('score.loadCatalog', () => this.loadCatalog()),
        ]);
        rawRecords = await timed('score.getRecords', () => scoreProvider.getRecordsFromCatalog(catalog));
      } else {
        const scoreProvider = this.scoreProvider;
        [player, rawRecords, catalog] = await Promise.all([
          timed('score.getPlayer', () => scoreProvider.getPlayer()),
          timed('score.getRecords', () => scoreProvider.getRecords()),
          timed('score.loadCatalog', () => this.loadCatalog()),
        ]);
      }
      const stopBuild = startTimer('score.buildSnapshot');
      const snapshot = buildScoreSnapshot(player, rawRecords, catalog);
      stopBuild();
      const stopSave = startTimer('score.saveSnapshot');
      await this.snapshotRepository?.save(this.accountId, snapshot);
      stopSave();
      stopLoad();
      return snapshot;
    } catch (error) {
      stopLoad();
      const cached = await this.snapshotRepository?.getLatest(this.accountId);
      if (cached) {
        const sanitized = withoutInvalidUtageRecords(cached);
        const needsLogin = error instanceof ProviderError && (error.code === 'authentication' || error.code === 'permission');
        return {
          ...sanitized,
          source: {
            ...sanitized.source,
            kind: 'cache',
            label: `${needsLogin ? '登录已失效，请重新登录；' : ''}最近有效成绩快照（原：${sanitized.source.label}）`,
            isStale: true,
          },
        };
      }
      throw error;
    }
  }
}
