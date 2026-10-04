import { z } from 'zod';
import { DatabaseSync } from 'node:sqlite';
import type { PhiraQueriedBest } from '@/domain/phira';
import type { MajdataSong } from '@/domain/majdata';
import { createUserDataBackup, DEFAULT_TAG_PRESETS, parseUserDataBackup } from '@/domain/user-library';
import type { ScoreSnapshot, CatalogSnapshot } from '@/domain/models';

let SqliteSnapshotRepository: typeof import('@/storage/sqlite-snapshot-repository')['SqliteSnapshotRepository'];
let SqliteUserLibraryRepository: typeof import('@/storage/sqlite-user-library-repository')['SqliteUserLibraryRepository'];
let UserLibraryService: typeof import('@/services/user-library-service')['UserLibraryService'];
let runDatabaseWrite: typeof import('@/storage/rranker-database')['runDatabaseWrite'];
let captureResourceWrites: typeof import('@/services/snapshot-cache-utils')['captureResourceWrites'];
let invalidateResourceWrites: typeof import('@/services/snapshot-cache-utils')['invalidateResourceWrites'];
let PhiraCache: typeof import('@/services/phira-cache')['PhiraCache'];
let loadMajdataSong: typeof import('@/services/majdata-service')['loadMajdataSong'];
let majdataSongKey: typeof import('@/services/majdata-service')['majdataSongKey'];
let majdataProvider: typeof import('@/providers/majdata-provider')['majdataProvider'];
let abortForegroundWork: typeof import('@/state/app-lifecycle-core')['abortForegroundWork'];
let beginForegroundWork: typeof import('@/state/app-lifecycle-core')['beginForegroundWork'];

async function reloadStorage() {
  vi.resetModules();
  ({ SqliteSnapshotRepository } = await import('@/storage/sqlite-snapshot-repository'));
  ({ SqliteUserLibraryRepository } = await import('@/storage/sqlite-user-library-repository'));
  ({ UserLibraryService } = await import('@/services/user-library-service'));
  ({ runDatabaseWrite } = await import('@/storage/rranker-database'));
  ({ captureResourceWrites, invalidateResourceWrites } = await import('@/services/snapshot-cache-utils'));
  ({ PhiraCache } = await import('@/services/phira-cache'));
  ({ loadMajdataSong, majdataSongKey } = await import('@/services/majdata-service'));
  ({ majdataProvider } = await import('@/providers/majdata-provider'));
  ({ abortForegroundWork, beginForegroundWork } = await import('@/state/app-lifecycle-core'));
}

const bridge = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: bridge.open }));

const queriedBest = (chartId: number, score = 900_000): PhiraQueriedBest => ({
  chart: {
    id: chartId, name: `Chart ${chartId}`, level: 'IN', difficulty: 15, charter: '', composer: '',
    illustrator: null, ranked: true, stable: true, uploader: 1, tags: [], ratingCount: 0,
  },
  record: {
    id: chartId, chart: chartId, score, accuracy: .98, perfect: 0, good: 0, bad: 0, miss: 0,
    fullCombo: false, best: true, created: null,
  },
  poolRks: null,
  queriedAt: '2026-01-01T00:00:00.000Z',
});

