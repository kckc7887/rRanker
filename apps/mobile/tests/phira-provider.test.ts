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

  it('rejects pre-cancelled requests without fetching and preserves the reason', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ id: 1, name: 'x', rks: 1 }));
    const provider = new PhiraProvider(fetcher as typeof fetch, 'https://test.invalid');
    const reason = new Error('gone');
    const controller = new AbortController();
    controller.abort(reason);
    await expect(provider.getUser(1, controller.signal)).rejects.toBe(reason);
    await expect(provider.downloadChart('https://test.invalid/chart.zip', controller.signal)).rejects.toBe(reason);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not retry a request cancelled in flight', async () => {
    const fetcher = vi.fn().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new Error('aborted')), { once: true });
      }),
    );
    const provider = new PhiraProvider(fetcher as unknown as typeof fetch, 'https://test.invalid');
    const controller = new AbortController();
    const pending = provider.getUser(1, controller.signal);
    await Promise.resolve();
    controller.abort(new Error('user left'));
    await expect(pending).rejects.toThrow('user left');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps schema and network failure messages on the shared request path', async () => {
    const schema = new PhiraProvider(
      vi.fn().mockResolvedValue(new Response('{broken', { status: 200 })) as typeof fetch,
      'https://test.invalid',
    );
    await expect(schema.getUser(1)).rejects.toMatchObject({
      code: 'upstream_schema',
      message: 'Phira 数据结构与已验证契约不一致',
    });
    const network = new PhiraProvider(
      vi.fn().mockRejectedValue(new Error('socket hang up')) as typeof fetch,
      'https://test.invalid',
    );
    await expect(network.getUser(1)).rejects.toMatchObject({
      code: 'network',
      message: '无法连接 Phira 社区服务',
    });
  });
});
