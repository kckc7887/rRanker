import { captureResourceWrites } from './snapshot-cache-utils';
import type { PhiraBestSnapshot, PhiraChart, PhiraPlayerSnapshot, PhiraQueriedBest } from '@/domain/phira';
import { loadItemsBounded } from './offset-pagination';
import { phiraCache, phiraSource } from './phira-cache';
import { phiraProvider } from '@/providers/phira-provider';

/**
 * 本次刷新的真实结果，不读错误文案即可判断：
 * - `success`：请求的谱面全部提交成功；
 * - `partial`：只提交了部分谱面，未提交项保留各自旧的 `queriedAt`；
 * - `failed`：请求过谱面但没有任何一项提交成功，此时不写入缓存，
 *   `source.updatedAt` 保持既有值；缓存回退不等于刷新成功；
 * - `noop`：本次没有需要刷新的谱面，没有发出请求。
 */
export type PhiraBestRefreshStatus = 'success' | 'partial' | 'failed' | 'noop';
/** 一次刷新请求的输入：谱面与它在官方池中的 RKS（不在池中时为 null）。 */
export type PhiraBestRefreshTarget = Pick<PhiraQueriedBest, 'chart' | 'poolRks'>;
export type PhiraBestRefreshFailure = {
  chartId: number;
  /** 失败项本身：只重试失败项时直接复用，不需要重建候选集合。 */
  target: PhiraBestRefreshTarget;
  error: unknown;
};
/** 本次调用的摘要，不写入缓存。 */
export type PhiraBestRefreshSummary = {
  status: PhiraBestRefreshStatus;
  /** 本次提交成功的谱面 id，按谱面 id 升序。 */
  updatedChartIds: number[];
  /** 本次失败的谱面与原因，按谱面 id 升序。 */
  failures: PhiraBestRefreshFailure[];
  /** 本次请求覆盖的谱面 id，按请求顺序；用于区分「全部失败」和「没有需要刷新的谱面」。 */
  requestedChartIds: number[];
};
/**
 * 一次刷新操作的结果：摘要始终存在，与缓存快照分开。
 * `snapshot` 是提交后的 bests 快照，只在有成功提交（或能读回既有快照）时存在；
 * 首次没有缓存且全部失败时为 null，此时仍有失败摘要可展示。
 */
export type PhiraBestRefreshResult = {
  refresh: PhiraBestRefreshSummary;
  snapshot: PhiraBestSnapshot | null;
};

const emptySummary = (status: PhiraBestRefreshStatus): PhiraBestRefreshSummary => ({
  status, updatedChartIds: [], failures: [], requestedChartIds: [],
});

export async function loadPhiraPlayerFresh(playerId: number, signal?: AbortSignal): Promise<PhiraPlayerSnapshot> {
  const assertCurrent = captureResourceWrites('phira', signal, `phira:community:${playerId}`);
  const [player, stats, rawPool, recent] = await Promise.all([
    phiraProvider.getUser(playerId, signal), phiraProvider.getUserStats(playerId, signal),
    phiraProvider.getPool(playerId, signal), phiraProvider.getRecent(playerId, signal),
  ]);
  assertCurrent();
  const seeds = [...rawPool.bestPool, ...rawPool.recentPool];
  const chartIds = [...new Set([...seeds.map((item) => item.chart), ...recent.map((record) => record.chart)])];
  const [charts, records] = await Promise.all([
    phiraProvider.getChartsByIds(chartIds, signal),
    phiraProvider.getRecordsByIds([...new Set(seeds.map((item) => item.record))], signal),
  ]);
  const chartById = new Map(charts.map((chart) => [chart.id, chart]));
  const recordById = new Map(records.map((record) => [record.id, record]));
  const hydrate = (items: typeof rawPool.bestPool) => items.flatMap((item) => {
    const chart = chartById.get(item.chart); const record = recordById.get(item.record);
    return chart && record ? [{ chart, record, rks: item.rks }] : [];
  });
  const pool = { bestPool: hydrate(rawPool.bestPool), recentPool: hydrate(rawPool.recentPool), rks: rawPool.rks };
  const snapshot = { player, stats, pool, recent, seedCharts: charts, source: phiraSource() };
  assertCurrent();
  await phiraCache.savePlayer(playerId, snapshot, assertCurrent);
  return snapshot;
}

