import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhiraChartSchema, PhiraRecordSchema, PhiraUserSchema, PhiraUserStatsSchema } from '@/domain/phira';
import { phiraProvider } from '@/providers/phira-provider';
import { phiraCache } from '@/services/phira-cache';
import { loadPhiraPlayerFresh, queryPhiraChartBest } from '@/services/phira-service';
vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {} }));

const chart = (id: number) => PhiraChartSchema.parse({
  id, name: `Chart ${id}`, level: '自由难度名', difficulty: 14.5, uploader: 9,
});
const record = (id: number, chartId: number, best: boolean) => PhiraRecordSchema.parse({
  id, chart: chartId, score: 900_000, accuracy: .95, best,
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
    expect(merge).toHaveBeenCalledWith(323528, [expect.objectContaining({ chart: target, record: null })]);
  });
});
