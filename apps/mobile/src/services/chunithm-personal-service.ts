import { captureResourceWrites, snapshotSource } from '@/services/snapshot-cache-utils';
import {
  CHUNITHM_PERSONAL_LEGACY_SCHEMA_VERSION,
  CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
  chunithmPersonalResourceKey,
  emptyChunithmBests,
  type ChunithmBests,
  type ChunithmPersonalSnapshot,
  type ChunithmPlayer,
  type ChunithmScore,
  type LegacyChunithmPersonalSnapshot,
} from '@/domain/chunithm-personal';
import { ProviderError } from '@/providers/errors';
import type { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import type { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { cacheFirstLoad, isCacheFallback, staleCached } from '@/services/cache-first';
import { loadItemsBounded } from '@/services/offset-pagination';
import {
  assertFreshSnapshotSource,
  cachedSnapshotSource,
  cancelledRefresh,
  failedRefresh,
  partialRefresh,
  refreshFailureFromError,
  snapshotMetadataOf,
  successfulRefresh,
  type RefreshFailure,
  type RefreshResult,
  type SnapshotMetadata,
} from '@/domain/refresh-result';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';

/**
 * 同一账号并发 load 共享一次网络请求：缓存优先后台刷新与用户主动同步等待共用同一 promise，
 * 保证同步判定等到的是与 UI 回写同一次读取的真实结果。
 */
const inflightChunithmLoads = new Map<string, { promise: Promise<ChunithmPersonalSnapshot>; signal: AbortSignal }>();

/**
 * 同一账号在途的分项刷新。它与 `load` 分开登记：`load` 交出快照，`refresh` 交出刷新结果，
 * 但用户主动同步的等待必须覆盖两者，否则只能靠事后重读缓存猜测刷新是否已经落定。
 */
const inflightChunithmRefreshes = new Map<string, {
  promise: Promise<RefreshResult<ChunithmPersonalSnapshot, ChunithmPersonalPart>>;
  signal: AbortSignal;
}>();

/** 一次个人数据刷新的项：每一项独立请求、独立失败。 */
export type ChunithmPersonalPart = 'player' | 'scores' | 'bests';

const CHUNITHM_PERSONAL_PARTS: readonly ChunithmPersonalPart[] = ['player', 'scores', 'bests'];
/** 个人数据的来源身份；落雪中二成绩与曲库共用同一提供方标识。 */
const CHUNITHM_PERSONAL_SOURCE = { kind: 'lxns', label: '落雪咖啡屋' } as const;

type ChunithmPartValue = ChunithmPlayer | null | ChunithmScore[] | ChunithmBests;

/**
 * 用户主动同步判定用：等待该账号最近一次网络个人成绩读取（缓存优先后台刷新或分项刷新）落定，
 * 吞掉失败兜底。无进行中的读取（已落定或未开始）时立即返回。
 */
export function awaitChunithmFresh(accountId: string): Promise<void> {
  const pending: Promise<unknown>[] = [];
  const load = inflightChunithmLoads.get(accountId);
  const refresh = inflightChunithmRefreshes.get(accountId);
  if (load) pending.push(load.promise);
  if (refresh) pending.push(refresh.promise);
  return Promise.all(pending.map((promise) => promise.then(() => undefined, () => undefined)))
    .then(() => undefined);
}

export class ChunithmPersonalService {
  constructor(
    private readonly provider: ChunithmScoreProvider,
    private readonly repository: SqliteSnapshotRepository,
    private readonly accountId: string,
  ) {}

  async load(
    signal: AbortSignal = getForegroundAbortSignal(),
    onFailure?: (failure: RefreshFailure) => void,
  ): Promise<ChunithmPersonalSnapshot> {
    const inflight = inflightChunithmLoads.get(this.accountId);
    if (inflight && !inflight.signal.aborted) return inflight.promise;
    const fresh = this.loadFresh(signal, onFailure);
    inflightChunithmLoads.set(this.accountId, { promise: fresh, signal });
    void fresh.then(() => {
      if (inflightChunithmLoads.get(this.accountId)?.promise === fresh) {
        inflightChunithmLoads.delete(this.accountId);
      }
    }, () => {
      if (inflightChunithmLoads.get(this.accountId)?.promise === fresh) {
        inflightChunithmLoads.delete(this.accountId);
      }
    });
    return fresh;
  }

  /**
   * 本地快照读取。它是缓存读取，不是新鲜结果：来源保留原提供方与抓取时间，只标记过期，
   * 调用端据 `isStale` 判断数据是否已刷新，不得把它当成本次同步成功。
   */
  async loadCached(): Promise<ChunithmPersonalSnapshot | null> {
    const key = chunithmPersonalResourceKey(this.accountId);
    const cached = await this.repository.getResource<ChunithmPersonalSnapshot>(
      key,
      CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
    );
    if (cached) return { ...cached, source: cachedSnapshotSource(cached.source) };
    const legacy = await this.repository.getResource<LegacyChunithmPersonalSnapshot>(
      key,
      CHUNITHM_PERSONAL_LEGACY_SCHEMA_VERSION,
    );
    if (!legacy) return null;
    return { ...legacy, bests: emptyChunithmBests(), source: cachedSnapshotSource(legacy.source) };
  }

  private async loadFresh(
    signal: AbortSignal,
    onFailure?: (failure: RefreshFailure) => void,
  ): Promise<ChunithmPersonalSnapshot> {
    const assertCurrent = captureResourceWrites('chunithm', signal, this.accountId);
    try {
      const snapshot = await this.provider.getSnapshot(signal);
      assertCurrent();
      await this.repository.saveResource(
        chunithmPersonalResourceKey(this.accountId),
        CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
        snapshot.source.updatedAt,
        snapshot,
        assertCurrent,
      );
      return snapshot;
    } catch (error) {
      assertCurrent();
      if (error instanceof ProviderError && error.code === 'authentication') throw error;
      const compatible = await this.loadCached();
      if (!compatible) throw error;
      // 缓存兜底不是刷新成功：只在这里交出机器错误码，调用端不必读错误文案。
      onFailure?.(refreshFailureFromError(error));
      return {
        ...compatible,
        source: {
          ...compatible.source,
          label: '落雪咖啡屋（缓存）',
          isStale: true,
        },
      };
    }
  }

  private loadPart(part: ChunithmPersonalPart, signal: AbortSignal): Promise<ChunithmPartValue> {
    if (part === 'player') return this.provider.getPlayer(signal);
    if (part === 'scores') return this.provider.getScores(signal);
    return this.provider.getBests(signal);
  }

  private async save(snapshot: ChunithmPersonalSnapshot, assertCurrent: () => void): Promise<void> {
    await this.repository.saveResource(
      chunithmPersonalResourceKey(this.accountId),
      CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
      snapshot.source.updatedAt,
      snapshot,
      assertCurrent,
    );
  }

  /** 旧快照的元数据；来源缺失或被标成缓存时没有可保留的提供方。 */
  private static previousMetadata(previous: ChunithmPersonalSnapshot | null): SnapshotMetadata | null {
    if (!previous || previous.source.kind === 'cache') return null;
    return snapshotMetadataOf(previous.source);
  }

  /**
   * 一次中二个人数据刷新：player、scores、bests 各自独立提交。
   * 只有三项全部完成才推进快照抓取时间；部分完成时保留成功项、保留失败项的具体 target 与
   * 机器错误码，并用旧时间加过期标记发布仍可使用的合并快照；全失败不写入缓存。
   */
  async refresh(
    signal: AbortSignal = getForegroundAbortSignal(),
  ): Promise<RefreshResult<ChunithmPersonalSnapshot, ChunithmPersonalPart>> {
    const inflight = inflightChunithmRefreshes.get(this.accountId);
    if (inflight && !inflight.signal.aborted) return inflight.promise;
    const pending = this.runRefresh(signal);
    inflightChunithmRefreshes.set(this.accountId, { promise: pending, signal });
    const forget = () => {
      if (inflightChunithmRefreshes.get(this.accountId)?.promise === pending) {
        inflightChunithmRefreshes.delete(this.accountId);
      }
    };
    void pending.then(forget, forget);
    return pending;
  }

  private async runRefresh(
    signal: AbortSignal,
  ): Promise<RefreshResult<ChunithmPersonalSnapshot, ChunithmPersonalPart>> {
    const assertCurrent = captureResourceWrites('chunithm', signal, this.accountId);
    const previous = await this.loadCached();
    assertCurrent();
    const parts = new Map<ChunithmPersonalPart, ChunithmPartValue>();
    const failures = await loadItemsBounded({
      items: CHUNITHM_PERSONAL_PARTS,
      concurrency: CHUNITHM_PERSONAL_PARTS.length,
      signal,
      load: part => this.loadPart(part, signal),
      onItem: (value, part) => { parts.set(part, value); },
    });
    if (signal.aborted) return cancelledRefresh<ChunithmPersonalSnapshot, ChunithmPersonalPart>(CHUNITHM_PERSONAL_PARTS);
    assertCurrent();
    const completed = CHUNITHM_PERSONAL_PARTS.filter(part => parts.has(part));
    const refreshFailures = failures
      .map(({ item, error }) => refreshFailureFromError(error, item))
      .sort((left, right) => (
        CHUNITHM_PERSONAL_PARTS.indexOf(left.target as ChunithmPersonalPart)
        - CHUNITHM_PERSONAL_PARTS.indexOf(right.target as ChunithmPersonalPart)
      ));
    if (refreshFailures.length === 0) {
      const source = snapshotSource(CHUNITHM_PERSONAL_SOURCE);
      assertFreshSnapshotSource(source);
      const snapshot: ChunithmPersonalSnapshot = {
        player: (parts.get('player') ?? null) as ChunithmPlayer | null,
        scores: (parts.get('scores') ?? []) as ChunithmScore[],
        bests: (parts.get('bests') ?? emptyChunithmBests()) as ChunithmBests,
        source,
      };
      await this.save(snapshot, assertCurrent);
      return successfulRefresh<ChunithmPersonalSnapshot, ChunithmPersonalPart>({
        value: snapshot, metadata: snapshotMetadataOf(source), requested: CHUNITHM_PERSONAL_PARTS,
      });
    }
    const metadata = ChunithmPersonalService.previousMetadata(previous);
    const usable = metadata && previous ? previous : null;
    if (completed.length === 0 || !usable) {
      // 没有新项，或没有旧快照可以补齐失败项：不写入、不推进完整成功时间。
      return failedRefresh<ChunithmPersonalSnapshot, ChunithmPersonalPart>({
        value: usable ? { ...usable, source: cachedSnapshotSource(usable.source) } : null,
        metadata,
        requested: CHUNITHM_PERSONAL_PARTS,
        completed,
        failures: refreshFailures,
      });
    }
    const merged: ChunithmPersonalSnapshot = {
      player: parts.has('player') ? (parts.get('player') as ChunithmPlayer | null) : usable.player,
      scores: parts.has('scores') ? (parts.get('scores') as ChunithmScore[]) : usable.scores,
      bests: parts.has('bests') ? (parts.get('bests') as ChunithmBests) : usable.bests,
      // 保留原提供方与抓取时间；该范围没有完整刷新，用过期标记表达而不是改写成当前时间。
      source: cachedSnapshotSource(usable.source),
    };
    await this.save(merged, assertCurrent);
    return partialRefresh<ChunithmPersonalSnapshot, ChunithmPersonalPart>({
      value: merged,
      metadata: snapshotMetadataOf(usable.source),
      requested: CHUNITHM_PERSONAL_PARTS,
      completed,
      failures: refreshFailures,
    });
  }

  /**
   * 缓存优先：先返回本地快照渲染首屏，同时后台发网络刷新；
   * 只有真正取回新数据的刷新才进入 onFresh，缓存兜底进入 onFallback 并带上机器错误码。
   * 无本地快照时直接走网络加载（含失败兜底）。
   */
  async loadCacheFirst(
    onFresh: (fresh: ChunithmPersonalSnapshot) => void,
    signal: AbortSignal = getForegroundAbortSignal(),
    onFallback?: (fallback: ChunithmPersonalSnapshot, failure: RefreshFailure | null) => void,
  ): Promise<ChunithmPersonalSnapshot> {
    let lastFailure: RefreshFailure | null = null;
    return cacheFirstLoad({
      assertCurrent: captureResourceWrites('chunithm', signal, this.accountId),
      loadCached: () => this.loadCached(),
      loadFresh: (requestSignal) => this.load(requestSignal, (failure) => { lastFailure = failure; }),
      onFresh,
      // 缓存兜底不是刷新成功：服务显式声明结果来自本地快照，不依赖调用端推断来源标记。
      isFallback: value => isCacheFallback(value),
      onFallback: (value, failure) => onFallback?.(value, failure ?? lastFailure),
      onRefreshFailed: (failure) => { lastFailure = failure; },
      markStale: (snapshot) => staleCached(snapshot, { label: '落雪咖啡屋（缓存）' }),
      signal,
    });
  }
}
