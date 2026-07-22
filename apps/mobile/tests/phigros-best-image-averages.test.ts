import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScoreRecord } from '@/domain/models';
import {
  loadPhigrosAccAverages,
  phigrosAccAverageKey,
} from '@/features/phigros-best-image/load-phigros-acc-averages';

function record(songId: string, achievements: number): ScoreRecord {
  return {
    songId, title: songId, type: 'SD', levelIndex: 2, level: 'IN', difficulty: 'expert',
    difficultyConstant: 15, achievements, dxScore: 990000, rating: 14.5,
    fc: null, fs: null, rate: 'v', version: 'current',
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Phigros B30 Avg', () => {
  it('使用原项目 allAccAvg 协议并按当前 ACC 标记 Higher / Lower', async () => {
    const records = [record('Alpha.Artist', 99.5), record('Beta.Artist', 98.5)];
    const fetchMock = vi.fn(async (_url: string, _request: RequestInit) => ({
      ok: true,
      json: async () => ({ data: {
        'Alpha.Artist.0': { IN: { accAvg: 99.1 } },
        'Beta.Artist.0': { IN: { accAvg: 99.0 } },
      } }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPhigrosAccAverages(records, 16.1053);
    expect(result[phigrosAccAverageKey(records[0]!)]).toEqual({ value: 99.1, kind: 'Higher' });
    expect(result[phigrosAccAverageKey(records[1]!)]).toEqual({ value: 99.0, kind: 'Lower' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      songIds: ['Alpha.Artist.0', 'Beta.Artist.0'],
    });
  });

  it('B27 全部高于均值时切换到高两档的 Hyper / Finished 配色', async () => {
    const records = [record('Alpha.Artist', 99.5)];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { 'Alpha.Artist.0': { IN: { accAvg: 99.0 } } } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { 'Alpha.Artist.0': { IN: { accAvg: 99.7 } } } }) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadPhigrosAccAverages(records, 16.1053);
    expect(result[phigrosAccAverageKey(records[0]!)]).toEqual({ value: 99.7, kind: 'Hyper' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
