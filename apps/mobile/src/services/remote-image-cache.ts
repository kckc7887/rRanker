import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';
import { Image, type ImageRef, type ImageSource } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { COMPRESSED_IMAGE_CACHE_ROOT } from '@/features/storage-management/fs-storage';

export type RemoteImageCacheProfile = 'thumbnail' | 'artwork';

export const REMOTE_IMAGE_CACHE_BUDGET_BYTES = 256 * 1024 * 1024;
export const REMOTE_IMAGE_CACHE_VERSION = 1;

const PROFILE_OPTIONS = {
  thumbnail: { maxWidth: 512, maxHeight: 512, compress: 0.86 },
  artwork: { maxWidth: 1280, maxHeight: 1280, compress: 0.9 },
} as const;
const MANIFEST_FILE_NAME = 'index.json';
const MAX_CONCURRENT_TRANSFORMS = 4;

type CacheEntry = {
  bytes: number;
  lastAccess: number;
};

type CacheManifest = {
  version: typeof REMOTE_IMAGE_CACHE_VERSION;
  entries: Record<string, CacheEntry>;
};

export type CompressedRemoteImageResult = {
  cacheKey: string;
  source: ImageSource | ImageRef;
  release?: () => void;
};

type NormalizedRemoteSource = {
  source: ImageSource;
  stableIdentity: string;
};

let manifestPromise: Promise<Map<string, CacheEntry>> | null = null;
let manifestWriteTimer: ReturnType<typeof setTimeout> | null = null;
let manifestWriteQueue: Promise<void> = Promise.resolve();
let activeTransforms = 0;
let cacheGeneration = 0;
const transformWaiters: (() => void)[] = [];
const inflight = new Map<string, Promise<CompressedRemoteImageResult | null>>();

export function supportsCompressedRemoteImageCache(): boolean {
  const loadAsync = Image.loadAsync as typeof Image.loadAsync & { _isMockFunction?: boolean };
  return typeof loadAsync === 'function' && loadAsync._isMockFunction !== true;
}

function normalizeHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  return Object.fromEntries(Object.entries(headers).sort(([left], [right]) => left.localeCompare(right)));
}

export function normalizeRemoteImageSource(source: unknown): NormalizedRemoteSource | null {
  if (typeof source === 'string') {
    if (!/^https?:\/\//iu.test(source)) return null;
    return { source: { uri: source }, stableIdentity: source };
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const candidate = source as ImageSource;
  if (typeof candidate.uri !== 'string' || !/^https?:\/\//iu.test(candidate.uri)) return null;
  const headers = normalizeHeaders(candidate.headers);
  return {
    source: { ...candidate, ...(headers ? { headers } : {}) },
    stableIdentity: JSON.stringify({
      uri: candidate.uri,
      cacheKey: candidate.cacheKey,
      headers,
    }),
  };
}

export async function remoteImageCacheKey(
  source: NormalizedRemoteSource,
  profile: RemoteImageCacheProfile,
): Promise<string> {
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    `${REMOTE_IMAGE_CACHE_VERSION}|${profile}|${source.stableIdentity}`,
  );
}

function ensureCacheRoot(): Directory {
  const root = COMPRESSED_IMAGE_CACHE_ROOT();
  if (!root.exists) root.create({ intermediates: true, idempotent: true });
  return root;
}

function entryFile(root: Directory, cacheKey: string): File {
  return new File(root, `${cacheKey}.webp`);
}

function validEntry(value: unknown): value is CacheEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<CacheEntry>;
  return typeof entry.bytes === 'number'
    && Number.isFinite(entry.bytes)
    && entry.bytes >= 0
    && typeof entry.lastAccess === 'number'
    && Number.isFinite(entry.lastAccess);
}

async function loadManifest(): Promise<Map<string, CacheEntry>> {
  const root = ensureCacheRoot();
  const manifestFile = new File(root, MANIFEST_FILE_NAME);
  let parsedEntries = new Map<string, CacheEntry>();
  if (manifestFile.exists) {
    try {
      const parsed = JSON.parse(await manifestFile.text()) as Partial<CacheManifest>;
      if (parsed.version === REMOTE_IMAGE_CACHE_VERSION && parsed.entries) {
        parsedEntries = new Map(
          Object.entries(parsed.entries).filter((entry): entry is [string, CacheEntry] => validEntry(entry[1])),
        );
      }
    } catch {
      parsedEntries.clear();
    }
  }

  const reconciled = new Map<string, CacheEntry>();
  for (const item of root.list()) {
    if (!(item instanceof File)) continue;
    if (item.name.endsWith('.part')) {
      item.delete();
      continue;
    }
    if (!item.name.endsWith('.webp')) continue;
    const cacheKey = item.name.slice(0, -'.webp'.length);
    const stored = parsedEntries.get(cacheKey);
    reconciled.set(cacheKey, stored ?? {
      bytes: item.size ?? 0,
      lastAccess: item.modificationTime ?? Date.now(),
    });
  }
  return reconciled;
}

function manifest(): Promise<Map<string, CacheEntry>> {
  manifestPromise ??= loadManifest();
  return manifestPromise;
}

async function persistManifest(): Promise<void> {
  const entries = await manifest();
  const payload: CacheManifest = {
    version: REMOTE_IMAGE_CACHE_VERSION,
    entries: Object.fromEntries(entries),
  };
  const root = ensureCacheRoot();
  const part = new File(root, `${MANIFEST_FILE_NAME}.part`);
  const finalFile = new File(root, MANIFEST_FILE_NAME);
  if (part.exists) part.delete();
  await part.write(JSON.stringify(payload));
  if (finalFile.exists) finalFile.delete();
  part.move(finalFile);
}

function queueManifestWrite(): void {
  if (manifestWriteTimer) return;
  manifestWriteTimer = setTimeout(() => {
    manifestWriteTimer = null;
    manifestWriteQueue = manifestWriteQueue.then(persistManifest, persistManifest);
  }, 1000);
}

export async function flushRemoteImageCacheManifest(): Promise<void> {
  if (manifestWriteTimer) {
    clearTimeout(manifestWriteTimer);
    manifestWriteTimer = null;
    manifestWriteQueue = manifestWriteQueue.then(persistManifest, persistManifest);
  }
  await manifestWriteQueue;
}

async function withTransformSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeTransforms >= MAX_CONCURRENT_TRANSFORMS) {
    await new Promise<void>((resolve) => transformWaiters.push(resolve));
  }
  activeTransforms += 1;
  try {
    return await task();
  } finally {
    activeTransforms -= 1;
    transformWaiters.shift()?.();
  }
}

