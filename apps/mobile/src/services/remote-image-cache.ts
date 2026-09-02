import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';
import { Image, type ImageRef, type ImageSource } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { COMPRESSED_IMAGE_CACHE_ROOT } from '@/features/storage-management/fs-storage';

export type RemoteImageCacheProfile = 'thumbnail' | 'artwork';

export type RemoteImageCacheOptions = {
  gameId: string;
  profile: RemoteImageCacheProfile;
};

export const REMOTE_IMAGE_CACHE_BUDGET_BYTES = 256 * 1024 * 1024;
export const REMOTE_IMAGE_CACHE_ACTIVE_SHARE = 0.7;
export const REMOTE_IMAGE_CACHE_VERSION = 2;

const PROFILE_OPTIONS = {
  thumbnail: { maxWidth: 384, maxHeight: 384, compress: 0.65 },
  artwork: { maxWidth: 960, maxHeight: 960, compress: 0.72 },
} as const;
const MANIFEST_FILE_NAME = 'index.json';
const MAX_CONCURRENT_TRANSFORMS = 4;

type CacheEntry = {
  bytes: number;
  gameId: string;
  lastAccess: number;
};

type CacheManifest = {
  version: typeof REMOTE_IMAGE_CACHE_VERSION;
  activeGameId: string | null;
  gameLastUsed: Record<string, number>;
  entries: Record<string, CacheEntry>;
};

type CacheState = {
  activeGameId: string | null;
  gameLastUsed: Map<string, number>;
  entries: Map<string, CacheEntry>;
};

export type CompressedRemoteImageResult = {
  cacheKey: string;
  fileUri: string;
  source: ImageSource | ImageRef;
  release?: () => void;
};

export type RemoteImageCacheUsage = {
  gameId: string;
  bytes: number;
  lastUsed: number;
  active: boolean;
};

export type RemoteImageCacheQuotaInput = {
  gameId: string;
  bytes: number;
  lastUsed: number;
};

export type NormalizedRemoteSource = {
  source: ImageSource;
  stableIdentity: string;
};

let manifestPromise: Promise<CacheState> | null = null;
let manifestWriteTimer: ReturnType<typeof setTimeout> | null = null;
let manifestWriteQueue: Promise<void> = Promise.resolve();
let activeTransforms = 0;
let cacheGeneration = 0;
const gameGenerations = new Map<string, number>();
const transformWaiters: (() => void)[] = [];
const inflight = new Map<string, Promise<CompressedRemoteImageResult | null>>();

export function supportsCompressedRemoteImageCache(): boolean {
  const imageClass = Image as typeof Image | undefined;
  const loadAsync = imageClass?.loadAsync as (typeof Image.loadAsync & { _isMockFunction?: boolean }) | undefined;
  const fileClass = File as typeof File | undefined;
  return typeof loadAsync === 'function'
    && loadAsync._isMockFunction !== true
    && typeof fileClass?.downloadFileAsync === 'function';
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
  options: RemoteImageCacheOptions,
): Promise<string> {
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    `${REMOTE_IMAGE_CACHE_VERSION}|${options.gameId}|${options.profile}|${source.stableIdentity}`,
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
    && typeof entry.gameId === 'string'
    && entry.gameId.length > 0
    && typeof entry.lastAccess === 'number'
    && Number.isFinite(entry.lastAccess);
}

