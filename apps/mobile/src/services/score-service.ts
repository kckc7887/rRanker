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
import { cacheFirstLoad, staleCached } from '@/services/cache-first';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';

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

/** 缓存优先渲染时的来源标记：label 原样保留，仅标记为缓存且过期（后台刷新中）。 */
export function staleCachedSnapshot(snapshot: ScoreSnapshot): ScoreSnapshot {
  return staleCached(snapshot);
}

/**
 * 同一账号并发 load 共享一次网络请求：
 * 总览（useGameData）与成绩/最佳页（useScoreSnapshot）会同时触发同一份成绩加载，
 * 去重后只向 provider 拉取一次，两侧分别回写各自查询缓存。
 */
const inflightScoreLoads = new Map<string, { promise: Promise<ScoreSnapshot>; signal: AbortSignal }>();

/**
 * 用户主动同步判定用：等待该账号最近一次网络成绩读取（缓存优先后台刷新）落定，吞掉失败兜底。
 * 无进行中的读取（已落定或未开始）时立即返回；落定后调用方可读取最终缓存判定真实结果。
 */
export function awaitScoreFresh(accountId: string): Promise<void> {
  const inflight = inflightScoreLoads.get(accountId);
  return inflight ? inflight.promise.then(() => undefined, () => undefined) : Promise.resolve();
}

export class ScoreService {
  constructor(
    private readonly scoreProvider: AnyScoreProvider,
    private readonly catalogProvider: DetailedCatalogProvider,
    private readonly accountId: string,
    private readonly snapshotRepository?: SnapshotRepository,
    private readonly catalogRepository?: CatalogRepository,
  ) {}

  private async loadCatalog(detailed = false, signal: AbortSignal): Promise<CatalogSnapshot> {
    try {
      const catalog = detailed
        ? await this.catalogProvider.getDetailedCatalog(signal)
        : await this.catalogProvider.getCatalog(signal);
      if (signal.aborted) throw signal.reason;
      if (!detailed) {
        const stopSave = startTimer('score.saveCatalog');
        await this.catalogRepository?.saveCatalog(catalog);
        stopSave();
      }
      return catalog;
    } catch (error) {
      if (detailed) throw error;
      const cached = await this.catalogRepository?.getLatestCatalog();
      if (!cached) throw error;
      return {
        ...cached,
        source: {
          ...cached.source,
          kind: 'cache',
          label: `LXNS 曲库缓存（原：${cached.source.label}）`,
          isStale: true,
        },
      };
    }
  }

  async load(signal: AbortSignal = getForegroundAbortSignal()): Promise<ScoreSnapshot> {
    const inflight = inflightScoreLoads.get(this.accountId);
    if (inflight && !inflight.signal.aborted) return inflight.promise;
    const fresh = this.loadFresh(signal);
    inflightScoreLoads.set(this.accountId, { promise: fresh, signal });
    void fresh.then(() => {
      if (inflightScoreLoads.get(this.accountId)?.promise === fresh) {
        inflightScoreLoads.delete(this.accountId);
      }
    }, () => {
      if (inflightScoreLoads.get(this.accountId)?.promise === fresh) {
        inflightScoreLoads.delete(this.accountId);
      }
    });
    return fresh;
  }

  /**
   * 缓存优先：先返回本地快照渲染首屏，同时后台发网络刷新；
   * 刷新成功后通过 onFresh 回写（供 hook 替换查询缓存，UI 静默更新）。
   * 无本地快照时直接走网络加载（含失败兜底）。
   * markStale=false 时返回原始快照（不标记过期），用于数据本身来自本地快照的账号（local）。
   */
  async loadCacheFirst(
    onFresh: (fresh: ScoreSnapshot) => void,
    markStale = true,
    signal: AbortSignal = getForegroundAbortSignal(),
  ): Promise<ScoreSnapshot> {
    if (!this.snapshotRepository) return this.load(signal);
    return cacheFirstLoad({
      loadCached: () => this.snapshotRepository!.getLatest(this.accountId),
      loadFresh: () => this.load(signal),
      onFresh,
      markStale: markStale ? staleCachedSnapshot : (snapshot) => snapshot,
      signal,
    });
  }

  private async loadFresh(signal: AbortSignal): Promise<ScoreSnapshot> {
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
      if (signal.aborted) throw signal.reason;
      const stopBuild = startTimer('score.buildSnapshot');
      const builtSnapshot = buildScoreSnapshot(player, rawRecords, catalog);
      const snapshot = catalogDriven ? withoutChartNotes(builtSnapshot) : builtSnapshot;
      stopBuild();
      const stopSave = startTimer('score.saveSnapshot');
      if (!signal.aborted) await this.snapshotRepository?.save(this.accountId, snapshot);
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
        label: `${needsLogin ? '登录已失效，请重新登录；' : ''}最近有效成绩`,
            isStale: true,
          },
        };
      }
      throw error;
    }
  }
}
