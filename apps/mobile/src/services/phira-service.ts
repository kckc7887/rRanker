import type { PhiraChart, PhiraPlayerSnapshot, PhiraQueriedBest } from '@/domain/phira';
import { loadItemsBounded } from './offset-pagination';
import { phiraCache, phiraSource } from './phira-cache';
import { phiraProvider } from '@/providers/phira-provider';

export async function loadPhiraPlayerFresh(playerId: number, signal?: AbortSignal): Promise<PhiraPlayerSnapshot> {
  const [player, stats, rawPool, recent] = await Promise.all([
    phiraProvider.getUser(playerId, signal), phiraProvider.getUserStats(playerId, signal),
    phiraProvider.getPool(playerId, signal), phiraProvider.getRecent(playerId, signal),
  ]);
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
  await phiraCache.savePlayer(playerId, snapshot);
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
  const value = await readPhiraChartBest(playerId, chart, poolRks, signal);
  await phiraCache.mergeBests(playerId, [value]);
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
  playerId: number, items: readonly Pick<PhiraQueriedBest, 'chart' | 'poolRks'>[], signal?: AbortSignal,
) {
  const values: PhiraQueriedBest[] = [];
  await loadItemsBounded({
    items, concurrency: 4, signal,
    load: (item) => readPhiraChartBest(playerId, item.chart, item.poolRks, signal),
    onItem: (value) => values.push(value),
  });
  return phiraCache.mergeBests(playerId, values);
}

export async function refreshAllPhiraBests(playerId: number, signal?: AbortSignal) {
  const [snapshot, player] = await Promise.all([phiraCache.loadBests(playerId), phiraCache.loadPlayer(playerId)]);
  const items = new Map<number, Pick<PhiraQueriedBest, 'chart' | 'poolRks'>>();
  for (const item of Object.values(snapshot?.items ?? {})) items.set(item.chart.id, item);
  for (const pool of [...(player?.pool.recentPool ?? []), ...(player?.pool.bestPool ?? [])]) {
    items.set(pool.chart.id, { chart: pool.chart, poolRks: pool.rks });
  }
  return items.size ? refreshPhiraBestItems(playerId, [...items.values()], signal) : null;
}