function validLastUsed(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

async function loadManifest(): Promise<CacheState> {
  const root = ensureCacheRoot();
  const manifestFile = new File(root, MANIFEST_FILE_NAME);
  let parsedEntries = new Map<string, CacheEntry>();
  let activeGameId: string | null = null;
  let gameLastUsed = new Map<string, number>();
  if (manifestFile.exists) {
    try {
      const parsed = JSON.parse(await manifestFile.text()) as Partial<CacheManifest>;
      if (parsed.version === REMOTE_IMAGE_CACHE_VERSION && parsed.entries) {
        parsedEntries = new Map(
          Object.entries(parsed.entries).filter((entry): entry is [string, CacheEntry] => validEntry(entry[1])),
        );
        activeGameId = typeof parsed.activeGameId === 'string' ? parsed.activeGameId : null;
        gameLastUsed = new Map(
          Object.entries(parsed.gameLastUsed ?? {}).filter((entry): entry is [string, number] => validLastUsed(entry[1])),
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
    if (!stored) {
      item.delete();
      continue;
    }
    reconciled.set(cacheKey, {
      ...stored,
      bytes: item.size ?? stored.bytes,
    });
  }
  return { activeGameId, gameLastUsed, entries: reconciled };
}

function manifest(): Promise<CacheState> {
  manifestPromise ??= loadManifest();
  return manifestPromise;
}

async function persistManifest(): Promise<void> {
  const state = await manifest();
  const payload: CacheManifest = {
    version: REMOTE_IMAGE_CACHE_VERSION,
    activeGameId: state.activeGameId,
    gameLastUsed: Object.fromEntries(state.gameLastUsed),
    entries: Object.fromEntries(state.entries),
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

function distributeByRecency(
  inputs: readonly RemoteImageCacheQuotaInput[],
  budgetBytes: number,
): Map<string, number> {
  const sorted = [...inputs].sort((left, right) => right.lastUsed - left.lastUsed);
  const weightTotal = (sorted.length * (sorted.length + 1)) / 2;
  return new Map(sorted.map((input, index) => [
    input.gameId,
    weightTotal === 0 ? 0 : budgetBytes * ((sorted.length - index) / weightTotal),
  ]));
}

export function calculateRemoteImageCacheQuotas(
  inputs: readonly RemoteImageCacheQuotaInput[],
  activeGameId: string | null,
  budgetBytes = REMOTE_IMAGE_CACHE_BUDGET_BYTES,
): Map<string, number> {
  const active = activeGameId ? inputs.find((input) => input.gameId === activeGameId) : undefined;
  const tail = inputs.filter((input) => input.gameId !== active?.gameId);
  const quotas = active
    ? new Map<string, number>([
        [active.gameId, budgetBytes * REMOTE_IMAGE_CACHE_ACTIVE_SHARE],
        ...distributeByRecency(tail, budgetBytes * (1 - REMOTE_IMAGE_CACHE_ACTIVE_SHARE)),
      ])
    : distributeByRecency(tail, budgetBytes);

  const unused = inputs.reduce(
    (sum, input) => sum + Math.max(0, (quotas.get(input.gameId) ?? 0) - input.bytes),
    0,
  );
  const borrowers = inputs
    .map((input) => ({
      ...input,
      excess: Math.max(0, input.bytes - (quotas.get(input.gameId) ?? 0)),
    }))
    .filter((input) => input.excess > 0);
  const totalExcess = borrowers.reduce((sum, input) => sum + input.excess, 0);
  if (unused > 0 && totalExcess > 0) {
    for (const borrower of borrowers) {
      quotas.set(
        borrower.gameId,
        (quotas.get(borrower.gameId) ?? 0) + unused * (borrower.excess / totalExcess),
      );
    }
  }
  return quotas;
}

function usageByGame(state: CacheState): RemoteImageCacheQuotaInput[] {
  const bytes = new Map<string, number>();
  for (const entry of state.entries.values()) {
    bytes.set(entry.gameId, (bytes.get(entry.gameId) ?? 0) + entry.bytes);
  }
  if (state.activeGameId && !bytes.has(state.activeGameId)) bytes.set(state.activeGameId, 0);
  return Array.from(bytes, ([gameId, gameBytes]) => ({
    gameId,
    bytes: gameBytes,
    lastUsed: state.gameLastUsed.get(gameId) ?? 0,
  }));
}

export async function pruneRemoteImageCache(
  budgetBytes = REMOTE_IMAGE_CACHE_BUDGET_BYTES,
): Promise<void> {
  const state = await manifest();
  const usages = usageByGame(state);
  const total = usages.reduce((sum, usage) => sum + usage.bytes, 0);
  if (total <= budgetBytes) return;
  const quotas = calculateRemoteImageCacheQuotas(usages, state.activeGameId, budgetBytes);
  const root = ensureCacheRoot();
  for (const usage of usages) {
    let gameBytes = usage.bytes;
    const quota = quotas.get(usage.gameId) ?? 0;
    const candidates = Array.from(state.entries.entries())
      .filter(([, entry]) => entry.gameId === usage.gameId)
      .sort((left, right) => left[1].lastAccess - right[1].lastAccess);
    for (const [cacheKey, entry] of candidates) {
      if (gameBytes <= quota) break;
      const file = entryFile(root, cacheKey);
      if (file.exists) file.delete();
      state.entries.delete(cacheKey);
      gameBytes -= entry.bytes;
    }
  }
  await persistManifest();
}

export async function markRemoteImageCacheGameActive(gameId: string): Promise<void> {
  if (!gameId) return;
  const state = await manifest();
  const now = Date.now();
  state.activeGameId = gameId;
  state.gameLastUsed.set(gameId, now);
  queueManifestWrite();
  await pruneRemoteImageCache();
}

export async function listRemoteImageCacheUsage(): Promise<RemoteImageCacheUsage[]> {
  const state = await manifest();
  return usageByGame(state).map((usage) => ({
    ...usage,
    active: usage.gameId === state.activeGameId,
  }));
}

export async function measureGameRemoteImageCacheBytes(gameId: string): Promise<number> {
  const state = await manifest();
  let total = 0;
  for (const entry of state.entries.values()) {
    if (entry.gameId === gameId) total += entry.bytes;
  }
  return total;
}

export async function clearGameRemoteImageCache(gameId: string): Promise<void> {
  gameGenerations.set(gameId, (gameGenerations.get(gameId) ?? 0) + 1);
  const state = await manifest();
  const root = ensureCacheRoot();
  for (const [cacheKey, entry] of Array.from(state.entries.entries())) {
    if (entry.gameId !== gameId) continue;
    const file = entryFile(root, cacheKey);
    if (file.exists) file.delete();
    state.entries.delete(cacheKey);
  }
  await persistManifest();
}

async function findCached(cacheKey: string): Promise<CompressedRemoteImageResult | null> {
  const state = await manifest();
  const root = ensureCacheRoot();
  const file = entryFile(root, cacheKey);
  if (!file.exists) {
    if (state.entries.delete(cacheKey)) queueManifestWrite();
    return null;
  }
  const stored = state.entries.get(cacheKey);
  if (!stored) return null;
  state.entries.set(cacheKey, {
    ...stored,
    bytes: file.size ?? stored.bytes,
    lastAccess: Date.now(),
  });
  queueManifestWrite();
  return { cacheKey, fileUri: file.uri, source: { uri: file.uri } };
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
  options: RemoteImageCacheOptions,
  cacheKey: string,
  generation: number,
  gameGeneration: number,
): Promise<CompressedRemoteImageResult | null> {
  const profile = PROFILE_OPTIONS[options.profile];
  const root = ensureCacheRoot();
  const sourceFile = new File(root, `${cacheKey}.source.part`);
  let loaded: Awaited<ReturnType<typeof Image.loadAsync>> | null = null;
  let context: ReturnType<typeof ImageManipulator.manipulate> | null = null;
  let rendered: Awaited<ReturnType<ReturnType<typeof ImageManipulator.manipulate>['renderAsync']>> | null = null;
  let part: File | null = null;
  try {
    if (sourceFile.exists) sourceFile.delete();
    await File.downloadFileAsync(normalized.source.uri!, sourceFile, {
      headers: normalized.source.headers,
      idempotent: true,
    });
    loaded = await Image.loadAsync({ uri: sourceFile.uri }, {
      maxWidth: profile.maxWidth,
      maxHeight: profile.maxHeight,
    });
    if (loaded.isAnimated) return null;

    context = ImageManipulator.manipulate(loaded);
    rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.WEBP, compress: profile.compress });
    if (generation !== cacheGeneration || gameGeneration !== (gameGenerations.get(options.gameId) ?? 0)) {
      throw new Error('remote image cache cleared');
    }
    const finalFile = entryFile(root, cacheKey);
    part = new File(root, `${cacheKey}.part`);
    if (part.exists) part.delete();
    new File(saved.uri).move(part);
    if (finalFile.exists) finalFile.delete();
    part.move(finalFile);
    part = null;
    const state = await manifest();
    const now = Date.now();
    state.entries.set(cacheKey, {
      bytes: finalFile.size ?? 0,
      gameId: options.gameId,
      lastAccess: now,
    });
    state.gameLastUsed.set(options.gameId, Math.max(state.gameLastUsed.get(options.gameId) ?? 0, now));
    await pruneRemoteImageCache();
    queueManifestWrite();
    if (!finalFile.exists) return null;
    return { cacheKey, fileUri: finalFile.uri, source: { uri: finalFile.uri } };
  } finally {
    if (sourceFile.exists) sourceFile.delete();
    if (part?.exists) part.delete();
    releaseSharedObject(rendered);
    releaseSharedObject(context);
    releaseSharedObject(loaded);
  }
}

export async function loadCompressedRemoteImage(
  source: unknown,
  options: RemoteImageCacheOptions,
): Promise<CompressedRemoteImageResult | null> {
  const normalized = normalizeRemoteImageSource(source);
  if (!normalized || !options.gameId || !supportsCompressedRemoteImageCache()) return null;
  const cacheKey = await remoteImageCacheKey(normalized, options);
  const cached = await findCached(cacheKey);
  if (cached) return cached;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;
  const generation = cacheGeneration;
  const gameGeneration = gameGenerations.get(options.gameId) ?? 0;
  const pending = withTransformSlot(() => createCompressed(
    normalized,
    options,
    cacheKey,
    generation,
    gameGeneration,
  ));
  inflight.set(cacheKey, pending);
  void pending.finally(() => {
    if (inflight.get(cacheKey) === pending) inflight.delete(cacheKey);
  }).catch(() => undefined);
  return pending;
}

export async function invalidateCompressedRemoteImage(cacheKey: string): Promise<void> {
  const state = await manifest();
  state.entries.delete(cacheKey);
  const file = entryFile(ensureCacheRoot(), cacheKey);
  if (file.exists) file.delete();
  queueManifestWrite();
}

export async function clearCompressedRemoteImageCache(): Promise<void> {
  cacheGeneration += 1;
  gameGenerations.clear();
  if (manifestWriteTimer) clearTimeout(manifestWriteTimer);
  manifestWriteTimer = null;
  await manifestWriteQueue.catch(() => undefined);
  const root = COMPRESSED_IMAGE_CACHE_ROOT();
  if (root.exists) root.delete();
  manifestPromise = null;
}

export function resetRemoteImageCacheForTests(): void {
  cacheGeneration += 1;
  gameGenerations.clear();
  if (manifestWriteTimer) clearTimeout(manifestWriteTimer);
  manifestWriteTimer = null;
  manifestPromise = null;
  manifestWriteQueue = Promise.resolve();
  inflight.clear();
  activeTransforms = 0;
  transformWaiters.splice(0);
}
