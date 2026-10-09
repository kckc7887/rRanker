import { simaiDifficultyScores } from '@/features/simai-difficulty';
import { DatabaseSync } from 'node:sqlite';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMajdataCached, loadMajdataFresh, loadMajdataSong, loadMajdataSongSnapshot, loadMajdataChart, loadMajdataParsedChart, clearMajdataAccount, majdataSongKey } from '@/services/majdata-service';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { MajdataSongSchema } from '@/domain/majdata';
import type { HttpCookieSession } from '@/providers/http-cookies';
const mock = vi.hoisted(() => ({ getSong: vi.fn(), getChart: vi.fn(), getPlayer: vi.fn(), getRecords: vi.fn(), getRecent: vi.fn() }));
const database = new DatabaseSync(':memory:');
const repository = new SqliteSnapshotRepository();
let resourceReadError: Error | undefined;
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async (sql: string) => database.exec(sql),
  runAsync: async (sql: string, ...args: (string | number)[]) => database.prepare(sql).run(...args),
  getFirstAsync: async (sql: string, ...args: (string | number)[]) => {
    if (resourceReadError && sql.includes('FROM resource_snapshots')) throw resourceReadError;
    return database.prepare(sql).get(...args) ?? null;
  },
  getAllAsync: async (sql: string, ...args: (string | number)[]) => database.prepare(sql).all(...args),
  withTransactionAsync: async (task: () => Promise<void>) => {
    database.exec('BEGIN'); try { await task(); database.exec('COMMIT'); }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  },
}) }));
afterAll(() => database.close());

vi.mock('@/providers/majdata-provider', () => ({ majdataProvider: mock, MajdataProvider: class {
  getPlayer = mock.getPlayer; getRecords = mock.getRecords; getRecent = mock.getRecent;
} }));
vi.mock('@/state/session-store', () => ({ useSession: { getState: () => ({ sessionsByAccountId: {} }), setState: vi.fn() } }));