describe('SQLite storage and current backups', () => {
  let database: DatabaseSync;
  let repository: InstanceType<typeof SqliteSnapshotRepository>;
  let run: ReturnType<typeof vi.fn>;
  let reads: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    bridge.open.mockClear();
    database = new DatabaseSync(':memory:');
    run = vi.fn(async (sql: string, ...parameters: (string | number)[]) => database.prepare(sql).run(...parameters));
    reads = vi.fn(async (sql: string, ...parameters: (string | number)[]) => database.prepare(sql).all(...parameters));
    bridge.open.mockResolvedValue({
      execAsync: async (sql: string) => database.exec(sql),
      runAsync: run,
      getFirstAsync: async (sql: string, ...parameters: (string | number)[]) => database.prepare(sql).get(...parameters) ?? null,
      getAllAsync: reads,
      withTransactionAsync: async (task: () => Promise<void>) => {
        database.exec('BEGIN');
        try { await task(); database.exec('COMMIT'); }
        catch (error) { database.exec('ROLLBACK'); throw error; }
      },
    });
    await reloadStorage();
    repository = new SqliteSnapshotRepository();
    await repository.initialize();
  });
  afterEach(() => database.close());

  const majdataSong = (id: string): MajdataSong => ({
    id, title: id, artist: '', designer: '', hash: 'cached', timestamp: '2026-09-01',
    levels: ['', '', '', '', '14', '', ''], uploader: '', description: '', tags: [], publicTags: [],
  });

  async function seedMajdataSongs() {
    const songs = Array.from({ length: 12 }, (_, index) => majdataSong(`cached-${index}`));
    for (const song of songs) await repository.saveResource(majdataSongKey(song.id), 1, '2026-09-01', {
      song, source: { kind: 'majdata-net', label: 'Majdata Net', updatedAt: '2026-09-01', isStale: false },
    });
    return songs;
  }

  function pendingMajdataRequests() {
    let active = 0;
    let maximum = 0;
    const responses = new Map<string, ReturnType<typeof Promise.withResolvers<MajdataSong>>>();
    const getSong = vi.spyOn(majdataProvider, 'getSong').mockImplementation((id, signal) => {
      const response = Promise.withResolvers<MajdataSong>();
      responses.set(id, response); active++; maximum = Math.max(maximum, active);
      const cancel = () => response.reject(signal?.reason ?? new Error('cancelled'));
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      return response.promise.finally(() => { active--; signal?.removeEventListener('abort', cancel); });
    });
    return { getSong, responses, active: () => active, maximum: () => maximum };
  }

  it('keeps twelve persisted Majdata first paints immediate while actual background HTTP stays at four', async () => {
    const songs = await seedMajdataSongs();
    const requests = pendingMajdataRequests();
    const onFresh = vi.fn();
    try {
      expect(await Promise.all(songs.map(song => loadMajdataSong(song.id, undefined, onFresh)))).toEqual(songs);
      await vi.waitFor(() => expect(requests.getSong).toHaveBeenCalledTimes(4));
      expect(requests.active()).toBe(4);
      expect(onFresh).not.toHaveBeenCalled();
      for (let index = 0; index < songs.length; index++) {
        const song = songs[index];
        await vi.waitFor(() => expect(requests.responses.has(song.id)).toBe(true));
        requests.responses.get(song.id)!.resolve({ ...song, hash: 'fresh' });
        await vi.waitFor(() => expect(onFresh).toHaveBeenCalledTimes(index + 1));
      }
      expect(requests.maximum()).toBe(4);
      expect(requests.active()).toBe(0);
      expect((await repository.getResource<{ song: MajdataSong }>(majdataSongKey(songs[0].id), 1))?.song.hash).toBe('fresh');
    } finally {
      requests.responses.forEach((response, id) => response.resolve({ ...majdataSong(id), hash: 'fresh' }));
      requests.getSong.mockRestore();
    }
  });

  it.each(['consumer', 'foreground', 'cache-clear'] as const)('stops cached Majdata tasks before the next HTTP claim after %s cancellation', async (reason) => {
    const songs = await seedMajdataSongs();
    const requests = pendingMajdataRequests();
    const controller = new AbortController();
    const onFresh = vi.fn();
    try {
      expect(await Promise.all(songs.map(song => loadMajdataSong(song.id, controller.signal, onFresh)))).toEqual(songs);
      await vi.waitFor(() => expect(requests.getSong).toHaveBeenCalledTimes(4));
      requests.responses.get(songs[0].id)!.resolve({ ...songs[0], hash: 'fresh' });
      await vi.waitFor(() => expect(onFresh).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(requests.getSong).toHaveBeenCalledTimes(5));
      if (reason === 'consumer') controller.abort();
      else if (reason === 'foreground') { abortForegroundWork(); beginForegroundWork(); }
      else { invalidateResourceWrites('majdata-net'); await repository.clearResources(songs.map(song => majdataSongKey(song.id))); }
      await vi.waitFor(() => expect(requests.active()).toBe(0));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(requests.getSong).toHaveBeenCalledTimes(5);
      expect(requests.maximum()).toBe(4);
      expect(onFresh).toHaveBeenCalledTimes(1);
      for (const song of songs) {
        const stored = await repository.getResource<{ song: MajdataSong }>(majdataSongKey(song.id), 1);
        if (reason === 'cache-clear') expect(stored).toBeNull();
        else expect(stored?.song.hash).toBe(song === songs[0] ? 'fresh' : 'cached');
      }
    } finally { controller.abort(); beginForegroundWork(); requests.getSong.mockRestore(); }
  });

  it('measures encoded payload bytes, including Chinese and supplementary characters', async () => {
    const value = { title: '舞萌 DX', emoji: '🎵', empty: '' };
    await repository.saveResource('unicode', 1, 'now', value);
    expect(await repository.listResourceSizes()).toEqual([{ key: 'unicode', bytes: Buffer.byteLength(JSON.stringify(value)) }]);
    expect(database.prepare("SELECT length('舞萌 DX') chars, length(CAST('舞萌 DX' AS BLOB)) bytes").get())
      .toMatchObject({ chars: 5, bytes: 9 });
  });

  it('clears keys beyond the SQLite bind limit and preserves unrelated rows', async () => {
    const keys = Array.from({ length: 1201 }, (_, index) => `key:${index}`);
    const insert = database.prepare('INSERT INTO resource_snapshots VALUES (?, 1, ?, ?)');
    for (const key of [...keys, 'keep']) insert.run(key, 'now', '{}');
    run.mockClear();
    await repository.clearResources([...keys, keys[0]]);
    expect(await repository.listResourceSizes()).toEqual([{ key: 'keep', bytes: 2 }]);
  });

  it('rolls back every batch when a later delete fails', async () => {
    const keys = Array.from({ length: 501 }, (_, index) => String(index));
    const insert = database.prepare('INSERT INTO resource_snapshots VALUES (?, 1, ?, ?)');
    keys.forEach((key) => insert.run(key, 'now', '{}'));
    run.mockImplementationOnce(async (sql, ...args) => database.prepare(sql).run(...args))
      .mockRejectedValueOnce(new Error('disk failure'));
    await expect(repository.clearResources(keys)).rejects.toThrow('disk failure');
    expect((await repository.listResourceSizes()).length).toBe(501);
  });

  it('checks invalidation after asynchronous database initialization, before submitting a write', async () => {
    const guard = captureResourceWrites('integration-test');
    const pending = repository.saveResource('late', 1, 'now', {}, guard);
    invalidateResourceWrites('integration-test');
    await expect(pending).rejects.toThrow('缓存请求已失效');
    expect(await repository.getResource('late', 1)).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
  it('keeps unrelated library and snapshot writes outside a failing clear transaction', async () => {
    const library = new SqliteUserLibraryRepository();
    await library.list();
    await repository.saveResource('clear-me', 1, 'now', {});
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    run.mockImplementationOnce(async (sql, ...args) => {
      database.prepare(sql).run(...args);
      reached.resolve(); await release.promise;
      throw new Error('clear failed');
    });
    const clearing = repository.clearResources(['clear-me']);
    const failure = expect(clearing).rejects.toThrow('clear failed');
    await reached.promise;
    const writing = repository.saveResource('unrelated', 1, 'now', { kept: true });
    const presets = library.setTagPresets(['舞萌 DX', '🎵']);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(database.prepare("SELECT * FROM resource_snapshots WHERE resource_key = 'unrelated'").get()).toBeUndefined();
    release.resolve();
    await failure; await Promise.all([writing, presets]);
    expect(await repository.getResource('clear-me', 1)).toEqual({});
    expect(await repository.getResource('unrelated', 1)).toEqual({ kept: true });
    expect(await library.listTagPresets()).toEqual(['舞萌 DX', '🎵']);
  });

  it('rechecks cache generations after waiting for an unrelated database writer', async () => {
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const blocking = runDatabaseWrite(async () => { reached.resolve(); await release.promise; });
    await reached.promise;
    const guard = captureResourceWrites('queued-test');
    const pending = repository.saveResource('stale', 1, 'now', {}, guard);
    const failure = expect(pending).rejects.toThrow('缓存请求已失效');
    await new Promise((resolve) => setTimeout(resolve, 0));
    invalidateResourceWrites('queued-test'); release.resolve();
    await blocking; await failure;
    expect(await repository.getResource('stale', 1)).toBeNull();
  });

  it('keeps concurrent backup merges and single-item writes without losing updates', async () => {
    const library = new SqliteUserLibraryRepository();
    const at = '2026-09-24T00:00:00.000Z';
    const song = (songId: string) => ({
      key: `song:maimai:${songId}`, gameId: 'maimai' as const, kind: 'song' as const,
      songId, favorite: true, tags: [], createdAt: at, updatedAt: at,
    });
    await library.mergeBackup({ items: [song('A')], presets: ['旧预设'] }, 'replace');
    await Promise.all([
      library.mergeBackup({ items: [song('C')], presets: ['新预设'] }, 'merge'),
      library.updateTarget({ kind: 'song', gameId: 'maimai', songId: 'B' }, () => song('B')),
    ]);
    expect((await library.list()).map((item) => item.key).sort())
      .toEqual(['song:maimai:A', 'song:maimai:B', 'song:maimai:C']);
    expect(await library.listTagPresets()).toEqual(['旧预设', '新预设']);
  });

  it('removes the emptied row and prunes orphan tags on a single-target write', async () => {
    const library = new SqliteUserLibraryRepository();
    const at = '2026-09-24T00:00:00.000Z';
    await library.mergeBackup({
      items: [{
        key: 'song:maimai:A', gameId: 'maimai', kind: 'song', songId: 'A',
        favorite: true, tags: ['独有', '共有'], createdAt: '2026-09-20T00:00:00.000Z', updatedAt: at,
      }, {
        key: 'song:maimai:B', gameId: 'maimai', kind: 'song', songId: 'B',
        favorite: true, tags: ['共有'], createdAt: at, updatedAt: at,
      }],
      presets: [],
    }, 'replace');
    run.mockClear();
    const result = await library.updateTarget(
      { kind: 'song', gameId: 'maimai', songId: 'A' },
      (current) => {
        if (!current || current.kind !== 'song') throw new Error('missing seeded song');
        return { ...current, favorite: false, tags: [], updatedAt: '2026-09-24T00:00:01.000Z' };
      },
    );
    expect(result.map((item) => item.key)).toEqual(['song:maimai:B']);
    expect(result[0]).toMatchObject({ createdAt: at, tags: ['共有'] });
    expect(database.prepare('SELECT normalized_name AS name FROM user_library_tags ORDER BY name').all())
      .toEqual([{ name: '共有' }]);
  });

  it('keeps both charts when two best merges of one account overlap', async () => {
    const cache = new PhiraCache(repository);
    await Promise.all([cache.mergeBests(1, [queriedBest(101)]), cache.mergeBests(1, [queriedBest(102)])]);
    expect(Object.keys((await cache.loadBests(1))?.items ?? {}).sort()).toEqual(['101', '102']);
  });

  it('lets the later best merge win on the same chart and keeps the other chart of the same batch', async () => {
    const cache = new PhiraCache(repository);
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const blocking = runDatabaseWrite(async () => { reached.resolve(); await release.promise; });
    await reached.promise;
    const first = cache.mergeBests(1, [queriedBest(201, 900_000), queriedBest(202, 900_000)]);
    const second = cache.mergeBests(1, [queriedBest(201, 950_000)]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    release.resolve();
    await blocking;
    await Promise.all([first, second]);
    const items = (await cache.loadBests(1))?.items ?? {};
    expect(items['201'].record?.score).toBe(950_000);
    expect(items['202']).toBeDefined();
  });

  it('reads the previous best merge on the next serial merge', async () => {
    const cache = new PhiraCache(repository);
    await cache.mergeBests(1, [queriedBest(301)]);
    await cache.mergeBests(1, [queriedBest(302)]);
    expect(Object.keys((await cache.loadBests(1))?.items ?? {}).sort()).toEqual(['301', '302']);
  });

  it('refuses to publish a best merge invalidated while it waits for the write queue', async () => {
    const cache = new PhiraCache(repository);
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const blocking = runDatabaseWrite(async () => { reached.resolve(); await release.promise; });
    await reached.promise;
    const guard = captureResourceWrites('phira', undefined, 'phira:community:1');
    const pending = cache.mergeBests(1, [queriedBest(401)], guard);
    const failure = expect(pending).rejects.toThrow('缓存请求已失效');
    await new Promise((resolve) => setTimeout(resolve, 0));
    invalidateResourceWrites('account:phira:community:1');
    release.resolve();
    await blocking;
    await failure;
    expect(await cache.loadBests(1)).toBeNull();
  });

  it('keeps later best merges running after one failed write', async () => {
    const cache = new PhiraCache(repository);
    run.mockRejectedValueOnce(new Error('disk failure'));
    await expect(cache.mergeBests(1, [queriedBest(501)])).rejects.toThrow('disk failure');
    expect(await cache.loadBests(1)).toBeNull();
    await cache.mergeBests(1, [queriedBest(502)]);
    expect(Object.keys((await cache.loadBests(1))?.items ?? {})).toEqual(['502']);
  });

  it('clears one game without touching other games or presets', async () => {
    const library = new SqliteUserLibraryRepository();
    const at = '2026-09-24T00:00:00.000Z';
    await library.mergeBackup({
      items: [{
        key: 'song:maimai:A', gameId: 'maimai', kind: 'song', songId: 'A',
        favorite: true, tags: ['舞萌标签'], createdAt: at, updatedAt: at,
      }, {
        key: 'song:phigros:A', gameId: 'phigros', kind: 'song', songId: 'A',
        favorite: true, tags: ['Phigros 标签'], createdAt: at, updatedAt: at,
      }],
      presets: ['预设'],
    }, 'replace');
    expect((await library.list('maimai')).map((item) => item.key)).toEqual(['song:maimai:A']);
    const remaining = await library.clearGame('maimai');
    expect(remaining.map((item) => item.key)).toEqual(['song:phigros:A']);
    expect(await library.listTagPresets()).toEqual(['预设']);
    expect(database.prepare('SELECT normalized_name AS name FROM user_library_tags ORDER BY name').all())
      .toEqual([{ name: 'phigros 标签' }]);
  });

  it('keeps favorites, practice and tags independent and removes empty items', async () => {
    const library = new SqliteUserLibraryRepository();
    const service = new UserLibraryService(library);
    await service.setSongFavorite('maimai', '10001', true);
    await service.setChartPractice('maimai', '1', 'DX', 3, true);
    await service.setTags({ kind: 'song', gameId: 'maimai', songId: '1' }, ['喜欢']);
    await service.setSongFavorite('maimai', '1', false);
    expect(await service.list()).toHaveLength(2);
    await service.setTags({ kind: 'song', gameId: 'maimai', songId: '1' }, []);
    expect(await service.list()).toEqual([expect.objectContaining({ kind: 'chart', practice: true })]);
  });

  it('round-trips current backups, rejects old input, and keeps a failed import atomic', async () => {
    const service = new UserLibraryService(new SqliteUserLibraryRepository());
    await service.setSongFavorite('rizline', 'Song.A.1', true);
    await service.setChartPractice('maimai', '100123', 'UTAGE', 0, true);
    await service.setTagPresets(['原预设']);
    const backup = await service.createBackup();
    await service.clear();
    await service.restore(parseUserDataBackup(JSON.parse(JSON.stringify(backup))), 'replace');
    expect(await service.list()).toEqual(backup.items);
    expect(await service.listTagPresets()).toEqual(['原预设']);
    for (const version of [1, 2]) {
      expect(() => parseUserDataBackup({ ...backup, version })).toThrow();
      expect(await service.list()).toEqual(backup.items);
    }
    const imported = createUserDataBackup([], backup.exportedAt, ['新预设']);
    run.mockImplementationOnce(async (sql, ...args) => database.prepare(sql).run(...args))
      .mockRejectedValueOnce(new Error('disk failure'));
    await expect(service.restore(imported, 'replace')).rejects.toThrow('disk failure');
    expect(await service.list()).toEqual(backup.items);
    expect(await service.listTagPresets()).toEqual(['原预设']);
  });

  it('rejects overflowing preset merges without modifying existing items or presets', async () => {
    const service = new UserLibraryService(new SqliteUserLibraryRepository());
    await service.setSongFavorite('maimai', '1', true);
    const presets = Array.from({ length: 20 }, (_, index) => `现有${index}`);
    await service.setTagPresets(presets);
    const previous = await service.list();
    const backup = createUserDataBackup([], '2026-07-13T00:00:00.000Z', Array.from({ length: 20 }, (_, index) => `导入${index}`));
    await expect(service.restore(backup, 'merge')).rejects.toThrow('标签预设');
    expect(await service.list()).toEqual(previous);
    expect(await service.listTagPresets()).toEqual(presets);
  });

  it.each([1, 5])('rebuilds unsupported library version %i without clearing resource caches', async (version) => {
    const service = new UserLibraryService(new SqliteUserLibraryRepository());
    await service.setSongFavorite('maimai', '1', true);
    await repository.saveResource('keep', 1, 'now', { keep: true });
    database.prepare('UPDATE user_library_meta SET schema_version = ?').run(version);
    await reloadStorage();
    const restarted = new UserLibraryService(new SqliteUserLibraryRepository());
    expect(await restarted.list()).toEqual([]);
    expect(await restarted.listTagPresets()).toEqual([...DEFAULT_TAG_PRESETS]);
    expect(await new SqliteSnapshotRepository().getResource('keep', 1)).toEqual({ keep: true });
    await restarted.setSongFavorite('maimai', '2', true);
    expect(await restarted.list()).toEqual([expect.objectContaining({ songId: '2' })]);
  });

  it('rebuilds an unsupported library structure and preserves valid current data on restart', async () => {
    const service = new UserLibraryService(new SqliteUserLibraryRepository());
    await service.setSongFavorite('phigros', 'Song.A', true);
    await service.setTagPresets(['保留']);
    const current = await service.list();
    await reloadStorage();
    const restarted = new UserLibraryService(new SqliteUserLibraryRepository());
    expect(await restarted.list()).toEqual(current);
    expect(await restarted.listTagPresets()).toEqual(['保留']);
    database.exec('ALTER TABLE user_library_items RENAME COLUMN game_id TO unsupported_game_id');
    await reloadStorage();
    expect(await new SqliteUserLibraryRepository().list()).toEqual([]);
  });

  it('propagates library read and rebuild I/O failures without deleting data', async () => {
    const service = new UserLibraryService(new SqliteUserLibraryRepository());
    await service.setSongFavorite('maimai', '1', true);
    await reloadStorage();
    reads.mockRejectedValueOnce(new Error('read failure'));
    await expect(new SqliteUserLibraryRepository().list()).rejects.toThrow('read failure');
    expect(database.prepare('SELECT song_id FROM user_library_items').all()).toEqual([{ song_id: '1' }]);
    database.exec('UPDATE user_library_meta SET schema_version = 1');
    run.mockRejectedValueOnce(new Error('write failure'));
    await expect(new SqliteUserLibraryRepository().list()).rejects.toThrow('write failure');
    expect(database.prepare('SELECT song_id FROM user_library_items').all()).toEqual([{ song_id: '1' }]);
  });

  it('removes only invalid snapshots and resources, keeping supported rows', async () => {
    const source = { kind: 'local' as const, label: 'Local', updatedAt: '2026-07-13T00:00:00.000Z', isStale: false };
    const player = { id: 'keep', displayName: 'Player', rating: 0, source };
    const currentVersion = { id: 1, title: '当前版本' };
    const score: ScoreSnapshot = { player, records: [], source, catalogSource: source,
      best50: { player, currentVersion, b35: [], b15: [], unmatchedRecordCount: 0, rating: 0, generatedAt: source.updatedAt, source } };
    const catalog: CatalogSnapshot = { songs: [], versions: [currentVersion], currentVersion, chartVersionIndex: {}, source };
    await repository.save('keep', score);
    await repository.saveCatalog(catalog);
    await repository.saveResource('keep', 1, 'now', { keep: true });
    database.prepare('INSERT INTO account_score_snapshots VALUES (?, ?, ?, ?)').run('old', 4, 'now', '{}');
    database.prepare('INSERT INTO resource_snapshots VALUES (?, ?, ?, ?)').run('old', 9, 'now', '{}');
    database.prepare('INSERT INTO resource_snapshots VALUES (?, ?, ?, ?)').run('broken', 1, 'now', '{bad');
    await repository.saveResource('bad-shape', 1, 'now', { song: null });
    expect(await repository.getLatest('old')).toBeNull();
    expect(await repository.getResource('old', 1)).toBeNull();
    expect(await repository.getResource('broken', 1)).toBeNull();
    expect(await repository.getResource('bad-shape', 1, z.object({ song: z.object({ id: z.string() }) }))).toBeNull();
    expect(await repository.getLatest('keep')).toEqual(score);
    expect(await repository.getLatestCatalog()).toEqual(catalog);
    expect(await repository.getResource('keep', 1)).toEqual({ keep: true });
    expect(database.prepare('SELECT account_id FROM account_score_snapshots').all()).toEqual([{ account_id: 'keep' }]);
    expect((await repository.listResourceSizes()).map(({ key }) => key)).toEqual(['keep']);
  });

  it('does not clear a valid cache on read failure or delete a newer replacement', async () => {
    await repository.saveResource('keep', 1, 'now', { keep: true });
    const nativeDatabase = await bridge.open.mock.results[0].value;
    const first = vi.spyOn(nativeDatabase, 'getFirstAsync').mockRejectedValueOnce(new Error('read failure'));
    await expect(repository.getResource('keep', 1)).rejects.toThrow('read failure');
    expect(await repository.getResource('keep', 1)).toEqual({ keep: true });
    first.mockRestore();
    database.prepare('INSERT INTO resource_snapshots VALUES (?, ?, ?, ?)').run('old', 1, 'now', '{}');
    const release = Promise.withResolvers<void>();
    const blocked = runDatabaseWrite(() => release.promise);
    const replacement = repository.saveResource('old', 1, 'now', { current: true });
    const reading = repository.getResource('old', 1, z.object({ current: z.boolean() }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    release.resolve();
    await blocked; await replacement;
    expect(await reading).toBeNull();
    expect(await repository.getResource('old', 1)).toEqual({ current: true });
  });

});
