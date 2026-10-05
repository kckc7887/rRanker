import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { rizlineCatalog, rizlineCatalogAssetFiles } from './fixtures/rizline';
let RizlineResourceService: typeof import('@/services/rizline-resources')['RizlineResourceService'];
let invalidateResourceWrites: typeof import('@/services/snapshot-cache-utils')['invalidateResourceWrites'];
let database: DatabaseSync;
const transport = vi.hoisted(() => ({ fetch: vi.fn<typeof fetch>() }));
vi.mock('expo/fetch', () => ({ fetch: transport.fetch }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async (sql: string) => database.exec(sql),
  runAsync: async (sql: string, ...args: (string | number)[]) => database.prepare(sql).run(...args),
  getFirstAsync: async (sql: string, ...args: (string | number)[]) => database.prepare(sql).get(...args) ?? null,
}) }));
beforeEach(async () => {
  database = new DatabaseSync(':memory:');
  transport.fetch.mockReset();
  vi.resetModules();
  ({ RizlineResourceService } = await import('@/services/rizline-resources'));
  ({ invalidateResourceWrites } = await import('@/services/snapshot-cache-utils'));
});
afterEach(() => database.close());

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function fixture(revision = 'r1') {
  const prefix = `rizline/releases/${revision}/`;
  const catalogObject = rizlineCatalog(revision);
  const catalog = JSON.stringify(catalogObject);
  const files = [
    { path: `${prefix}catalog.json`, size: Buffer.byteLength(catalog), sha256: hash(catalog) },
    ...rizlineCatalogAssetFiles(catalogObject).map(file => ({ ...file, sha256: hash(file.path) })),
  ];
  const manifest = JSON.stringify({ schemaVersion: 1, resourceVersion: revision, gameVersion: '2.7.1', catalogPath: `${prefix}catalog.json`,
    files });
  const current = JSON.stringify({ schemaVersion: 1, resourceVersion: revision, manifestPath: `${prefix}manifest.json`, manifestSha256: hash(manifest) });
  return { catalog, respond: (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    return new Response(path.endsWith('current.json') ? current : path.endsWith('manifest.json') ? manifest : catalog);
  } };
}
describe('Rizline verified catalog releases', () => {
  it('checks the pointer while reusing verified bytes for unchanged revisions', async () => {
    const release = fixture(); const fetcher = transport.fetch.mockImplementation(async input => release.respond(input));
    const service = new RizlineResourceService();
    await service.loadFresh(); fetcher.mockClear();
    await service.loadFresh(); expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await service.loadCached())?.snapshot.resourceVersion).toBe('r1');
  });
  it('keeps the last valid catalog offline and rejects corrupted updates', async () => {
    let release = fixture(); let corrupt = false;
    const fetcher = transport.fetch.mockImplementation(async input => String(input).includes('/catalog.json') && corrupt ? new Response('corrupt') : release.respond(input));
    const service = new RizlineResourceService();
    await service.loadFresh(); release = fixture('r2'); corrupt = true;
    await expect(service.loadFresh()).rejects.toThrow('校验失败');
    fetcher.mockRejectedValue(new Error('offline'));
    const fallback = await service.load();
    expect(fallback.snapshot.resourceVersion).toBe('r1'); expect(fallback.source.isStale).toBe(true);
    expect((await service.loadCached())?.snapshot.resourceVersion).toBe('r1');
  });
  it('cancels consumers independently and rejects writes from a cleared generation', async () => {
    const release = fixture(); let complete!: () => void;
    const gate = new Promise<void>(resolve => { complete = resolve; });
    const fetcher = transport.fetch.mockImplementation(async input => { await gate; return release.respond(input); });
    const service = new RizlineResourceService();
    const firstController = new AbortController();
    const first = service.loadFresh(firstController.signal); const rejected = expect(first).rejects.toBeDefined();
    const second = service.loadFresh();
    firstController.abort(); await rejected;
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    invalidateResourceWrites('rizline'); complete();
    await expect(second).rejects.toThrow('缓存请求已失效');
    expect(await service.loadCached()).toBeNull(); service.clear();
  });
  it('publishes a new revision only after all validations finish', async () => {
    let release = fixture(); transport.fetch.mockImplementation(async input => release.respond(input));
    const service = new RizlineResourceService();
    const first = await service.loadFresh(); release = fixture('r2');
    const next = await service.loadFresh();
    expect(next.snapshot.resourceVersion).toBe('r2'); expect(first.snapshot.resourceVersion).toBe('r1');
    expect((await service.loadCached())?.snapshot.resourceVersion).toBe('r2');
  });
  it('keeps manifest files on the in-memory release and omits them from SQLite', async () => {
    const release = fixture(); transport.fetch.mockImplementation(async input => release.respond(input));
    const service = new RizlineResourceService();
    const catalog = await service.loadFresh();
    expect('files' in catalog).toBe(false);
    expect(await service.loadCached()).toEqual(catalog);
    await service.withRelease(async (current) => {
      expect(current.files.some(file => file.path.endsWith('.m4a'))).toBe(true);
      expect(current.files.some(file => file.path.endsWith('.json') && file.path.includes('/charts/'))).toBe(true);
      return undefined;
    });
  });
  it('rejects catalogs whose audio or chart paths are missing from the manifest', async () => {
    const prefix = 'rizline/releases/r1/';
    const catalogObject = rizlineCatalog();
    const catalog = JSON.stringify(catalogObject);
    const manifest = JSON.stringify({ schemaVersion: 1, resourceVersion: 'r1', gameVersion: '2.7.1', catalogPath: `${prefix}catalog.json`,
      files: [{ path: `${prefix}catalog.json`, size: Buffer.byteLength(catalog), sha256: hash(catalog) }] });
    const current = JSON.stringify({ schemaVersion: 1, resourceVersion: 'r1', manifestPath: `${prefix}manifest.json`, manifestSha256: hash(manifest) });
    transport.fetch.mockImplementation(async input => {
      const path = new URL(String(input)).pathname;
      return new Response(path.endsWith('current.json') ? current : path.endsWith('manifest.json') ? manifest : catalog);
    });
    const service = new RizlineResourceService();
    await expect(service.loadFresh()).rejects.toThrow('曲库内容不一致');
  });
});