const song = MajdataSongSchema.parse({ id: 'uuid-full-001', title: 'song', hash: 'hash1', timestamp: '2026-09-01', levels: ['', '', '', '', '14', '', '宴'] });
const cachedSource = { kind: 'majdata-net', label: 'Majdata Net', updatedAt: '2026-09-01T00:00:00.000Z', isStale: false };
const session: HttpCookieSession = { mode: 'http-cookies', origin: 'https://majdata.net', cookies: [{ name: 'auth', value: 'value', secure: true, path: '/' }], persistable: true };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(async () => { resourceReadError = undefined; await repository.initialize(); await repository.clearResources((await repository.listResourceSizes()).map(item => item.key)); vi.clearAllMocks(); mock.getSong.mockResolvedValue(song); mock.getChart.mockResolvedValue('&inote_5=(120)1,\n&inote_7=(120)2m,'); mock.getPlayer.mockResolvedValue({ username: 'player' }); mock.getRecords.mockResolvedValue([]); mock.getRecent.mockResolvedValue([]); });
describe('Majdata revision and account cache', () => {
  it('does not reuse an unsupported song snapshot when offline', async () => {
    await repository.saveResource(majdataSongKey(song.id), 1, 'now', { song });
    mock.getSong.mockRejectedValue(new Error('offline'));
    await expect(loadMajdataSong(song.id)).rejects.toThrow('offline');
  });
  it('isolates account snapshots and removal', async () => {
    await loadMajdataFresh('a', session); await loadMajdataFresh('b', session);
    await clearMajdataAccount('a'); expect(await loadMajdataCached('a')).toBeNull(); expect(await loadMajdataCached('b')).not.toBeNull();
  });
  it('renders a local detail before its fresh request resolves', async () => {
    await repository.saveResource(majdataSongKey(song.id), 1, 'now', { song, source: cachedSource }); const fresh = deferred<typeof song>(); mock.getSong.mockReturnValue(fresh.promise);
    const onFresh = vi.fn(); expect(await loadMajdataSong(song.id, undefined, onFresh)).toEqual(song);
    expect(onFresh).not.toHaveBeenCalled(); fresh.resolve({ ...song, hash: 'hash2' }); await vi.waitFor(() => expect(onFresh).toHaveBeenCalledWith(expect.objectContaining({ hash: 'hash2' })));
  });
  it('records the original provider and fetch time on the cached song snapshot', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
    try {
      await loadMajdataSong(song.id);
      const stored = await loadMajdataSongSnapshot(song.id);
      expect(stored?.song).toEqual(song);
      expect(stored?.source).toEqual({
        kind: 'majdata-net', label: 'Majdata Net', updatedAt: '2026-09-01T00:00:00.000Z', isStale: false,
      });
    } finally { vi.useRealTimers(); }
  });
  it('does not publish a cached song fallback as a fresh refresh', async () => {
    await repository.saveResource(majdataSongKey(song.id), 1, 'now', { song, source: cachedSource });
    mock.getSong.mockRejectedValue(new Error('offline'));
    const onFresh = vi.fn();
    expect(await loadMajdataSong(song.id, undefined, onFresh)).toEqual(song);
    await vi.waitFor(() => expect(mock.getSong).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onFresh).not.toHaveBeenCalled();
  });
  it('reads cached song metadata without rewriting its provider or fetch time', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
    try {
      await loadMajdataSong(song.id);
      vi.setSystemTime(new Date('2026-09-20T00:00:00.000Z'));
      const snapshot = await loadMajdataSongSnapshot(song.id);
      expect(snapshot?.song).toEqual(song);
      expect(snapshot?.metadata).toEqual({
        provider: 'majdata-net', label: 'Majdata Net', fetchedAt: '2026-09-01T00:00:00.000Z', revision: song.hash,
      });
    } finally { vi.useRealTimers(); }
  });
  it('keeps cached account data when a refresh fails', async () => {
    await loadMajdataFresh('a', session); const cached = await loadMajdataCached('a'); mock.getRecords.mockRejectedValue(new Error('offline'));
    await expect(loadMajdataFresh('a', session)).rejects.toThrow('offline'); expect(await loadMajdataCached('a')).toEqual(cached);
  });
  it('does not let a removed account request resurrect its snapshot', async () => {
    const recent = deferred<unknown[]>(); mock.getRecent.mockReturnValue(recent.promise);
    const pending = loadMajdataFresh('a', session); await vi.waitFor(() => expect(mock.getRecent).toHaveBeenCalled());
    await clearMajdataAccount('a'); recent.resolve([]); await expect(pending).rejects.toThrow(); expect(await loadMajdataCached('a')).toBeNull();
  });
  it('rejects cancelled and obsolete detail writes', async () => {
    const old = deferred<typeof song>(); mock.getSong.mockReturnValueOnce(old.promise);
    const controller = new AbortController(); const pending = loadMajdataSong(song.id, controller.signal);
    await vi.waitFor(() => expect(mock.getSong).toHaveBeenCalled()); controller.abort();
    mock.getSong.mockResolvedValue({ ...song, hash: 'hash2' }); await loadMajdataSong(song.id);
    old.resolve(song); await expect(pending).rejects.toBeDefined(); expect(await repository.getResource(majdataSongKey(song.id), 1)).toMatchObject({ song: { hash: 'hash2' } });
  });
  it('shares full chart text and caches summaries per revision and difficulty', async () => {
    const [master, utage] = await Promise.all([loadMajdataParsedChart(song, 4), loadMajdataParsedChart(song, 6)]);
    expect(mock.getChart).toHaveBeenCalledTimes(1); expect(master.statistics.counts.tap).toBe(1); expect(utage.statistics.counts.mine).toBe(1);
    expect(await loadMajdataParsedChart(song, 6)).toEqual(utage);
    mock.getSong.mockResolvedValue({ ...song, hash: 'hash2' }); await loadMajdataChart({ ...song, hash: 'hash2' }); expect(mock.getChart).toHaveBeenCalledTimes(2);
  });
  it('parses the same revision and difficulty only once for concurrent consumers', async () => {
    const [first, second] = await Promise.all([loadMajdataParsedChart(song, 4), loadMajdataParsedChart(song, 4)]);
    expect(first).toBe(second);
    expect(mock.getChart).toHaveBeenCalledTimes(1);
  });
  /** 数值来自 kckc7887/DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 的独立执行结果。 */
  it.each([
    { name: 'keyboard', body: '(180){16}' + '1,2,3,4,5,6,7,8,'.repeat(8) + 'E', scores: [10, 0, 10, 1.3, 4.4] },
    { name: 'BPM changes and connected slides', body: '(180){8}1-3[8:1]-5[8:1],2/6,3h[4:1],A1/B2,(240){16}4,5,6,7,8w4[4:1],1,2,3,4,5,6,7,8,Ch[4:1],E', scores: [5.9, 1.3, 10, 0.7, 4.4] },
    { name: 'holds and touches', body: '(150){8}1h[4:2]/5,6,A1,B2,Ch[4:1]/3,4,5,6,7/8,E', scores: [5.5, 0, 6.4, 0.4, 1.2] },
  ])('matches upstream five-axis scores for $name', async ({ body, scores }) => {
    mock.getChart.mockResolvedValue(`&inote_5=${body}`);
    expect((await loadMajdataParsedChart(song, 4)).difficultyScores).toEqual(scores);
  });
  it('scores all seven slots and reuses their persisted results offline', async () => {
    const body = '(150){8}1h[4:2]/5,6,A1,B2,Ch[4:1]/3,4,5,6,7/8,E';
    mock.getChart.mockResolvedValue(Array.from({ length: 7 }, (_, level) => `&inote_${level + 1}=${body}`).join('\n'));
    for (let level = 0; level < 7; level++) {
      expect((await loadMajdataParsedChart(song, level)).difficultyScores).toEqual([5.5, 0, 6.4, 0.4, 1.2]);
    }
    mock.getChart.mockRejectedValue(new Error('offline'));
    mock.getSong.mockRejectedValue(new Error('offline'));
    for (let level = 0; level < 7; level++) {
      expect((await loadMajdataParsedChart(song, level)).difficultyScores).toEqual([5.5, 0, 6.4, 0.4, 1.2]);
    }
  });
  it.each(['1-1[4:1]', '1-3[4:0]'])('keeps note counts and caches null when slide analysis fails: %s', async body => {
    mock.getChart.mockResolvedValue(`&inote_5=(120)${body},E`);
    const parsed = await loadMajdataParsedChart(song, 4);
    expect(parsed.difficultyScores).toBeNull();
    expect(parsed.statistics.counts).toMatchObject({ tap: 1, slide: 1 });
    mock.getChart.mockRejectedValue(new Error('offline'));
    expect((await loadMajdataParsedChart(song, 4)).difficultyScores).toBeNull();
  });
  it('does not turn malformed chart text or network errors into valid parsed charts', async () => {
    mock.getChart.mockResolvedValue('&inote_5=(120)BAD,E');
    await expect(loadMajdataParsedChart(song, 4)).rejects.toThrow();
    expect(await repository.getResource(`majdata-net:parsed:${song.id}:${song.hash}:4`, 2)).toBeNull();
    mock.getChart.mockRejectedValue(new Error('offline'));
    await expect(loadMajdataParsedChart({ ...song, hash: 'unavailable' }, 4)).rejects.toThrow('offline');
  });
  it('rebuilds only an unsupported parsed cache from the retained text', async () => {
    const parsed = await loadMajdataParsedChart(song, 4);
    const key = `majdata-net:parsed:${song.id}:${song.hash}:4`;
    await repository.saveResource(key, 1, 'now', { statistics: parsed.statistics });
    await repository.saveResource('majdata-net:unrelated', 1, 'now', 'retained');
    mock.getChart.mockRejectedValue(new Error('offline'));
    mock.getSong.mockRejectedValue(new Error('offline'));
    expect((await loadMajdataParsedChart(song, 4)).difficultyScores).toEqual(parsed.difficultyScores);
    expect(await repository.getResource('majdata-net:unrelated', 1)).toBe('retained');
    expect(await repository.getResource(key, 2)).toMatchObject({ difficultyScores: parsed.difficultyScores });
  });
  it('propagates storage read failures without deleting a parsed result', async () => {
    const parsed = await loadMajdataParsedChart(song, 4);
    resourceReadError = new Error('storage unavailable');
    await expect(loadMajdataParsedChart(song, 4)).rejects.toThrow('storage unavailable');
    resourceReadError = undefined;
    expect(await loadMajdataParsedChart(song, 4)).toEqual(parsed);
  });
  it('isolates scores by difficulty and chart revision', async () => {
    const keyboard = '(180){16}' + '1,2,3,4,5,6,7,8,'.repeat(8) + 'E';
    const holds = '(150){8}1h[4:2]/5,6,A1,B2,Ch[4:1]/3,4,5,6,7/8,E';
    mock.getChart.mockResolvedValue(`&inote_5=${keyboard}\n&inote_7=${holds}`);
    expect((await loadMajdataParsedChart(song, 4)).difficultyScores).toEqual([10, 0, 10, 1.3, 4.4]);
    expect((await loadMajdataParsedChart(song, 6)).difficultyScores).toEqual([5.5, 0, 6.4, 0.4, 1.2]);
    const revised = { ...song, hash: 'hash2' };
    mock.getSong.mockResolvedValue(revised);
    mock.getChart.mockResolvedValue(`&inote_5=${holds}`);
    expect((await loadMajdataParsedChart(revised, 4)).difficultyScores).toEqual([5.5, 0, 6.4, 0.4, 1.2]);
    expect((await loadMajdataParsedChart(song, 4)).difficultyScores).toEqual([10, 0, 10, 1.3, 4.4]);
  });
  it('does not write parsed scores after the cache generation is cleared', async () => {
    const remote = deferred<string>();
    mock.getChart.mockReturnValue(remote.promise);
    const pending = loadMajdataParsedChart(song, 4);
    const rejected = expect(pending).rejects.toThrow('缓存请求已失效');
    await vi.waitFor(() => expect(mock.getChart).toHaveBeenCalled());
    invalidateResourceWrites('majdata-net');
    remote.resolve('&inote_5=(120)1,');
    await rejected;
    expect(await repository.getResource(`majdata-net:parsed:${song.id}:${song.hash}:4`, 2)).toBeNull();
  });
  it('lets queued work run during difficulty analysis and retains the numerical result', async () => {
    let elapsed = 0, complete = false;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => elapsed++);
    try {
      const pending = simaiDifficultyScores('&inote_5=(150){8}1h[4:2]/5,6,A1,B2,Ch[4:1]/3,4,5,6,7/8,E', 5)
        .then(scores => { complete = true; return scores; });
      await new Promise<void>(resolve => { setTimeout(resolve, 0); });
      expect(complete).toBe(false);
      expect(await pending).toEqual([5.5, 0, 6.4, 0.4, 1.2]);
    } finally { now.mockRestore(); }
  });
  it('cancels an in-progress analysis without caching a partial summary', async () => {
    await loadMajdataChart(song);
    let elapsed = 0;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => elapsed++);
    const controller = new AbortController(), reason = new Error('closed detail');
    try {
      const pending = loadMajdataParsedChart(song, 4, controller.signal);
      const rejection = expect(pending).rejects.toBe(reason);
      await new Promise<void>(resolve => { setTimeout(resolve, 0); });
      controller.abort(reason);
      await rejection;
      expect(await repository.getResource(`majdata-net:parsed:${song.id}:${song.hash}:4`, 2)).toBeNull();
      expect(await loadMajdataChart(song)).toBe('&inote_5=(120)1,\n&inote_7=(120)2m,');
      await expect(simaiDifficultyScores('invalid', 5, controller.signal)).rejects.toBe(reason);
    } finally { now.mockRestore(); }
  });
  it('does not label new text as an old revision', async () => {
    mock.getSong.mockResolvedValue({ ...song, hash: 'hash2' }); await expect(loadMajdataChart(song)).rejects.toThrow('谱面已更新');
    expect(await repository.getResource(`majdata-net:chart:${song.id}:${song.hash}`, 1)).toBeNull();
  });
  it('blocks detached refresh writes after cache clearing', async () => {
    const remote = deferred<typeof song>(); mock.getSong.mockReturnValue(remote.promise);
    const pending = loadMajdataSong(song.id); await vi.waitFor(() => expect(mock.getSong).toHaveBeenCalled());
    invalidateResourceWrites('majdata-net'); remote.resolve(song); await expect(pending).rejects.toThrow('缓存请求已失效'); expect(await repository.listResourceSizes()).toEqual([]);
  });
  it('shares concurrent song metadata without cancelling a remaining consumer', async () => {
    const remote = deferred<typeof song>(); mock.getSong.mockReturnValue(remote.promise);
    const firstController = new AbortController();
    const first = loadMajdataSong(song.id, firstController.signal);
    const second = loadMajdataSong(song.id);
    const cancelled = expect(first).rejects.toBeDefined();
    await vi.waitFor(() => expect(mock.getSong).toHaveBeenCalledTimes(1));
    firstController.abort(); await cancelled;
    expect(mock.getSong.mock.calls[0][1].aborted).toBe(false);
    remote.resolve(song); expect(await second).toEqual(song);
    expect(await repository.getResource(majdataSongKey(song.id), 1)).toMatchObject({ song });
  });
  it('cancels only the departing chart consumer and aborts when all consumers leave', async () => {
    const remote = deferred<string>(); mock.getChart.mockReturnValue(remote.promise);
    const firstController = new AbortController(); const secondController = new AbortController();
    const first = loadMajdataChart(song, firstController.signal);
    const second = loadMajdataChart(song, secondController.signal);
    const firstCancelled = expect(first).rejects.toBeDefined(); const secondCancelled = expect(second).rejects.toBeDefined();
    await vi.waitFor(() => expect(mock.getChart).toHaveBeenCalledTimes(1));
    secondController.abort(); await secondCancelled;
    expect(mock.getChart.mock.calls[0][1].aborted).toBe(false);
    firstController.abort(); await firstCancelled;
    expect(mock.getChart.mock.calls[0][1].aborted).toBe(true);
    remote.resolve('&inote_5=(120)1,');
    await Promise.resolve(); await Promise.resolve();
    expect(await repository.getResource(`majdata-net:chart:${song.id}:${song.hash}`, 1)).toBeNull();
  });
  it('lets another difficulty finish when the first parsed-chart consumer leaves', async () => {
    const remote = deferred<string>(); mock.getChart.mockReturnValue(remote.promise);
    const firstController = new AbortController();
    const first = loadMajdataParsedChart(song, 4, firstController.signal);
    const second = loadMajdataParsedChart(song, 6);
    const cancelled = expect(first).rejects.toBeDefined();
    await vi.waitFor(() => expect(mock.getChart).toHaveBeenCalledTimes(1));
    firstController.abort(); await cancelled;
    remote.resolve('&inote_5=(120)1,\n&inote_7=(120)2m,');
    expect((await second).statistics.counts.mine).toBe(1);
    expect(await repository.getResource(`majdata-net:parsed:${song.id}:${song.hash}:4`, 2)).toBeNull();
  });
  it('starts a new cache generation without joining an invalidated chart request', async () => {
    const oldText = deferred<string>(); mock.getChart.mockReturnValueOnce(oldText.promise);
    const old = loadMajdataChart(song); const rejected = expect(old).rejects.toThrow('缓存请求已失效');
    await vi.waitFor(() => expect(mock.getChart).toHaveBeenCalledTimes(1));
    invalidateResourceWrites('majdata-net');
    const freshText = '&inote_5=(120)2,'; mock.getChart.mockResolvedValue(freshText);
    expect(await loadMajdataChart(song)).toBe(freshText);
    oldText.resolve('&inote_5=(120)1,'); await rejected;
    expect(await repository.getResource(`majdata-net:chart:${song.id}:${song.hash}`, 1)).toBe(freshText);
  });
  it('does not publish a cached callback from a cleared request generation', async () => {
    await repository.saveResource(majdataSongKey(song.id), 1, 'now', { song, source: cachedSource });
    const fresh = deferred<typeof song>(); mock.getSong.mockReturnValue(fresh.promise);
    const onFresh = vi.fn(); await loadMajdataSong(song.id, undefined, onFresh);
    invalidateResourceWrites('majdata-net'); fresh.resolve({ ...song, hash: 'hash2' });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(onFresh).not.toHaveBeenCalled();
  });
});
