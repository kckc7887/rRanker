import { captureResourceWrites, createInflightGuard } from '@/services/snapshot-cache-utils';
import { enrichRecordsWithCatalog, isUtageSongId } from '@/domain/catalog';
import { buildBest50, calculateChartRating } from '@/domain/rating';
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
import { staleCached } from '@/services/cache-first';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';

export function buildScoreSnapshot(
  player: Player,
  rawRecords: readonly ScoreRecord[],
  catalog: CatalogSnapshot,
): ScoreSnapshot {
  const enriched = enrichRecordsWithCatalog(
    rawRecords.filter((record) => !isUtageSongId(record.songId) || record.type === 'UTAGE'),
    catalog,
  );
  const derivesChartRating = player.source.kind === 'local' || player.source.kind === 'generated';
  const records = derivesChartRating
    ? enriched.map((record) => ({
      ...record,
      rating: calculateChartRating(record.difficultyConstant, record.achievements),
    }))
    : enriched;
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

function withoutChartNotes(snapshot: ScoreSnapshot): ScoreSnapshot {
  const strip = ({ notes: _notes, ...record }: ScoreRecord): ScoreRecord => record;
  return {
    ...snapshot,
    records: snapshot.records.map(strip),
    best50: {
      ...snapshot.best50,
      b35: snapshot.best50.b35.map(strip),
      b15: snapshot.best50.b15.map(strip),
    },
  };
}

export function staleCachedSnapshot(snapshot: ScoreSnapshot): ScoreSnapshot {
  return staleCached(snapshot);
}

const inflightScoreLoads = createInflightGuard<string>();

export class ScoreService {
  constructor(
    private readonly scoreProvider: AnyScoreProvider,
    private readonly catalogProvider: DetailedCatalogProvider,
    private readonly accountId: string,
    private readonly snapshotRepository?: SnapshotRepository,
    private readonly catalogRepository?: CatalogRepository,
    private readonly catalogLoader?: (
      detailed: boolean,
      signal: AbortSignal,
    ) => Promise<CatalogSnapshot>,
  ) {}

  private async loadCatalog(detailed = false, signal: AbortSignal): Promise<CatalogSnapshot> {
    const assertCurrent = captureResourceWrites('maimai', signal, this.accountId);
    try {
      const catalog = this.catalogLoader
        ? await this.catalogLoader(detailed, signal)
        : detailed
          ? await this.catalogProvider.getDetailedCatalog(signal)
          : await this.catalogProvider.getCatalog(signal);
      assertCurrent();
      if (!detailed) {
        const stopSave = startTimer('score.saveCatalog');
        await this.catalogRepository?.saveCatalog(catalog, assertCurrent);
        stopSave();
      }
      return catalog;
    } catch (error) {
      assertCurrent();
      if (detailed) throw error;
      const cached = await this.catalogRepository?.getLatestCatalog();
      if (!cached) throw error;
      return {
        ...cached,
        source: {
          ...cached.source,
          isStale: true,
        },
      };
    }
  }

  async load(signal: AbortSignal = getForegroundAbortSignal()): Promise<ScoreSnapshot> {
    return inflightScoreLoads.share(this.accountId, requestSignal => this.loadFresh(requestSignal), signal);
  }

  private async loadFresh(signal: AbortSignal): Promise<ScoreSnapshot> {
    const assertCurrent = captureResourceWrites('maimai', signal, this.accountId);
    const stopLoad = startTimer('score.load');
    try {
      let player: Player;
      let rawRecords: ScoreRecord[];
      let catalog: CatalogSnapshot;
      const catalogDriven = isCatalogDrivenScoreProvider(this.scoreProvider);
      if (catalogDriven) {
        const scoreProvider = this.scoreProvider;
        [player, catalog] = await Promise.all([
          timed('score.getPlayer', () => scoreProvider.getPlayer(signal)),
          timed('score.loadCatalog', () => this.loadCatalog(true, signal)),
        ]);
        rawRecords = await timed('score.getRecords', () => scoreProvider.getRecordsFromCatalog(catalog, signal));
      } else {
        const scoreProvider = this.scoreProvider;
        [player, rawRecords, catalog] = await Promise.all([
          timed('score.getPlayer', () => scoreProvider.getPlayer(signal)),
          timed('score.getRecords', () => scoreProvider.getRecords(signal)),
          timed('score.loadCatalog', () => this.loadCatalog(false, signal)),
        ]);
      }
      assertCurrent();
      const stopBuild = startTimer('score.buildSnapshot');
      const builtSnapshot = buildScoreSnapshot(player, rawRecords, catalog);
      const snapshot = catalogDriven ? withoutChartNotes(builtSnapshot) : builtSnapshot;
      stopBuild();
      const stopSave = startTimer('score.saveSnapshot');
      if (!signal.aborted) await this.snapshotRepository?.save(this.accountId, snapshot, assertCurrent);
      stopSave();
      stopLoad();
      return snapshot;
    } catch (error) {
      assertCurrent();
      stopLoad();
      if (error instanceof ProviderError && (error.code === 'authentication' || error.code === 'permission')) throw error;
      const cached = await this.snapshotRepository?.getLatest(this.accountId);
      if (cached) {
        const sanitized = withoutInvalidUtageRecords(cached);
        return {
          ...sanitized,
          source: {
            ...sanitized.source,
            isStale: true,
          },
        };
      }
      throw error;
    }
  }
}
