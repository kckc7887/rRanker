import { fetch as expoFetch } from 'expo/fetch';
import type { RuntimeRequestScenario } from '@/domain/runtime-log';
import { z } from 'zod';
import { PHIGROS_OSS_BASE } from '@/domain/account-avatar';
import { requestBytes, requestJson } from '@/providers/http-json';
import { ProviderError } from '@/providers/errors';
import { resourceObjectPathSchema, VerifiedReleaseSession, verifyResourceBytes } from './verified-release';

const ObjectPathSchema = resourceObjectPathSchema('phigros', ['avatars', 'charts', 'illustrations', 'illustrations-blur', 'illustrations-lowres', 'music', 'metadata']);

const CurrentSchema = z.object({
  schemaVersion: z.literal(2), gameVersion: z.string().min(1),
  resourceVersion: z.string().min(1), publishedAt: z.string().min(1),
  catalog: ObjectPathSchema, manifest: resourceObjectPathSchema('phigros', ['manifests']),
  noteCounts: ObjectPathSchema, manifestSha256: z.string().regex(/^[a-f\d]{64}$/i),
});
const AssetSchema = z.object({
  path: z.string().min(1), objectKey: ObjectPathSchema, size: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f\d]{64}$/i), contentType: z.string(),
});
const ManifestSchema = z.object({
  schemaVersion: z.literal(2), resourceVersion: z.string().min(1),
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
  await verifyResourceBytes(bytes, asset, 'Phigros 资源校验失败');
}

export class PhigrosResourceService {
  private readonly session = new VerifiedReleaseSession<PhigrosRelease>((signal, force) => this.fetchRelease(signal, force));
  private sequence = 0;

  peek(): PhigrosRelease | undefined { return this.session.peek(); }

  clear(): void {
    this.session.clear();
  }

  url(path: string, release?: PhigrosRelease): string {
    const url = new URL(path.split('/').map(encodeURIComponent).join('/'), `${PHIGROS_OSS_BASE}/`);
    if (release?.bypass) url.searchParams.set('_retry', release.bypass);
    return url.href;
  }

  asset(release: PhigrosRelease, path: string): PhigrosResourceAsset {
    const matches = release.manifest.assets.filter((asset) => asset.path === path);
    if (matches.length !== 1) throw new ProviderError('upstream_schema', `Phigros 资源缺失或重复：${path}`, true);
    return matches[0]!;
  }

  assetUrl(release: PhigrosRelease, asset: PhigrosResourceAsset): string {
    return this.url(asset.objectKey, release);
  }

  async bytes(url: string, signal?: AbortSignal, timeoutMs = 12_000, diagnosticScenario: RuntimeRequestScenario = 'resource'): Promise<Uint8Array> {
    return requestBytes({
      baseUrl: '', path: url, signal, timeoutMs, diagnosticScenario, totalAttempts: 1, label: 'Phigros', fetcher: expoFetch as unknown as typeof fetch,
      error: (status) => new ProviderError('network', `Phigros 资源请求失败：${status}`, true),
    });
  }

  async readAsset(release: PhigrosRelease, asset: PhigrosResourceAsset, signal?: AbortSignal, diagnosticScenario: RuntimeRequestScenario = 'metadata'): Promise<Uint8Array> {
    const bytes = await this.bytes(this.assetUrl(release, asset), signal, 12_000, diagnosticScenario);
    await verifyPhigrosResource(bytes, asset);
    aborted(signal);
    return bytes;
  }

  private async fetchRelease(signal: AbortSignal, force: boolean): Promise<PhigrosRelease> {
    const nonce = `${Date.now()}-${++this.sequence}`;
    const current = await requestJson({
      diagnosticScenario: 'release',
      baseUrl: PHIGROS_OSS_BASE, path: `/phigros/latest.json?_check=${nonce}`, schema: CurrentSchema,
      fetcher: expoFetch as unknown as typeof fetch, signal, totalAttempts: 1, label: 'Phigros',
      error: (status) => new ProviderError('network', `Phigros 发布信息请求失败：${status}`, true),
    });
    const revision = JSON.stringify(current);
    const previous = this.peek();
    if (!force && previous?.revision === revision) return previous;
    const candidate = { current, revision, bypass: force ? nonce : undefined, fetchedAt: new Date().toISOString() } as PhigrosRelease;
    const rawManifest = await this.bytes(this.url(current.manifest, candidate), signal, 12_000, 'manifest');
    await verifyResourceBytes(rawManifest, { sha256: current.manifestSha256 }, 'Phigros 清单校验失败');
    candidate.manifest = ManifestSchema.parse(JSON.parse(new TextDecoder().decode(rawManifest)));
    if (candidate.manifest.gameVersion !== current.gameVersion
      || candidate.manifest.resourceVersion !== current.resourceVersion
      || candidate.manifest.generatedAt !== current.publishedAt
      || current.manifest !== `phigros/manifests/${current.manifestSha256}.json`
      || new Set(candidate.manifest.assets.map(asset => asset.path)).size !== candidate.manifest.assets.length
      || candidate.manifest.assets.some(asset => !asset.objectKey.split('/')[2]!.startsWith(`${asset.sha256}.`))) {
      throw new ProviderError('upstream_schema', 'Phigros 发布内容不一致', true);
    }
    const catalogAsset = this.asset(candidate, 'catalog.json');
    const notesAsset = this.asset(candidate, 'metadata/note_counts.tsv');
    if (catalogAsset.objectKey !== current.catalog || notesAsset.objectKey !== current.noteCounts) {
      throw new ProviderError('upstream_schema', 'Phigros 发布路径不一致', true);
    }
    const avatarAsset = candidate.manifest.assets.find((asset) => asset.path === 'metadata/tmp.tsv');
    const [catalog, notes, difficulty, avatars] = await Promise.all([
      this.readAsset(candidate, catalogAsset, signal, 'catalog'),
      this.readAsset(candidate, notesAsset, signal),
      this.readAsset(candidate, this.asset(candidate, 'metadata/difficulty.tsv'), signal, 'difficulty'),
      avatarAsset ? this.readAsset(candidate, avatarAsset, signal) : Promise.resolve(new Uint8Array()),
    ]);
    candidate.catalog = CatalogSchema.parse(JSON.parse(new TextDecoder().decode(catalog)));
    if (candidate.catalog.songCount !== candidate.catalog.songs.length) throw new ProviderError('upstream_schema', 'Phigros 歌曲数量不一致', true);
    candidate.noteCounts = new TextDecoder().decode(notes);
    candidate.difficulty = new TextDecoder().decode(difficulty);
    candidate.avatarAliases = new TextDecoder().decode(avatars);
    aborted(signal);
    return candidate;
  }

  withRelease<T>(action: (release: PhigrosRelease) => Promise<T>, signal?: AbortSignal, check = false): Promise<T> {
    return this.session.withRelease(action, signal, check);
  }

  load(signal?: AbortSignal, check = false): Promise<PhigrosRelease> {
    return this.session.load(signal, check);
  }
}

export const phigrosResources = new PhigrosResourceService();
