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
  it('does not label new text as an old revision', async () => {
    mock.getSong.mockResolvedValue({ ...song, hash: 'hash2' }); await expect(loadMajdataChart(song)).rejects.toThrow('谱面已更新');
    expect(mock.values.has(`majdata-net:chart:${song.id}:${song.hash}`)).toBe(false);
  });
  it('blocks detached refresh writes after cache clearing', async () => {
    const remote = deferred<typeof song>(); mock.getSong.mockReturnValue(remote.promise);
    const pending = loadMajdataSong(song.id); await vi.waitFor(() => expect(mock.getSong).toHaveBeenCalled());
    invalidateResourceWrites('majdata-net'); remote.resolve(song); await expect(pending).rejects.toThrow('缓存请求已失效'); expect(mock.values.size).toBe(0);
  });
});
