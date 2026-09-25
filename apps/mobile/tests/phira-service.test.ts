import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhiraBestSnapshot, PhiraPlayerSnapshot, PhiraQueriedBest } from '@/domain/phira';
import { PhiraChartSchema, PhiraRecordSchema, PhiraUserSchema, PhiraUserStatsSchema } from '@/domain/phira';
import { phiraProvider } from '@/providers/phira-provider';
import { phiraCache } from '@/services/phira-cache';
import { loadPhiraPlayerFresh, queryPhiraChartBest, refreshAllPhiraBests, refreshPhiraBestTargets, refreshPhiraSeedBests } from '@/services/phira-service';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {} }));

const chart = (id: number) => PhiraChartSchema.parse({
  id, name: `Chart ${id}`, level: '自由难度名', difficulty: 14.5, uploader: 9,
});
const record = (id: number, chartId: number, best: boolean) => PhiraRecordSchema.parse({
  id, chart: chartId, score: 900_000, accuracy: .95, best,
});
const queriedBest = (chartId: number): PhiraQueriedBest =>
  ({ chart: chart(chartId), record: null, poolRks: null, queriedAt: '2026-01-01T00:00:00.000Z' });
const playerSnapshot = (seedChartIds: readonly number[]): PhiraPlayerSnapshot => ({
  player: PhiraUserSchema.parse({ id: 323528, name: '玩家' }),
  stats: PhiraUserStatsSchema.parse({}),
  pool: { bestPool: [], recentPool: [], rks: 12 },
  recent: [], seedCharts: seedChartIds.map(chart),
  source: { kind: 'phira', label: 'Phira 社区公开数据', updatedAt: '2026-01-01T00:00:00.000Z', isStale: false },
});
const mergedBests = (values: readonly PhiraQueriedBest[], updatedAt: string): PhiraBestSnapshot => ({
  items: Object.fromEntries(values.map((value) => [String(value.chart.id), value])),
  source: { kind: 'phira', label: 'Phira 社区公开数据', updatedAt, isStale: false },
});