export function phiraSeedCharts(snapshot: PhiraPlayerSnapshot): PhiraChart[] {
  if (snapshot.seedCharts?.length) return snapshot.seedCharts;
  const chartById = new Map<number, PhiraChart>();
  for (const item of [...snapshot.pool.bestPool, ...snapshot.pool.recentPool]) chartById.set(item.chart.id, item.chart);
  return [...chartById.values()];
}

export async function queryPhiraChartBest(
  playerId: number, chart: PhiraChart, poolRks: number | null, signal?: AbortSignal,
): Promise<PhiraQueriedBest> {
  const assertCurrent = captureResourceWrites('phira', signal, `phira:community:${playerId}`);
  const value = await readPhiraChartBest(playerId, chart, poolRks, signal);
  assertCurrent();
  await phiraCache.mergeBests(playerId, [value], assertCurrent);
  return value;
}

async function readPhiraChartBest(
  playerId: number, chart: PhiraChart, poolRks: number | null, signal?: AbortSignal,
): Promise<PhiraQueriedBest> {
  const records = await phiraProvider.getChartBest(playerId, chart.id, signal);
  const record = records.find((item) => item.best === true) ?? null;
  return { chart, record, poolRks, queriedAt: new Date().toISOString() };
}

export async function refreshPhiraSeedBests(snapshot: PhiraPlayerSnapshot, signal?: AbortSignal) {
  const rksByChart = new Map<number, number>();
  for (const item of [...snapshot.pool.recentPool, ...snapshot.pool.bestPool]) rksByChart.set(item.chart.id, item.rks);
  return refreshPhiraBestItems(snapshot.player.id, phiraSeedCharts(snapshot).map((chart) => ({
    chart, poolRks: rksByChart.get(chart.id) ?? null,
  })), signal);
}

async function refreshPhiraBestItems(
  playerId: number, items: readonly PhiraBestRefreshTarget[], signal?: AbortSignal,
): Promise<PhiraBestRefreshResult> {
  if (items.length === 0) return { refresh: emptySummary('noop'), snapshot: null };
  const assertCurrent = captureResourceWrites('phira', signal, `phira:community:${playerId}`);
  const values: PhiraQueriedBest[] = [];
  const failures = await loadItemsBounded({
    items, concurrency: 4, signal,
    load: (item) => readPhiraChartBest(playerId, item.chart, item.poolRks, signal),
    onItem: (value) => values.push(value),
  });
  if (signal?.aborted) throw signal.reason ?? new Error('phira refresh aborted');
  // 只提交成功项；全失败时 mergeBests 不写入，既有 updatedAt 与旧成绩保留。
  const snapshot = await phiraCache.mergeBests(playerId, values, assertCurrent);
  const sortedFailures = [...failures].sort((left, right) => left.item.chart.id - right.item.chart.id);
  return {
    refresh: {
      status: values.length === 0 ? 'failed' : failures.length === 0 ? 'success' : 'partial',
      updatedChartIds: values.map((value) => value.chart.id).sort((left, right) => left - right),
      failures: sortedFailures.map(({ item, error }) => ({ chartId: item.chart.id, target: item, error })),
      requestedChartIds: items.map((item) => item.chart.id),
    },
    snapshot,
  };
}

/** 刷新指定的谱面（失败项重试复用同一入口），语义与整表刷新一致。 */
export function refreshPhiraBestTargets(
  playerId: number, targets: readonly PhiraBestRefreshTarget[], signal?: AbortSignal,
): Promise<PhiraBestRefreshResult> {
  return refreshPhiraBestItems(playerId, targets, signal);
}

export async function refreshAllPhiraBests(playerId: number, signal?: AbortSignal): Promise<PhiraBestRefreshResult> {
  const assertCurrent = captureResourceWrites('phira', signal, `phira:community:${playerId}`);
  const [snapshot, player] = await Promise.all([phiraCache.loadBests(playerId), phiraCache.loadPlayer(playerId)]);
  assertCurrent();
  const items = new Map<number, PhiraBestRefreshTarget>();
  for (const item of Object.values(snapshot?.items ?? {})) items.set(item.chart.id, item);
  for (const pool of [...(player?.pool.recentPool ?? []), ...(player?.pool.bestPool ?? [])]) {
    items.set(pool.chart.id, { chart: pool.chart, poolRks: pool.rks });
  }
  return refreshPhiraBestItems(playerId, [...items.values()], signal);
}
