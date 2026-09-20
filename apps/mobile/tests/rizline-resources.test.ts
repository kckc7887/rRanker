import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { RizlineResourceService } from '@/services/rizline-resources';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { rizlineCatalog, rizlineCatalogAssetFiles } from './fixtures/rizline';
vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {} }));

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
function repository() {
  const values = new Map<string, unknown>();
  return { values, getResource: async <T>(key: string) => values.get(key) as T ?? null,
    saveResource: vi.fn(async <T>(key: string, _schema: number, _updatedAt: string, value: T, assertCurrent?: () => void) => {
      assertCurrent?.(); values.set(key, value);
    }) };
}

describe('Rizline verified catalog releases', () => {
  it('checks the pointer while reusing verified bytes for unchanged revisions', async () => {
    const release = fixture(); const fetcher = vi.fn(async input => release.respond(input));
    const repo = repository(); const service = new RizlineResourceService(repo, fetcher);
    await service.loadFresh(); fetcher.mockClear();
    await service.loadFresh(); expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await service.loadCached())?.snapshot.resourceVersion).toBe('r1');
  });
  it('keeps the last valid catalog offline and rejects corrupted updates', async () => {
    let release = fixture(); let corrupt = false;
    const fetcher = vi.fn(async input => String(input).includes('/catalog.json') && corrupt ? new Response('corrupt') : release.respond(input));
    const repo = repository(); const service = new RizlineResourceService(repo, fetcher);
    await service.loadFresh(); release = fixture('r2'); corrupt = true;
    await expect(service.loadFresh()).rejects.toThrow('校验失败');
    fetcher.mockRejectedValue(new Error('offline'));
    const fallback = await service.load();
    expect(fallback.snapshot.resourceVersion).toBe('r1'); expect(fallback.source.isStale).toBe(true);
    expect(repo.saveResource).toHaveBeenCalledTimes(1);
  });
  it('cancels consumers independently and rejects writes from a cleared generation', async () => {
    const release = fixture(); let complete!: () => void;
    const gate = new Promise<void>(resolve => { complete = resolve; });
    const fetcher = vi.fn(async input => { await gate; return release.respond(input); });
    const repo = repository(); const service = new RizlineResourceService(repo, fetcher);
    const firstController = new AbortController();
    const first = service.loadFresh(firstController.signal); const rejected = expect(first).rejects.toBeDefined();
    const second = service.loadFresh();
    firstController.abort(); await rejected;
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    invalidateResourceWrites('rizline'); complete();
    await expect(second).rejects.toThrow('缓存请求已失效');
    expect(repo.saveResource).not.toHaveBeenCalled(); service.clear();
  });
  it('publishes a new revision only after all validations finish', async () => {
    let release = fixture(); const repo = repository();
    const service = new RizlineResourceService(repo, vi.fn(async input => release.respond(input)));
    const first = await service.loadFresh(); release = fixture('r2');
    const next = await service.loadFresh();
    expect(next.snapshot.resourceVersion).toBe('r2'); expect(first.snapshot.resourceVersion).toBe('r1');
    expect(repo.saveResource).toHaveBeenCalledTimes(2);
  });
  it('keeps manifest files on the in-memory release and omits them from SQLite', async () => {
    const release = fixture(); const repo = repository();
    const service = new RizlineResourceService(repo, vi.fn(async input => release.respond(input)));
    const catalog = await service.loadFresh();
    expect('files' in catalog).toBe(false);
    expect(repo.values.get('rizline:catalog')).toEqual(catalog);
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
    const service = new RizlineResourceService(repository(), vi.fn(async input => {
      const path = new URL(String(input)).pathname;
      return new Response(path.endsWith('current.json') ? current : path.endsWith('manifest.json') ? manifest : catalog);
    }));
    await expect(service.loadFresh()).rejects.toThrow('曲库内容不一致');
  });
});
