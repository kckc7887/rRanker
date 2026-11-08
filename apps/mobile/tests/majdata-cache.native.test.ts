import { waitFor } from '@testing-library/react-native';
import type { SourceClientContext } from '@rranker/sdk/credentials';
import { useAccountStore } from '@rranker/sdk/state/account-store';
import { commitCredential } from '@rranker/sdk/services/session-credential-service';
import { captureBoundAccountWrites } from '@rranker/sdk/services/account-write-scope';
import { simaiDifficultyScores } from '@rranker/chart-simai/features/simai-difficulty/index';
import { DatabaseSync } from 'node:sqlite';
import { SqliteSnapshotRepository } from '@rranker/sdk/storage/sqlite-snapshot-repository';
import { loadMajdataCached, loadMajdataFresh, loadMajdataSong, loadMajdataSongSnapshot, loadMajdataChart, loadMajdataParsedChart, clearMajdataAccount, majdataSongKey } from '@rranker/provider-majdata-net/services/majdata-service';
import { loadMajdataDemoScoresPage } from '@rranker/provider-majdata-net-test/client';
import { invalidateResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';
import { MajdataSongSchema } from '@rranker/game-majdata-net/domain/majdata';
import type { HttpCookieSession } from '@rranker/provider-majdata-net/http-cookies';
const mockProvider = ({ getSong: jest.fn(), getChart: jest.fn(), getSongs: jest.fn(), getPlayer: jest.fn(), getRecords: jest.fn(), getRecent: jest.fn() });
const mockDatabase = new DatabaseSync(':memory:');
const repository = new SqliteSnapshotRepository();
let mockResourceReadError: Error | undefined;
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async (sql: string) => mockDatabase.exec(sql),
  runAsync: async (sql: string, ...args: (string | number)[]) => mockDatabase.prepare(sql).run(...args),
  getFirstAsync: async (sql: string, ...args: (string | number)[]) => {
    if (mockResourceReadError && sql.includes('FROM resource_snapshots')) throw mockResourceReadError;
    return mockDatabase.prepare(sql).get(...args) ?? null;
  },
  getAllAsync: async (sql: string, ...args: (string | number)[]) => mockDatabase.prepare(sql).all(...args),
  withTransactionAsync: async (task: () => Promise<void>) => {
    mockDatabase.exec('BEGIN'); try { await task(); mockDatabase.exec('COMMIT'); }
    catch (error) { mockDatabase.exec('ROLLBACK'); throw error; }
  },
}) }));
afterAll(() => mockDatabase.close());

jest.mock('@rranker/provider-majdata-net/providers/majdata-provider', () => ({ get majdataProvider() { return mockProvider; }, MajdataProvider: class {
  getPlayer = mockProvider.getPlayer; getRecords = mockProvider.getRecords; getRecent = mockProvider.getRecent;
} }));
jest.mock('@rranker/sdk/storage/secure-session-store', () => ({ SecureSessionStore: class { async updateCredentialSession() { return 'applied'; } } }));

const song = MajdataSongSchema.parse({ id: 'uuid-full-001', title: 'song', hash: 'hash1', timestamp: '2026-09-01', levels: ['', '', '', '', '14', '', '宴'] });
const cachedSource = { kind: 'majdata-net', label: 'Majdata Net', updatedAt: '2026-09-01T00:00:00.000Z', isStale: false };
const session: HttpCookieSession = { mode: 'http-cookies', origin: 'https://majdata.net', cookies: [{ name: 'auth', value: 'value', secure: true, path: '/' }], persistable: true };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

function sourceContext(id: string, credential: HttpCookieSession): SourceClientContext {
  const credentialId = `credential:${id}`;
  if (!useAccountStore.getState().boundAccounts.some(account => account.id === id)) {
    useAccountStore.getState().bindAccounts({ accounts: [{ id, gameId: 'majdata-net', providerId: 'majdata-net',
      displayName: 'Player', scoreDisplay: '0', scoreLabel: '', providerTitle: '测试来源' }], credentialId, session: credential, activeAccountId: id });
  }
  const assertCurrent = captureBoundAccountWrites(id);
  return { account: useAccountStore.getState().boundAccounts.find(account => account.id === id)!,
    get credential() { return useAccountStore.getState().credentialsById[credentialId] ?? null; }, assertCurrent,
    commitCredential: (next, expected) => commitCredential({ credentialId, providerId: 'majdata-net', next, expected, assertCurrent }) };
}