describe('Phira player seed and best service', () => {
  afterEach(() => vi.restoreAllMocks());

  it('deduplicates pool and Recent chart ids, then preserves official pool order', async () => {
    vi.spyOn(phiraProvider, 'getUser').mockResolvedValue(PhiraUserSchema.parse({ id: 323528, name: '玩家' }));
    vi.spyOn(phiraProvider, 'getUserStats').mockResolvedValue(PhiraUserStatsSchema.parse({ numRecords: 3, avgAccuracy: .9 }));
    vi.spyOn(phiraProvider, 'getPool').mockResolvedValue({
      bestPool: [{ record: 11, chart: 2, rks: 12 }, { record: 22, chart: 1, rks: 11 }],
      recentPool: [{ record: 11, chart: 2, rks: 12 }], rks: 12,
    });
    vi.spyOn(phiraProvider, 'getRecent').mockResolvedValue([record(33, 3, false)]);
    const chartsByIds = vi.spyOn(phiraProvider, 'getChartsByIds').mockResolvedValue([chart(3), chart(1), chart(2)]);
    vi.spyOn(phiraProvider, 'getRecordsByIds').mockResolvedValue([record(22, 1, true), record(11, 2, true)]);
    vi.spyOn(phiraCache, 'savePlayer').mockResolvedValue(undefined);

    const snapshot = await loadPhiraPlayerFresh(323528);
    expect(chartsByIds).toHaveBeenCalledWith([2, 1, 3], undefined);
    expect(snapshot.pool.bestPool.map((item) => item.chart.id)).toEqual([2, 1]);
    expect(snapshot.seedCharts.map((item) => item.id)).toEqual([3, 1, 2]);
  });

  it('accepts only explicit best=true and caches an unplayed tombstone', async () => {
    const target = chart(38294);
    vi.spyOn(phiraProvider, 'getChartBest').mockResolvedValue([
      record(1, target.id, false), record(2, target.id, false),
    ]);
    const merge = vi.spyOn(phiraCache, 'mergeBests').mockImplementation(async (_id, values) => ({
      items: { [target.id]: values[0] }, source: { kind: 'phira', label: 'test', updatedAt: 'now', isStale: false },
    }));
    const result = await queryPhiraChartBest(323528, target, null);
    expect(result.record).toBeNull();
    expect(merge).toHaveBeenCalledWith(323528, [expect.objectContaining({ chart: target, record: null })], expect.any(Function));
  });
  it('does not start a new best refresh from cache reads invalidated by account removal', async () => {
    const pending = Promise.withResolvers<null>();
    vi.spyOn(phiraCache, 'loadBests').mockReturnValue(pending.promise);
    vi.spyOn(phiraCache, 'loadPlayer').mockResolvedValue(null);
    const requests = vi.spyOn(phiraProvider, 'getChartBest');
    const refreshing = refreshAllPhiraBests(323528);
    invalidateResourceWrites('account:phira:community:323528');
    pending.resolve(null);
    await expect(refreshing).rejects.toThrow('缓存请求已失效');
    expect(requests).not.toHaveBeenCalled();
  });

  it('reports a fully failed seed refresh as failed and keeps the cached update time', async () => {
    const cached = mergedBests([queriedBest(5)], '2026-01-01T00:00:00.000Z');
    vi.spyOn(phiraCache, 'loadBests').mockResolvedValue(cached);
    const merge = vi.spyOn(phiraCache, 'mergeBests');
    vi.spyOn(phiraProvider, 'getChartBest').mockRejectedValue(new Error('network down'));

    const result = await refreshPhiraSeedBests(playerSnapshot([7, 8]));

    expect(result.refresh.status).toBe('failed');
    expect(result.refresh.updatedChartIds).toEqual([]);
    expect(result.refresh.requestedChartIds).toEqual([7, 8]);
    expect(result.refresh.failures.map((failure) => failure.chartId).sort()).toEqual([7, 8]);
    // 失败明细带上重试所需的谱面，页面只重试失败项时不必重建候选集合。
    expect(result.refresh.failures.map((failure) => failure.target.chart.id).sort()).toEqual([7, 8]);
    // 缓存回退返回旧数据，不代表本次刷新成功。
    expect(result.snapshot?.source.updatedAt).toBe(cached.source.updatedAt);
    expect(result.snapshot?.items).toEqual(cached.items);
    // 全失败只提交成功项集合（此处为空）；空集合不写入，见 PhiraCache 的空合并合同。
    expect(merge).toHaveBeenCalledWith(323528, [], expect.any(Function));
  });

  it('keeps the failure summary when nothing is cached yet', async () => {
    vi.spyOn(phiraCache, 'loadBests').mockResolvedValue(null);
    vi.spyOn(phiraCache, 'mergeBests').mockResolvedValue(null);
    vi.spyOn(phiraProvider, 'getChartBest').mockRejectedValue(new Error('network down'));

    const result = await refreshPhiraSeedBests(playerSnapshot([7, 8]));

    expect(result.refresh).toMatchObject({ status: 'failed', requestedChartIds: [7, 8], updatedChartIds: [] });
    expect(result.refresh.failures.map((failure) => failure.chartId)).toEqual([7, 8]);
    // 没有可用成绩可保留时 snapshot 为 null，但本次操作的结果仍然存在。
    expect(result.snapshot).toBeNull();
  });

  it('reports no-op for a refresh without candidates and does not touch the cache', async () => {
    vi.spyOn(phiraCache, 'loadBests').mockResolvedValue(null);
    vi.spyOn(phiraCache, 'loadPlayer').mockResolvedValue(null);
    const requests = vi.spyOn(phiraProvider, 'getChartBest');
    const merge = vi.spyOn(phiraCache, 'mergeBests');

    const result = await refreshAllPhiraBests(323528);

    expect(result.refresh).toMatchObject({
      status: 'noop', requestedChartIds: [], updatedChartIds: [], failures: [],
    });
    expect(result.snapshot).toBeNull();
    expect(requests).not.toHaveBeenCalled();
    expect(merge).not.toHaveBeenCalled();
  });

  it('retries only the targets reported by a failed refresh', async () => {
    vi.spyOn(phiraCache, 'loadBests').mockResolvedValue(null);
    let failOnce = true;
    vi.spyOn(phiraProvider, 'getChartBest').mockImplementation(async (_playerId, chartId) => {
      if (chartId === 11 && failOnce) { failOnce = false; throw new Error('boom'); }
      return [record(chartId * 10, chartId, true)];
    });
    vi.spyOn(phiraCache, 'mergeBests')
      .mockImplementation(async (_id, values) => mergedBests(values, '2026-05-05T00:00:00.000Z'));

    const first = await refreshPhiraSeedBests(playerSnapshot([11, 12]));
    expect(first.refresh.failures.map((failure) => failure.chartId)).toEqual([11]);

    const requests = vi.spyOn(phiraProvider, 'getChartBest').mockClear();
    const retried = await refreshPhiraBestTargets(323528, first.refresh.failures.map((failure) => failure.target));

    expect(requests.mock.calls.map((call) => call[1])).toEqual([11]);
    expect(retried.refresh.status).toBe('success');
    expect(retried.refresh.updatedChartIds).toEqual([11]);
  });

  it('submits only the successful charts and reports a partial refresh', async () => {
    vi.spyOn(phiraCache, 'loadBests').mockResolvedValue(null);
    vi.spyOn(phiraProvider, 'getChartBest').mockImplementation(async (_playerId, chartId) => {
      if (chartId === 11) return [record(111, 11, true)];
      throw new Error('boom');
    });
    const merge = vi.spyOn(phiraCache, 'mergeBests')
      .mockImplementation(async (_id, values) => mergedBests(values, '2026-03-03T00:00:00.000Z'));

    const result = await refreshPhiraSeedBests(playerSnapshot([11, 12]));

    expect(merge).toHaveBeenCalledTimes(1);
    expect(merge.mock.calls[0][1].map((value) => value.chart.id)).toEqual([11]);
    expect(result.refresh).toMatchObject({
      status: 'partial', updatedChartIds: [11], requestedChartIds: [11, 12],
    });
    expect(result.refresh.failures.map((failure) => failure.chartId)).toEqual([12]);
    // 部分成功按成功覆盖范围推进时间戳；未覆盖谱面的新鲜度仍看各自 queriedAt。
    expect(result.snapshot?.source.updatedAt).toBe('2026-03-03T00:00:00.000Z');
  });

  it('reports a fully successful account refresh as success', async () => {
    vi.spyOn(phiraCache, 'loadBests').mockResolvedValue(mergedBests([queriedBest(3)], '2026-01-01T00:00:00.000Z'));
    vi.spyOn(phiraCache, 'loadPlayer').mockResolvedValue(null);
    vi.spyOn(phiraProvider, 'getChartBest').mockImplementation(async (_playerId, chartId) => [record(chartId * 10, chartId, true)]);
    vi.spyOn(phiraCache, 'mergeBests')
      .mockImplementation(async (_id, values) => mergedBests(values, '2026-04-04T00:00:00.000Z'));

    const result = await refreshAllPhiraBests(323528);

    expect(result.refresh).toMatchObject({
      status: 'success', updatedChartIds: [3], requestedChartIds: [3], failures: [],
    });
    expect(result.snapshot?.source.updatedAt).toBe('2026-04-04T00:00:00.000Z');
  });
});
