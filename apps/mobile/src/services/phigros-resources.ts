import { z } from 'zod';
import { PHIGROS_OSS_BASE } from '@/domain/account-avatar';
import { requestBytes, requestJson } from '@/providers/http-json';
import { ProviderError } from '@/providers/errors';
import { sha256 } from '@/utils/resource-integrity';

const CurrentSchema = z.object({
  schemaVersion: z.literal(1), gameVersion: z.string().min(1),
  resourceVersion: z.string().min(1), publishedAt: z.string().optional(),
  catalog: z.string().min(1), manifest: z.string().min(1),
  noteCounts: z.string().optional(), manifestSha256: z.string().regex(/^[a-f\d]{64}$/i).optional(),
});
const AssetSchema = z.object({
  path: z.string().min(1), size: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f\d]{64}$/i), contentType: z.string(),
});
const ManifestSchema = z.object({
  gameVersion: z.string(), generatedAt: z.string(), assets: z.array(AssetSchema),
});
const CatalogSchema = z.object({
  songCount: z.number().int().nonnegative(),
  songs: z.array(z.object({
    id: z.string(), title: z.string(), composer: z.string(), illustrator: z.string(),
    charters: z.array(z.string()), difficulties: z.array(z.number()),
  })),
});
export type PhigrosResourceAsset = z.infer<typeof AssetSchema>;
export type PhigrosRelease = {
  current: z.infer<typeof CurrentSchema>;
  manifest: z.infer<typeof ManifestSchema>;
  catalog: z.infer<typeof CatalogSchema>;
  noteCounts: string;
  difficulty: string;
  avatarAliases: string;
  revision: string;
  fetchedAt: string;
  bypass: string | undefined;
};

function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new Error('Phigros resource request cancelled');
}

export async function verifyPhigrosResource(bytes: Uint8Array, asset: Pick<PhigrosResourceAsset, 'size' | 'sha256'>): Promise<void> {
  if (bytes.byteLength !== asset.size || await sha256(bytes) !== asset.sha256.toLowerCase()) {
    throw new ProviderError('upstream_schema', 'Phigros 资源校验失败', true);
  }
}

export class PhigrosResourceService {
  private release: PhigrosRelease | undefined;
  private sequence = 0;
  private pending: { promise: Promise<PhigrosRelease>; controller: AbortController; users: number; force: boolean } | undefined;

  constructor(private readonly base = PHIGROS_OSS_BASE) {}

  peek(): PhigrosRelease | undefined { return this.release; }

  clear(): void {
    this.pending?.controller.abort();
    this.pending = undefined;
    this.release = undefined;
  }

  url(path: string, release?: PhigrosRelease): string {
    // Encode object-key segments before URL parsing; '#' and '?' belong to song IDs.
    const url = new URL(path.split('/').map(encodeURIComponent).join('/'), `${this.base}/`);
    if (release) {
      url.searchParams.set('v', release.current.resourceVersion);
      if (release.bypass) url.searchParams.set('_retry', release.bypass);
    }
    return url.href;
  }

  asset(release: PhigrosRelease, path: string): PhigrosResourceAsset {
    const matches = release.manifest.assets.filter((asset) => asset.path === path);
    if (matches.length !== 1) throw new ProviderError('upstream_schema', `Phigros 资源缺失或重复：${path}`, true);
    return matches[0]!;
  }

  assetUrl(release: PhigrosRelease, asset: PhigrosResourceAsset): string {
    const directory = release.current.manifest.slice(0, release.current.manifest.lastIndexOf('/') + 1);
    return this.url(`${directory}${asset.path}`, release);
  }

  async bytes(url: string, signal?: AbortSignal, timeoutMs = 12_000): Promise<Uint8Array> {
    // The shared request runner owns timeout, cancellation and HTTP error handling.
    return requestBytes({
      baseUrl: '', path: url, signal, timeoutMs, retries: 1, label: 'Phigros', fetcher: fetch,
      error: (status) => new ProviderError('network', `Phigros 资源请求失败：${status}`, true),
    });
  }

  async readAsset(release: PhigrosRelease, asset: PhigrosResourceAsset, signal?: AbortSignal): Promise<Uint8Array> {
    const bytes = await this.bytes(this.assetUrl(release, asset), signal);
    await verifyPhigrosResource(bytes, asset);
    aborted(signal);
    return bytes;
  }