beforeEach(async () => { useAccountStore.getState().finishRestore(null); mockResourceReadError = undefined; await repository.initialize(); await repository.clearResources((await repository.listResourceSizes()).map(item => item.key)); jest.clearAllMocks(); mockProvider.getSong.mockResolvedValue(song); mockProvider.getChart.mockResolvedValue('&inote_5=(120)1,\n&inote_7=(120)2m,'); mockProvider.getPlayer.mockResolvedValue({ username: 'player' }); mockProvider.getRecords.mockResolvedValue([]); mockProvider.getRecent.mockResolvedValue([]); });
describe('Majdata revision and account cache', () => {
  it('loads full scores in catalog and raw difficulty order without persisting player records', async () => {
    const second = { ...song, id: 'uuid-second', levels: ['1', '', '', '', '', '', ''] };
    mockProvider.getSongs.mockResolvedValue([song, second]);
    mockProvider.getSong.mockImplementation(async (id: string) => id === second.id ? second : song);
    mockProvider.getChart.mockImplementation(async (id: string) => id === second.id
      ? '&inote_1=(120)1,' : '&inote_5=(120)1,2b,3m,\n&inote_7=(120)1,2,');
    const result = await loadMajdataDemoScoresPage(0, new AbortController().signal);
    expect(result.songCount).toBe(2);
    expect(result.records.map(record => [record.chartInfo.id, record.chartLevel])).toEqual([
      [song.id, 4], [song.id, 6], [second.id, 0],
    ]);
    expect(result.records.map(record => record.acc.dx)).toEqual([101, 100, 100]);
    expect(result.records.map(record => record.dxScore)).toEqual([6, 6, 3]);
    expect(result.records.every(record => record.comboState === 4)).toBe(true);
    expect(await loadMajdataCached('majdata-net:test')).toBeNull();
  });
  it('rejects incomplete pages and cancellation rather than substituting full scores', async () => {
    mockProvider.getSongs.mockResolvedValue([song]);
    mockProvider.getChart.mockRejectedValueOnce(new Error('offline'));
    await expect(loadMajdataDemoScoresPage(1, new AbortController().signal)).rejects.toThrow('offline');
    const controller = new AbortController();
    controller.abort(new Error('已取消'));
    await expect(loadMajdataDemoScoresPage(1, controller.signal)).rejects.toThrow('已取消');
  });
  it('skips missing, invalid and empty difficulties while preserving full scores and catalog order', async () => {
    const mixed = { ...song, levels: ['1', '5', '', '8', '14', '15', '宴'] };
    const second = { ...song, id: 'uuid-second', levels: ['1', '', '', '', '', '', ''] };
    mockProvider.getSongs.mockResolvedValue([mixed, second]);
    mockProvider.getSong.mockImplementation(async (id: string) => id === second.id ? second : mixed);
    mockProvider.getChart.mockImplementation(async (id: string) => id === second.id ? '&inote_1=(120)1,' : [
      '&inote_6=(120)1,2b,3m,',
      '&inote_5=(120)5^2[8:1][8:1],',
      '&inote_4=(120)1h[4:1],2,',
      '&inote_1=(120)1,',
      '&inote_7=(180){4},E',
    ].join('\n'));
    const result = await loadMajdataDemoScoresPage(1, new AbortController().signal);
    expect(result.songCount).toBe(2);
    expect(result.records.map(record => [record.chartInfo.id, record.chartLevel])).toEqual([
      [mixed.id, 5], [mixed.id, 3], [mixed.id, 0], [second.id, 0],
    ]);
    expect(result.records.map(record => record.acc.dx)).toEqual([101, 100, 100, 100]);
    expect(result.records[0].acc.classic).toBeCloseTo(103.33333333333333);
    expect(result.records.slice(1).map(record => record.acc.classic)).toEqual([100, 100, 100]);
    expect(result.records.map(record => record.dxScore)).toEqual([6, 6, 3, 3]);
    expect(result.records.every(record => record.comboState === 4)).toBe(true);
    expect(await loadMajdataCached('majdata-net:test')).toBeNull();
  });
  it('does not reuse an unsupported song snapshot when offline', async () => {
    await repository.saveResource(majdataSongKey(song.id), 1, 'now', { song });
    mockProvider.getSong.mockRejectedValue(new Error('offline'));
    await expect(loadMajdataSong(song.id)).rejects.toThrow('offline');
  });
  it('isolates account snapshots and removal', async () => {
    await loadMajdataFresh(sourceContext('a', session)); await loadMajdataFresh(sourceContext('b', session));
    await clearMajdataAccount('a'); expect(await loadMajdataCached('a')).toBeNull(); expect(await loadMajdataCached('b')).not.toBeNull();
  });
  it('renders a local detail before its fresh request resolves', async () => {
    await repository.saveResource(majdataSongKey(song.id), 1, 'now', { song, source: cachedSource }); const fresh = deferred<typeof song>(); mockProvider.getSong.mockReturnValue(fresh.promise);
    const onFresh = jest.fn(); expect(await loadMajdataSong(song.id, undefined, onFresh)).toEqual(song);
    expect(onFresh).not.toHaveBeenCalled(); fresh.resolve({ ...song, hash: 'hash2' }); await waitFor(() => expect(onFresh).toHaveBeenCalledWith(expect.objectContaining({ hash: 'hash2' })));
  });
  it('records the original provider and fetch time on the cached song snapshot', async () => {
    jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
    try {
      await loadMajdataSong(song.id);
      const stored = await loadMajdataSongSnapshot(song.id);
      expect(stored?.song).toEqual(song);
      expect(stored?.source).toEqual({
        kind: 'majdata-net', label: 'Majdata Net', updatedAt: '2026-09-01T00:00:00.000Z', isStale: false,
      });
    } finally { jest.useRealTimers(); }
  });
  it('does not publish a cached song fallback as a fresh refresh', async () => {
    await repository.saveResource(majdataSongKey(song.id), 1, 'now', { song, source: cachedSource });
    mockProvider.getSong.mockRejectedValue(new Error('offline'));
    const onFresh = jest.fn();
    const fallback = Promise.withResolvers<typeof song>();
    expect(await loadMajdataSong(song.id, undefined, onFresh, fallback.resolve)).toEqual(song);
    expect(await fallback.promise).toEqual(song);
    expect(onFresh).not.toHaveBeenCalled();
  });
  it('reads cached song metadata without rewriting its provider or fetch time', async () => {
    jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
    try {
      await loadMajdataSong(song.id);
      jest.setSystemTime(new Date('2026-09-20T00:00:00.000Z'));
      const snapshot = await loadMajdataSongSnapshot(song.id);
      expect(snapshot?.song).toEqual(song);
      expect(snapshot?.metadata).toEqual({
        provider: 'majdata-net', label: 'Majdata Net', fetchedAt: '2026-09-01T00:00:00.000Z', revision: song.hash,
      });
    } finally { jest.useRealTimers(); }
  });
  it('keeps cached account data when a refresh fails', async () => {
    await loadMajdataFresh(sourceContext('a', session)); const cached = await loadMajdataCached('a'); mockProvider.getRecords.mockRejectedValue(new Error('offline'));
    await expect(loadMajdataFresh(sourceContext('a', session))).rejects.toThrow('offline'); expect(await loadMajdataCached('a')).toEqual(cached);
  });
  it('does not let a removed account request resurrect its snapshot', async () => {
    const recent = deferred<unknown[]>(); mockProvider.getRecent.mockReturnValue(recent.promise);
    const pending = loadMajdataFresh(sourceContext('a', session)); await waitFor(() => expect(mockProvider.getRecent).toHaveBeenCalled());
    await clearMajdataAccount('a'); recent.resolve([]); await expect(pending).rejects.toThrow(); expect(await loadMajdataCached('a')).toBeNull();
  });
  it('rejects cancelled and obsolete detail writes', async () => {
    const old = deferred<typeof song>(); mockProvider.getSong.mockReturnValueOnce(old.promise);
    const controller = new AbortController(); const pending = loadMajdataSong(song.id, controller.signal);
    await waitFor(() => expect(mockProvider.getSong).toHaveBeenCalled()); controller.abort();
    mockProvider.getSong.mockResolvedValue({ ...song, hash: 'hash2' }); await loadMajdataSong(song.id);
    old.resolve(song); await expect(pending).rejects.toBeDefined(); expect(await repository.getResource(majdataSongKey(song.id), 1)).toMatchObject({ song: { hash: 'hash2' } });
  });
  it('shares full chart text and caches summaries per revision and difficulty', async () => {
    const [master, utage] = await Promise.all([loadMajdataParsedChart(song, 4), loadMajdataParsedChart(song, 6)]);
    expect(mockProvider.getChart).toHaveBeenCalledTimes(1); expect(master.statistics.counts.tap).toBe(1); expect(utage.statistics.counts.mine).toBe(1);
    expect(await loadMajdataParsedChart(song, 6)).toEqual(utage);
    mockProvider.getSong.mockResolvedValue({ ...song, hash: 'hash2' }); await loadMajdataChart({ ...song, hash: 'hash2' }); expect(mockProvider.getChart).toHaveBeenCalledTimes(2);
  });
  it('parses the same revision and difficulty only once for concurrent consumers', async () => {
    const [first, second] = await Promise.all([loadMajdataParsedChart(song, 4), loadMajdataParsedChart(song, 4)]);
    expect(first).toBe(second);
    expect(mockProvider.getChart).toHaveBeenCalledTimes(1);
  });
  /** 数值来自 kckc7887/DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 的独立执行结果。 */
  it.each([
    { name: 'keyboard', body: '(180){16}' + '1,2,3,4,5,6,7,8,'.repeat(8) + 'E', scores: [10, 0, 10, 1.3, 4.4] },
    { name: 'BPM changes and connected slides', body: '(180){8}1-3[8:1]-5[8:1],2/6,3h[4:1],A1/B2,(240){16}4,5,6,7,8w4[4:1],1,2,3,4,5,6,7,8,Ch[4:1],E', scores: [5.9, 1.3, 10, 0.7, 4.4] },
    { name: 'holds and touches', body: '(150){8}1h[4:2]/5,6,A1,B2,Ch[4:1]/3,4,5,6,7/8,E', scores: [5.5, 0, 6.4, 0.4, 1.2] },
  ])('matches upstream five-axis scores for $name', async ({ body, scores }) => {
    mockProvider.getChart.mockResolvedValue(`&inote_5=${body}`);
    expect((await loadMajdataParsedChart(song, 4)).difficultyScores).toEqual(scores);
  });
  it('scores all seven slots and reuses their persisted results offline', async () => {
    const body = '(150){8}1h[4:2]/5,6,A1,B2,Ch[4:1]/3,4,5,6,7/8,E';
    mockProvider.getChart.mockResolvedValue(Array.from({ length: 7 }, (_, level) => `&inote_${level + 1}=${body}`).join('\n'));
    for (let level = 0; level < 7; level++) {
      expect((await loadMajdataParsedChart(song, level)).difficultyScores).toEqual([5.5, 0, 6.4, 0.4, 1.2]);
    }
    mockProvider.getChart.mockRejectedValue(new Error('offline'));
    mockProvider.getSong.mockRejectedValue(new Error('offline'));
    for (let level = 0; level < 7; level++) {
      expect((await loadMajdataParsedChart(song, level)).difficultyScores).toEqual([5.5, 0, 6.4, 0.4, 1.2]);
    }
  });
  it.each(['1-1[4:1]', '1-3[4:0]'])('keeps note counts and caches null when slide analysis fails: %s', async body => {
    mockProvider.getChart.mockResolvedValue(`&inote_5=(120)${body},E`);
    const parsed = await loadMajdataParsedChart(song, 4);
    expect(parsed.difficultyScores).toBeNull();
    expect(parsed.statistics.counts).toMatchObject({ tap: 1, slide: 1 });
    mockProvider.getChart.mockRejectedValue(new Error('offline'));
    expect((await loadMajdataParsedChart(song, 4)).difficultyScores).toBeNull();
  });
  it('does not turn malformed chart text or network errors into valid parsed charts', async () => {
    mockProvider.getChart.mockResolvedValue('&inote_5=(120)BAD,E');
    await expect(loadMajdataParsedChart(song, 4)).rejects.toThrow();
    expect(await repository.getResource(`majdata-net:parsed:${song.id}:${song.hash}:4`, 2)).toBeNull();
    mockProvider.getChart.mockRejectedValue(new Error('offline'));
    await expect(loadMajdataParsedChart({ ...song, hash: 'unavailable' }, 4)).rejects.toThrow('offline');
  });
  it('rebuilds only an unsupported parsed cache from the retained text', async () => {
    const parsed = await loadMajdataParsedChart(song, 4);
    const key = `majdata-net:parsed:${song.id}:${song.hash}:4`;
    await repository.saveResource(key, 1, 'now', { statistics: parsed.statistics });
    await repository.saveResource('majdata-net:unrelated', 1, 'now', 'retained');
    mockProvider.getChart.mockRejectedValue(new Error('offline'));
    mockProvider.getSong.mockRejectedValue(new Error('offline'));
    expect((await loadMajdataParsedChart(song, 4)).difficultyScores).toEqual(parsed.difficultyScores);
    expect(await repository.getResource('majdata-net:unrelated', 1)).toBe('retained');
    expect(await repository.getResource(key, 2)).toMatchObject({ difficultyScores: parsed.difficultyScores });
  });
  it('propagates storage read failures without deleting a parsed result', async () => {
    const parsed = await loadMajdataParsedChart(song, 4);
    mockResourceReadError = new Error('storage unavailable');
    await expect(loadMajdataParsedChart(song, 4)).rejects.toThrow('storage unavailable');
    mockResourceReadError = undefined;
    expect(await loadMajdataParsedChart(song, 4)).toEqual(parsed);
  });
  it('isolates scores by difficulty and chart revision', async () => {
    const keyboard = '(180){16}' + '1,2,3,4,5,6,7,8,'.repeat(8) + 'E';
    const holds = '(150){8}1h[4:2]/5,6,A1,B2,Ch[4:1]/3,4,5,6,7/8,E';
    mockProvider.getChart.mockResolvedValue(`&inote_5=${keyboard}\n&inote_7=${holds}`);
    expect((await loadMajdataParsedChart(song, 4)).difficultyScores).toEqual([10, 0, 10, 1.3, 4.4]);
    expect((await loadMajdataParsedChart(song, 6)).difficultyScores).toEqual([5.5, 0, 6.4, 0.4, 1.2]);
    const revised = { ...song, hash: 'hash2' };
    mockProvider.getSong.mockResolvedValue(revised);
    mockProvider.getChart.mockResolvedValue(`&inote_5=${holds}`);
    expect((await loadMajdataParsedChart(revised, 4)).difficultyScores).toEqual([5.5, 0, 6.4, 0.4, 1.2]);
    expect((await loadMajdataParsedChart(song, 4)).difficultyScores).toEqual([10, 0, 10, 1.3, 4.4]);
  });
  it('does not write parsed scores after the cache generation is cleared', async () => {
    const remote = deferred<string>();
    mockProvider.getChart.mockReturnValue(remote.promise);
    const pending = loadMajdataParsedChart(song, 4);
    const rejected = expect(pending).rejects.toThrow('缓存请求已失效');
    await waitFor(() => expect(mockProvider.getChart).toHaveBeenCalled());
    invalidateResourceWrites('majdata-net');
    remote.resolve('&inote_5=(120)1,');
    await rejected;
    expect(await repository.getResource(`majdata-net:parsed:${song.id}:${song.hash}:4`, 2)).toBeNull();
  });
  it('lets queued work run during difficulty analysis and retains the numerical result', async () => {
    let elapsed = 0, complete = false;
    const now = jest.spyOn(performance, 'now').mockImplementation(() => elapsed++);
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
    const now = jest.spyOn(performance, 'now').mockImplementation(() => elapsed++);
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
    mockProvider.getSong.mockResolvedValue({ ...song, hash: 'hash2' }); await expect(loadMajdataChart(song)).rejects.toThrow('谱面已更新');
    expect(await repository.getResource(`majdata-net:chart:${song.id}:${song.hash}`, 1)).toBeNull();
  });
  it('blocks detached refresh writes after cache clearing', async () => {
    const remote = deferred<typeof song>(); mockProvider.getSong.mockReturnValue(remote.promise);
    const pending = loadMajdataSong(song.id); await waitFor(() => expect(mockProvider.getSong).toHaveBeenCalled());
    invalidateResourceWrites('majdata-net'); remote.resolve(song); await expect(pending).rejects.toThrow('缓存请求已失效'); expect(await repository.listResourceSizes()).toEqual([]);
  });
  it('shares concurrent song metadata without cancelling a remaining consumer', async () => {
    const remote = deferred<typeof song>(); mockProvider.getSong.mockReturnValue(remote.promise);
    const firstController = new AbortController();
    const first = loadMajdataSong(song.id, firstController.signal);
    const second = loadMajdataSong(song.id);
    const cancelled = expect(first).rejects.toBeDefined();
    await waitFor(() => expect(mockProvider.getSong).toHaveBeenCalledTimes(1));
    firstController.abort(); await cancelled;
    expect(mockProvider.getSong.mockProvider.calls[0][1].aborted).toBe(false);
    remote.resolve(song); expect(await second).toEqual(song);
    expect(await repository.getResource(majdataSongKey(song.id), 1)).toMatchObject({ song });
  });
  it('cancels only the departing chart consumer and aborts when all consumers leave', async () => {
    const remote = deferred<string>(); mockProvider.getChart.mockReturnValue(remote.promise);
    const firstController = new AbortController(); const secondController = new AbortController();
    const first = loadMajdataChart(song, firstController.signal);
    const second = loadMajdataChart(song, secondController.signal);
    const firstCancelled = expect(first).rejects.toBeDefined(); const secondCancelled = expect(second).rejects.toBeDefined();
    await waitFor(() => expect(mockProvider.getChart).toHaveBeenCalledTimes(1));
    secondController.abort(); await secondCancelled;
    expect(mockProvider.getChart.mockProvider.calls[0][1].aborted).toBe(false);
    firstController.abort(); await firstCancelled;
    expect(mockProvider.getChart.mockProvider.calls[0][1].aborted).toBe(true);
    remote.resolve('&inote_5=(120)1,');
    await Promise.resolve(); await Promise.resolve();
    expect(await repository.getResource(`majdata-net:chart:${song.id}:${song.hash}`, 1)).toBeNull();
  });
  it('lets another difficulty finish when the first parsed-chart consumer leaves', async () => {
    const remote = deferred<string>(); mockProvider.getChart.mockReturnValue(remote.promise);
    const firstController = new AbortController();
    const first = loadMajdataParsedChart(song, 4, firstController.signal);
    const second = loadMajdataParsedChart(song, 6);
    const cancelled = expect(first).rejects.toBeDefined();
    await waitFor(() => expect(mockProvider.getChart).toHaveBeenCalledTimes(1));
    firstController.abort(); await cancelled;
    remote.resolve('&inote_5=(120)1,\n&inote_7=(120)2m,');
    expect((await second).statistics.counts.mine).toBe(1);
    expect(await repository.getResource(`majdata-net:parsed:${song.id}:${song.hash}:4`, 2)).toBeNull();
  });
  it('starts a new cache generation without joining an invalidated chart request', async () => {
    const oldText = deferred<string>(); mockProvider.getChart.mockReturnValueOnce(oldText.promise);
    const old = loadMajdataChart(song); const rejected = expect(old).rejects.toThrow('缓存请求已失效');
    await waitFor(() => expect(mockProvider.getChart).toHaveBeenCalledTimes(1));
    invalidateResourceWrites('majdata-net');
    const freshText = '&inote_5=(120)2,'; mockProvider.getChart.mockResolvedValue(freshText);
    expect(await loadMajdataChart(song)).toBe(freshText);
    oldText.resolve('&inote_5=(120)1,'); await rejected;
    expect(await repository.getResource(`majdata-net:chart:${song.id}:${song.hash}`, 1)).toBe(freshText);
  });
  it('does not publish a cached callback from a cleared request generation', async () => {
    await repository.saveResource(majdataSongKey(song.id), 1, 'now', { song, source: cachedSource });
    const fresh = deferred<typeof song>(); mockProvider.getSong.mockReturnValue(fresh.promise);
    const onFresh = jest.fn(); await loadMajdataSong(song.id, undefined, onFresh);
    invalidateResourceWrites('majdata-net'); fresh.resolve({ ...song, hash: 'hash2' });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(onFresh).not.toHaveBeenCalled();
  });
});
