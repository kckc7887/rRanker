import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMajdataCached, loadMajdataFresh, loadMajdataSong, loadMajdataChart, loadMajdataParsedChart, clearMajdataAccount, majdataAccountKey, majdataSongKey } from '@/services/majdata-service';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { MajdataSongSchema } from '@/domain/majdata';
import type { HttpCookieSession } from '@/providers/http-cookies';
const mock = vi.hoisted(() => ({ values: new Map<string, unknown>(), getSong: vi.fn(), getChart: vi.fn(), getPlayer: vi.fn(), getRecords: vi.fn(), getRecent: vi.fn() }));
vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {
  async getResource(key: string) { return mock.values.get(key) ?? null; }
  async saveResource(key: string, _version: number, _time: string, value: unknown) { mock.values.set(key, value); }
  async clearResources(keys: string[]) { for (const key of keys) mock.values.delete(key); }
} }));
vi.mock('@/providers/majdata-provider', () => ({ majdataProvider: mock, MajdataProvider: class {
  getPlayer = mock.getPlayer; getRecords = mock.getRecords; getRecent = mock.getRecent;
} }));
vi.mock('@/state/session-store', () => ({ useSession: { getState: () => ({ sessionsByAccountId: {} }), setState: vi.fn() } }));

const song = MajdataSongSchema.parse({ id: 'uuid-full-001', title: 'song', hash: 'hash1', timestamp: '2026-09-01', levels: ['', '', '', '', '14', '', '宴'] });
const session: HttpCookieSession = { mode: 'http-cookies', origin: 'https://majdata.net', cookies: [{ name: 'auth', value: 'value', secure: true, path: '/' }], persistable: true };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { mock.values.clear(); vi.clearAllMocks(); mock.getSong.mockResolvedValue(song); mock.getChart.mockResolvedValue('&inote_5=(120)1,\n&inote_7=(120)2m,'); mock.getPlayer.mockResolvedValue({ username: 'player' }); mock.getRecords.mockResolvedValue([]); mock.getRecent.mockResolvedValue([]); });
describe('Majdata revision and account cache', () => {
  it('isolates account snapshots and removal', async () => {
    await loadMajdataFresh('a', session); await loadMajdataFresh('b', session);
    await clearMajdataAccount('a'); expect(await loadMajdataCached('a')).toBeNull(); expect(await loadMajdataCached('b')).not.toBeNull();
  });
  it('renders a local detail before its fresh request resolves', async () => {
    mock.values.set(majdataSongKey(song.id), { song }); const fresh = deferred<typeof song>(); mock.getSong.mockReturnValue(fresh.promise);
    const onFresh = vi.fn(); expect(await loadMajdataSong(song.id, undefined, onFresh)).toEqual(song);
    expect(onFresh).not.toHaveBeenCalled(); fresh.resolve({ ...song, hash: 'hash2' }); await vi.waitFor(() => expect(onFresh).toHaveBeenCalledWith(expect.objectContaining({ hash: 'hash2' })));
  });
  it('keeps cached account data when a refresh fails', async () => {
    await loadMajdataFresh('a', session); const cached = await loadMajdataCached('a'); mock.getRecords.mockRejectedValue(new Error('offline'));
    await expect(loadMajdataFresh('a', session)).rejects.toThrow('offline'); expect(await loadMajdataCached('a')).toEqual(cached);
  });
  it('does not let a removed account request resurrect its snapshot', async () => {
    const recent = deferred<unknown[]>(); mock.getRecent.mockReturnValue(recent.promise);
    const pending = loadMajdataFresh('a', session); await vi.waitFor(() => expect(mock.getRecent).toHaveBeenCalled());
    await clearMajdataAccount('a'); recent.resolve([]); await expect(pending).rejects.toThrow(); expect(mock.values.has(majdataAccountKey('a'))).toBe(false);
  });
  it('rejects cancelled and obsolete detail writes', async () => {
    const old = deferred<typeof song>(); mock.getSong.mockReturnValueOnce(old.promise);
    const controller = new AbortController(); const pending = loadMajdataSong(song.id, controller.signal);
    await vi.waitFor(() => expect(mock.getSong).toHaveBeenCalled()); controller.abort();
    mock.getSong.mockResolvedValue({ ...song, hash: 'hash2' }); await loadMajdataSong(song.id);
    old.resolve(song); await expect(pending).rejects.toBeDefined(); expect(mock.values.get(majdataSongKey(song.id))).toMatchObject({ song: { hash: 'hash2' } });
  });
  it('shares full chart text and caches parsed models per revision and difficulty', async () => {
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
  it('does not label new text as an old revision', async () => {
    mock.getSong.mockResolvedValue({ ...song, hash: 'hash2' }); await expect(loadMajdataChart(song)).rejects.toThrow('谱面已更新');
    expect(mock.values.has(`majdata-net:chart:${song.id}:${song.hash}`)).toBe(false);
  });
  it('blocks detached refresh writes after cache clearing', async () => {
    const remote = deferred<typeof song>(); mock.getSong.mockReturnValue(remote.promise);
    const pending = loadMajdataSong(song.id); await vi.waitFor(() => expect(mock.getSong).toHaveBeenCalled());
    invalidateResourceWrites('majdata-net'); remote.resolve(song); await expect(pending).rejects.toThrow('缓存请求已失效'); expect(mock.values.size).toBe(0);
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
    expect(mock.values.get(majdataSongKey(song.id))).toEqual({ song });
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
    expect(mock.values.has(`majdata-net:chart:${song.id}:${song.hash}`)).toBe(false);
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
    expect(mock.values.has(`majdata-net:parsed:${song.id}:${song.hash}:4`)).toBe(false);
  });
  it('starts a new cache generation without joining an invalidated chart request', async () => {
    const oldText = deferred<string>(); mock.getChart.mockReturnValueOnce(oldText.promise);
    const old = loadMajdataChart(song); const rejected = expect(old).rejects.toThrow('缓存请求已失效');
    await vi.waitFor(() => expect(mock.getChart).toHaveBeenCalledTimes(1));
    invalidateResourceWrites('majdata-net');
    const freshText = '&inote_5=(120)2,'; mock.getChart.mockResolvedValue(freshText);
    expect(await loadMajdataChart(song)).toBe(freshText);
    oldText.resolve('&inote_5=(120)1,'); await rejected;
    expect(mock.values.get(`majdata-net:chart:${song.id}:${song.hash}`)).toBe(freshText);
  });
  it('does not publish a cached callback from a cleared request generation', async () => {
    mock.values.set(majdataSongKey(song.id), { song });
    const fresh = deferred<typeof song>(); mock.getSong.mockReturnValue(fresh.promise);
    const onFresh = vi.fn(); await loadMajdataSong(song.id, undefined, onFresh);
    invalidateResourceWrites('majdata-net'); fresh.resolve({ ...song, hash: 'hash2' });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(onFresh).not.toHaveBeenCalled();
  });
});