  private async fetchRelease(signal: AbortSignal, force: boolean): Promise<PhigrosRelease> {
    const nonce = `${Date.now()}-${++this.sequence}`;
    const current = await requestJson({
      baseUrl: this.base, path: `/phigros/current.json?_check=${nonce}`, schema: CurrentSchema,
      fetcher: fetch, signal, retries: 1, label: 'Phigros',
      error: (status) => new ProviderError('network', `Phigros 发布信息请求失败：${status}`, true),
    });
    const revision = JSON.stringify(current);
    if (!force && this.release?.revision === revision) return this.release;
    const candidate = { current, revision, bypass: force ? nonce : undefined, fetchedAt: new Date().toISOString() } as PhigrosRelease;
    const rawManifest = await this.bytes(this.url(current.manifest, candidate), signal);
    if (current.manifestSha256 && await sha256(rawManifest) !== current.manifestSha256.toLowerCase()) {
      throw new ProviderError('upstream_schema', 'Phigros 清单校验失败', true);
    }
    candidate.manifest = ManifestSchema.parse(JSON.parse(new TextDecoder().decode(rawManifest)));
    if (candidate.manifest.gameVersion !== current.gameVersion
      || (current.publishedAt && candidate.manifest.generatedAt !== current.publishedAt)) {
      throw new ProviderError('upstream_schema', 'Phigros 发布内容不一致', true);
    }
    const directory = current.manifest.slice(0, current.manifest.lastIndexOf('/') + 1);
    const relative = (path: string) => {
      if (!path.startsWith(directory)) throw new ProviderError('upstream_schema', 'Phigros 发布路径不一致', true);
      return path.slice(directory.length);
    };
    const avatarAsset = candidate.manifest.assets.find((asset) => asset.path === 'metadata/tmp.tsv');
    const [catalog, notes, difficulty, avatars] = await Promise.all([
      this.readAsset(candidate, this.asset(candidate, relative(current.catalog)), signal),
      this.readAsset(candidate, this.asset(candidate, current.noteCounts ? relative(current.noteCounts) : 'metadata/note_counts.tsv'), signal),
      this.readAsset(candidate, this.asset(candidate, 'metadata/difficulty.tsv'), signal),
      avatarAsset ? this.readAsset(candidate, avatarAsset, signal) : Promise.resolve(new Uint8Array()),
    ]);
    candidate.catalog = CatalogSchema.parse(JSON.parse(new TextDecoder().decode(catalog)));
    if (candidate.catalog.songCount !== candidate.catalog.songs.length) throw new ProviderError('upstream_schema', 'Phigros 歌曲数量不一致', true);
    candidate.noteCounts = new TextDecoder().decode(notes);
    candidate.difficulty = new TextDecoder().decode(difficulty);
    candidate.avatarAliases = new TextDecoder().decode(avatars);
    aborted(signal);
    this.release = candidate;
    return candidate;
  }

  private acquire(signal: AbortSignal | undefined, check: boolean, force: boolean): Promise<PhigrosRelease> {
    aborted(signal);
    if (!check && this.release) return Promise.resolve(this.release);
    if (force && this.pending && !this.pending.force) {
      // A pointer-only check cannot satisfy recovery of corrupted bytes at an unchanged revision.
      return this.acquire(signal, true, false).catch(() => { aborted(signal); })
        .then(() => this.acquire(signal, true, true));
    }
    if (!this.pending) {
      const controller = new AbortController();
      const entry = { controller, users: 0, force, promise: this.fetchRelease(controller.signal, force) };
      this.pending = entry;
      void entry.promise.finally(() => { if (this.pending === entry) this.pending = undefined; }).catch(() => undefined);
    }
    const entry = this.pending;
    entry.users += 1;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = () => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener('abort', cancel);
        entry.users -= 1;
        if (entry.users === 0 && this.pending === entry) {
          this.pending = undefined;
          entry.controller.abort();
        }
        return true;
      };
      const cancel = () => { if (finish()) reject(signal?.reason ?? new Error('Phigros resource request cancelled')); };
      signal?.addEventListener('abort', cancel, { once: true });
      entry.promise.then((value) => { if (finish()) resolve(value); }, (error) => { if (finish()) reject(error); });
    });
  }

  async withRelease<T>(action: (release: PhigrosRelease) => Promise<T>, signal?: AbortSignal, check = false): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      aborted(signal);
      try {
        const release = await this.acquire(signal, check || attempt > 0, attempt > 0);
        const result = await action(release);
        aborted(signal);
        return result;
      } catch (error) {
        aborted(signal);
        if (attempt > 0) throw error;
      }
    }
  }

  load(signal?: AbortSignal, check = false): Promise<PhigrosRelease> {
    return this.withRelease(async (release) => release, signal, check);
  }
}

export const phigrosResources = new PhigrosResourceService();