export async function pruneRemoteImageCache(
  budgetBytes = REMOTE_IMAGE_CACHE_BUDGET_BYTES,
): Promise<void> {
  const entries = await manifest();
  let total = Array.from(entries.values()).reduce((sum, entry) => sum + entry.bytes, 0);
  if (total <= budgetBytes) return;
  const root = ensureCacheRoot();
  for (const [cacheKey, entry] of Array.from(entries.entries())
    .sort((left, right) => left[1].lastAccess - right[1].lastAccess)) {
    if (total <= budgetBytes) break;
    const file = entryFile(root, cacheKey);
    if (file.exists) file.delete();
    entries.delete(cacheKey);
    total -= entry.bytes;
  }
  await persistManifest();
}

async function findCached(cacheKey: string): Promise<CompressedRemoteImageResult | null> {
  const entries = await manifest();
  const root = ensureCacheRoot();
  const file = entryFile(root, cacheKey);
  if (!file.exists) {
    if (entries.delete(cacheKey)) queueManifestWrite();
    return null;
  }
  entries.set(cacheKey, {
    bytes: file.size ?? entries.get(cacheKey)?.bytes ?? 0,
    lastAccess: Date.now(),
  });
  queueManifestWrite();
  return { cacheKey, source: { uri: file.uri } };
}

function releaseSharedObject(value: { release?: () => void } | null | undefined): void {
  try {
    value?.release?.();
  } catch {
    // 原生对象可能已经随视图卸载释放。
  }
}

async function createCompressed(
  normalized: NormalizedRemoteSource,
  profile: RemoteImageCacheProfile,
  cacheKey: string,
  generation: number,
): Promise<CompressedRemoteImageResult | null> {
  const options = PROFILE_OPTIONS[profile];
  const loaded = await Image.loadAsync(normalized.source, {
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
  });
  if (loaded.isAnimated) {
    releaseSharedObject(loaded);
    return null;
  }

  let context: ReturnType<typeof ImageManipulator.manipulate> | null = null;
  let rendered: Awaited<ReturnType<ReturnType<typeof ImageManipulator.manipulate>['renderAsync']>> | null = null;
  let part: File | null = null;
  try {
    context = ImageManipulator.manipulate(loaded);
    rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.WEBP, compress: options.compress });
    if (generation !== cacheGeneration) throw new Error('remote image cache cleared');
    const root = ensureCacheRoot();
    const finalFile = entryFile(root, cacheKey);
    part = new File(root, `${cacheKey}.part`);
    if (part.exists) part.delete();
    new File(saved.uri).move(part);
    if (finalFile.exists) finalFile.delete();
    part.move(finalFile);
    part = null;
    const entries = await manifest();
    entries.set(cacheKey, { bytes: finalFile.size ?? 0, lastAccess: Date.now() });
    await pruneRemoteImageCache();
    queueManifestWrite();
    return { cacheKey, source: { uri: finalFile.uri } };
  } finally {
    if (part?.exists) part.delete();
    releaseSharedObject(rendered);
    releaseSharedObject(context);
    releaseSharedObject(loaded);
  }
}

export async function loadCompressedRemoteImage(
  source: unknown,
  profile: RemoteImageCacheProfile,
): Promise<CompressedRemoteImageResult | null> {
  const normalized = normalizeRemoteImageSource(source);
  if (!normalized || !supportsCompressedRemoteImageCache()) return null;
  const cacheKey = await remoteImageCacheKey(normalized, profile);
  const cached = await findCached(cacheKey);
  if (cached) return cached;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;
  const generation = cacheGeneration;
  const pending = withTransformSlot(() => createCompressed(normalized, profile, cacheKey, generation));
  inflight.set(cacheKey, pending);
  void pending.finally(() => {
    if (inflight.get(cacheKey) === pending) inflight.delete(cacheKey);
  }).catch(() => undefined);
  return pending;
}

export async function invalidateCompressedRemoteImage(cacheKey: string): Promise<void> {
  const entries = await manifest();
  entries.delete(cacheKey);
  const file = entryFile(ensureCacheRoot(), cacheKey);
  if (file.exists) file.delete();
  queueManifestWrite();
}

export async function clearCompressedRemoteImageCache(): Promise<void> {
  cacheGeneration += 1;
  if (manifestWriteTimer) clearTimeout(manifestWriteTimer);
  manifestWriteTimer = null;
  await manifestWriteQueue.catch(() => undefined);
  const root = COMPRESSED_IMAGE_CACHE_ROOT();
  if (root.exists) root.delete();
  manifestPromise = null;
}

export function resetRemoteImageCacheForTests(): void {
  cacheGeneration += 1;
  if (manifestWriteTimer) clearTimeout(manifestWriteTimer);
  manifestWriteTimer = null;
  manifestPromise = null;
  manifestWriteQueue = Promise.resolve();
  inflight.clear();
  activeTransforms = 0;
  transformWaiters.splice(0);
}
