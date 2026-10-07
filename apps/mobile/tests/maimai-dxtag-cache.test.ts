import { DatabaseSync } from 'node:sqlite';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CatalogSnapshot, ChartType } from '@/domain/models';
import { loadCachedMaimaiDxTag } from '@/services/maimai-dxtag-cache';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const database = new DatabaseSync(':memory:');
const repository = new SqliteSnapshotRepository();
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async (sql: string) => database.exec(sql),
  runAsync: async (sql: string, ...args: (string | number)[]) => database.prepare(sql).run(...args),
  getFirstAsync: async (sql: string, ...args: (string | number)[]) => database.prepare(sql).get(...args) ?? null,
  getAllAsync: async (sql: string, ...args: (string | number)[]) => database.prepare(sql).all(...args),
  withTransactionAsync: async (task: () => Promise<void>) => {
    database.exec('BEGIN');
    try { await task(); database.exec('COMMIT'); }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  },
}) }));

const row = { difficulty: 3, scores: [1, 2, 3, 4, 5] };
function catalog(charts: [string, ChartType, number][] = [['1', 'SD', 3]]): CatalogSnapshot {
  return {
    currentVersion: { id: 1, title: 'current' }, versions: [], chartVersionIndex: {},
    source: { kind: 'lxns', label: 'LXNS', updatedAt: '2026-10-07T00:00:00.000Z', isStale: false },
    songs: charts.map(([songId, type, levelIndex]) => ({ id: songId, title: songId, version: 'current',
      charts: [{ songId, type, levelIndex, difficulty: 'master', level: '13', difficultyConstant: 13 }],
    })),
  };
}
const fetcher = vi.fn<typeof fetch>();
function respond(library: unknown) {
  fetcher.mockImplementation(async () => new Response(JSON.stringify(library)));
}
beforeEach(async () => {
  await repository.initialize();
  await repository.clearResources((await repository.listResourceSizes()).map(item => item.key));
  fetcher.mockReset();
  vi.stubGlobal('fetch', fetcher);
  respond({ '1': [row] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
afterAll(() => database.close());

it('retains a complete library regardless of age and ignores extra data and utage', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
  respond({ '1': [row], '10001': [row] });
  const saved = await loadCachedMaimaiDxTag(catalog());
  vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
  fetcher.mockClear();
  const reused = await loadCachedMaimaiDxTag(catalog([['1', 'SD', 3], ['100001', 'UTAGE', 0]]));
  expect(reused).toEqual(saved);
  expect(fetcher).not.toHaveBeenCalled();
  expect((await repository.listResourceSizes())).toHaveLength(1);
});

it.each<[string, ChartType, number]>([['2', 'SD', 3], ['1', 'DX', 3], ['1', 'SD', 4]])(
  'refreshes all.json for a missing chart or difficulty: %s %s %s', async (id, type, difficulty) => {
    await loadCachedMaimaiDxTag(catalog());
    const key = String(Number(id) + (type === 'DX' ? 10000 : 0));
    const library = { '1': [row], [key]: [...(key === '1' ? [row] : []), { ...row, difficulty }] };
    respond(library);
    fetcher.mockClear();
    expect((await loadCachedMaimaiDxTag(catalog([['1', 'SD', 3], [id, type, difficulty]]))).library).toEqual(library);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['https://rranker-maimai-data.cn-nb1.rains3.com/DXTag/all.json']);
  },
);

it('keeps cached data and its fetch time after a failed update, then retries successfully', async () => {
  const saved = await loadCachedMaimaiDxTag(catalog());
  const updated = catalog([['1', 'SD', 3], ['2', 'SD', 3]]);
  fetcher.mockImplementation(async () => new Response('', { status: 503 }));
  expect(await loadCachedMaimaiDxTag(updated)).toEqual({ ...saved, source: { ...saved.source, isStale: true } });
  expect(await loadCachedMaimaiDxTag(catalog())).toEqual(saved);
  respond({ '1': [row], '2': [row] });
  const fresh = await loadCachedMaimaiDxTag(updated);
  expect(fresh.library['2']).toEqual([row]);
  expect(fresh.source.isStale).toBe(false);
});

it.each([{}, { '1': [{ ...row, difficulty: 2 }] }])('retains valid partial libraries without inventing absent values', async library => {
  respond(library);
  expect((await loadCachedMaimaiDxTag(catalog())).library).toEqual(library);
  respond({ '1': [row] });
  expect((await loadCachedMaimaiDxTag(catalog())).library['1']).toEqual([row]);
});

it.each([[row], { '1': [row, row] }, { '1': [{ ...row, scores: [1, 2, 3, 4, 11] }] }])(
  'rejects invalid library responses without persisting them', async library => {
    respond(library);
    await expect(loadCachedMaimaiDxTag(catalog())).rejects.toMatchObject({ code: 'upstream_schema' });
    expect(await repository.listResourceSizes()).toEqual([]);
  },
);

it('does not cache a missing library and allows a later retry', async () => {
  fetcher.mockImplementation(async () => new Response('', { status: 404 }));
  await expect(loadCachedMaimaiDxTag(catalog())).rejects.toMatchObject({ code: 'no_data' });
  expect(await repository.listResourceSizes()).toEqual([]);
  respond({ '1': [row] });
  expect((await loadCachedMaimaiDxTag(catalog())).library['1']).toEqual([row]);
});

it.each(['abort', 'clear'])('prevents late cache writes after %s', async reason => {
  let finish!: (response: Response) => void;
  fetcher.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const controller = new AbortController();
  const pending = loadCachedMaimaiDxTag(catalog(), controller.signal);
  const rejected = expect(pending).rejects.toBeDefined();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
  if (reason === 'abort') controller.abort();
  else invalidateResourceWrites('maimai');
  finish(new Response(JSON.stringify({ '1': [row] })));
  await rejected;
  expect(await repository.listResourceSizes()).toEqual([]);
});
