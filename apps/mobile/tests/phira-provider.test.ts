import { describe, expect, it, vi } from 'vitest';
import { PhiraProvider } from '@/providers/phira-provider';

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('PhiraProvider', () => {
  it('loads public player, stats and a pool shorter than 20', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ id: 323528, name: '尘言', rks: 15.1234 }))
      .mockResolvedValueOnce(response({ numRecords: 217, avgAccuracy: .991 }))
      .mockResolvedValueOnce(response({ bestPool: [{ record: 1, chart: 2, rks: 3 }], recentPool: [], rks: 15.1234 }));
    const provider = new PhiraProvider(fetcher as typeof fetch, 'https://test.invalid');
    await expect(provider.getUser(323528)).resolves.toMatchObject({ id: 323528, name: '尘言' });
    await expect(provider.getUserStats(323528)).resolves.toMatchObject({ numRecords: 217 });
    await expect(provider.getPool(323528)).resolves.toMatchObject({ bestPool: [{ record: 1, chart: 2 }], recentPool: [] });
  });

  it('only exposes the upstream explicit best marker to callers', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([
      { id: 1, chart: 38294, score: 900000, accuracy: .9, best: false },
      { id: 2, chart: 38294, score: 990000, accuracy: .99, best: true },
    ]));
    const records = await new PhiraProvider(fetcher as typeof fetch, 'https://test.invalid').getChartBest(323528, 38294);
    expect(records.filter((item) => item.best).map((item) => item.id)).toEqual([2]);
  });

  it('isolates pagination failures as provider errors', async () => {
    const provider = new PhiraProvider(vi.fn().mockResolvedValue(response({}, 500)) as typeof fetch, 'https://test.invalid');
    await expect(provider.getCharts({ status: 'ranked', page: 0 })).rejects.toMatchObject({ code: 'network' });
  });
});
