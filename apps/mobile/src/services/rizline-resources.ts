import { type RizlineCatalogData, RIZLINE_RESOURCE_BASE } from '@/domain/rizline';
import { RizlineCatalogSchema, RizlineCurrentSchema, RizlineManifestSchema } from '@/providers/rizline-catalog-schema';
import { requestBytes, requestJson } from '@/providers/http-json';
import { ProviderError } from '@/providers/errors';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { captureResourceWrites, createInflightGuard, resourceWriteGeneration, snapshotSource } from './snapshot-cache-utils';
import { cacheFirstLoad, staleCached } from './cache-first';
import { VerifiedReleaseSession, verifyResourceBytes } from './verified-release';

export const RIZLINE_CATALOG_KEY = 'rizline:catalog';
type Repository = Pick<SqliteSnapshotRepository, 'getResource' | 'saveResource'>;
export class RizlineResourceService {
  private readonly releases = new VerifiedReleaseSession<RizlineCatalogData>((signal, force) => this.prepare(signal, force));
  private readonly loads = createInflightGuard<string>();
  private revision: string | undefined;
  constructor(private readonly repository: Repository = new SqliteSnapshotRepository(), private readonly fetcher: typeof fetch = fetch,
    private readonly base = RIZLINE_RESOURCE_BASE) {}

  clear(): void { this.loads.clear(); this.releases.clear(); this.revision = undefined; }
  private url(path: string): string { return `${this.base}/${path.split('/').map(encodeURIComponent).join('/')}`; }
  private requestOptions(signal?: AbortSignal) {
    return { baseUrl: this.base, fetcher: this.fetcher, signal, retries: 1, label: 'Rizline 曲库',
      error: (status: number) => new ProviderError('network', `Rizline 曲库请求失败：${status}`, true) };
  }
  private async prepare(signal: AbortSignal, force: boolean): Promise<RizlineCatalogData> {
    const current = await requestJson({ ...this.requestOptions(signal), path: `/rizline/current.json?_check=${Date.now()}`,
      schema: RizlineCurrentSchema, diagnosticScenario: 'release' });
    const identity = JSON.stringify(current);
    const previous = this.releases.peek();
    if (!force && previous && identity === this.revision) return { ...previous, source: snapshotSource({ kind: 'rizline', label: 'Rizline 曲库' }) };
    const prefix = `rizline/releases/${current.resourceVersion}/`;
    if (!current.manifestPath.startsWith(prefix)) throw new ProviderError('upstream_schema', 'Rizline 发布路径不一致', true);
    const bytes = async (path: string) => requestBytes({ ...this.requestOptions(signal), baseUrl: '', path: this.url(path) + (force ? `?_retry=${Date.now()}` : ''), diagnosticScenario: 'catalog' });
    const rawManifest = await bytes(current.manifestPath);
    await verifyResourceBytes(rawManifest, { sha256: current.manifestSha256 }, 'Rizline 清单校验失败');
    const manifest = RizlineManifestSchema.parse(JSON.parse(new TextDecoder().decode(rawManifest)));
    const paths = new Set(manifest.files.map(file => file.path));
    if (manifest.resourceVersion !== current.resourceVersion || paths.size !== manifest.files.length
      || manifest.files.some(file => !file.path.startsWith(prefix)) || !manifest.catalogPath.startsWith(prefix)) {
      throw new ProviderError('upstream_schema', 'Rizline 发布内容不一致', true);
    }
    const catalogFile = manifest.files.find(file => file.path === manifest.catalogPath);
    if (!catalogFile) throw new ProviderError('upstream_schema', 'Rizline 发布缺少曲库', true);
    const catalogBytes = await bytes(catalogFile.path);
    await verifyResourceBytes(catalogBytes, catalogFile, 'Rizline 曲库校验失败');
    const snapshot = RizlineCatalogSchema.parse(JSON.parse(new TextDecoder().decode(catalogBytes)));
    if (snapshot.resourceVersion !== current.resourceVersion || snapshot.gameVersion !== manifest.gameVersion
      || snapshot.songs.some(song => song.coverPath != null && !paths.has(song.coverPath))) {
      throw new ProviderError('upstream_schema', 'Rizline 曲库内容不一致', true);
    }
    if (signal.aborted) throw signal.reason;
    this.revision = identity;
    return { snapshot, source: snapshotSource({ kind: 'rizline', label: 'Rizline 曲库' }) };
  }
  async loadCached(): Promise<RizlineCatalogData | null> {
    const cached = await this.repository.getResource<RizlineCatalogData>(RIZLINE_CATALOG_KEY, 1);
    if (!cached || !RizlineCatalogSchema.safeParse(cached.snapshot).success) return null;
    return cached;
  }
  loadFresh(signal?: AbortSignal): Promise<RizlineCatalogData> {
    const generation = resourceWriteGeneration('rizline');
    return this.loads.share(String(generation), async requestSignal => {
      const assertCurrent = captureResourceWrites('rizline', requestSignal);
      const data = await this.releases.load(requestSignal, true);
      assertCurrent();
      await this.repository.saveResource(RIZLINE_CATALOG_KEY, 1, data.source.updatedAt, data, assertCurrent);
      assertCurrent();
      return data;
    }, signal);
  }
  async load(signal?: AbortSignal, onFresh?: (data: RizlineCatalogData) => void): Promise<RizlineCatalogData> {
    const assertCurrent = captureResourceWrites('rizline', signal);
    if (onFresh) return cacheFirstLoad({ loadCached: () => this.loadCached(), loadFresh: requestSignal => this.loadFresh(requestSignal),
      onFresh, signal, assertCurrent });
    try { return await this.loadFresh(signal); }
    catch (error) {
      assertCurrent();
      const cached = await this.loadCached();
      assertCurrent();
      if (cached) return staleCached(cached);
      throw error;
    }
  }
}
export const rizlineResources = new RizlineResourceService();
