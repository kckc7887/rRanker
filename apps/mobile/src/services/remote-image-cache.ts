import { createInflightGuard } from '@/services/snapshot-cache-utils';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';
import { createDownloadResumable, deleteAsync, getInfoAsync, makeDirectoryAsync, moveAsync, readDirectoryAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import { Image, type ImageRef, type ImageSource } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { COMPRESSED_IMAGE_CACHE_ROOT } from '@/features/storage-management/fs-storage';

export type RemoteImageCacheProfile = 'thumbnail' | 'artwork';

export type RemoteImageCacheOptions = {
  gameId: string;
  profile: RemoteImageCacheProfile;
};

export const REMOTE_IMAGE_CACHE_BUDGET_BYTES = 50 * 1024 * 1024;
export const REMOTE_IMAGE_CACHE_ENTRY_BUDGET_BYTES = 10 * 1024;
export const REMOTE_IMAGE_CACHE_ACTIVE_SHARE = 0.7;
export const REMOTE_IMAGE_CACHE_VERSION = 4;

const PROFILE_OPTIONS = {
  thumbnail: [
    { maxSize: 160, compress: 0.5 },
    { maxSize: 144, compress: 0.4 },
    { maxSize: 128, compress: 0.3 },
    { maxSize: 96, compress: 0.2 },
    { maxSize: 64, compress: 0.1 },
  ],
  artwork: [
    { maxSize: 320, compress: 0.5 },
    { maxSize: 256, compress: 0.4 },
    { maxSize: 192, compress: 0.3 },
    { maxSize: 128, compress: 0.2 },
    { maxSize: 96, compress: 0.1 },
    { maxSize: 64, compress: 0.1 },
  ],
} as const;
const MANIFEST_FILE_NAME = 'index.json';
const MAX_CONCURRENT_TRANSFORMS = 1;

type CacheEntry = {
  kind: 'compressed' | 'original';
  fileName: string;
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

export type RemoteImageOriginal = {
  fileUri: string;
  release: () => Promise<void>;
  invalidate: () => Promise<void>;
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
let fileOperations: Promise<unknown> = Promise.resolve();
let activeTransforms = 0;
let cacheGeneration = 0;
const gameGenerations = new Map<string, number>();
type TransformWaiter = {
  resolve: (acquired: boolean) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};
const transformWaiters: TransformWaiter[] = [];
const inflight = createInflightGuard<string>();
let temporarySequence = 0;
type OriginalDownload = {
  cacheKey: string;
  fileUri: string;
  promise: Promise<void>;
  task?: ReturnType<typeof createDownloadResumable>;
  users: number;
  settled: boolean;
  cached: boolean;
  invalidated: boolean;
  held: boolean;
};
const originals = new Map<string, OriginalDownload>();
const activeOriginalFiles = new Map<string, number>();

function retainOriginalFile(uri: string): void {
  activeOriginalFiles.set(uri, (activeOriginalFiles.get(uri) ?? 0) + 1);
}

function releaseOriginalFile(uri: string): void {
  const remaining = (activeOriginalFiles.get(uri) ?? 0) - 1;
  if (remaining > 0) activeOriginalFiles.set(uri, remaining);
  else activeOriginalFiles.delete(uri);
}

export function supportsCompressedRemoteImageCache(): boolean {
  return Platform.OS !== 'web';
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

function runFileOperation<T>(operation: () => Promise<T>): Promise<T> {
  const pending = fileOperations.then(operation, operation);
  fileOperations = pending.catch(() => undefined);
  return pending;
}

async function ensureCacheRoot(): Promise<Directory> {
  const root = COMPRESSED_IMAGE_CACHE_ROOT();
  await makeDirectoryAsync(root.uri, { intermediates: true });
  return root;
}

export async function acquireRemoteImageOriginal(
  source: unknown,
  gameId: string,
  signal?: AbortSignal,
): Promise<RemoteImageOriginal> {
  const normalized = normalizeRemoteImageSource(source);
  if (!normalized || !gameId || signal?.aborted) {
    return Promise.reject(signal?.reason ?? new Error('图片请求无效'));
  }
  const generation = cacheGeneration;
  const gameGeneration = gameGenerations.get(gameId) ?? 0;
  const sourceIdentity = JSON.stringify({ gameId, uri: normalized.source.uri,
    headers: normalized.source.headers, cacheKey: normalized.source.cacheKey });
  const identity = `${sourceIdentity}|${generation}|${gameGeneration}`;
  const generationCurrent = () => generation === cacheGeneration
    && gameGeneration === (gameGenerations.get(gameId) ?? 0);
  let entry = originals.get(identity);
  if (!entry) {
    const fileUri = new File(COMPRESSED_IMAGE_CACHE_ROOT(), `${Date.now()}.${++temporarySequence}.source.part`).uri;
    const download: OriginalDownload = { cacheKey: '', fileUri, users: 0, settled: false, cached: false,
      invalidated: false, held: true, promise: Promise.resolve() };
    retainOriginalFile(fileUri);
    download.promise = (async () => {
      const cacheKey = await digestStringAsync(CryptoDigestAlgorithm.SHA256,
        `${REMOTE_IMAGE_CACHE_VERSION}|original|${sourceIdentity}`);
      download.cacheKey = cacheKey;
      const cached = await runFileOperation(async () => {
        const state = await manifest();
        if (download.users === 0) throw new Error('图片下载已取消');
        if (!generationCurrent()) return false;
        const stored = state.entries.get(cacheKey);
        if (!stored || stored.kind !== 'original') return false;
        const file = entryFile(await ensureCacheRoot(), cacheKey, stored);
        const info = await getInfoAsync(file.uri);
        if (!generationCurrent()) return false;
        if (download.users === 0) throw new Error('图片下载已取消');
        if (!info.exists || info.isDirectory || info.size <= 0) {
          await deleteAsync(file.uri, { idempotent: true });
          state.entries.delete(cacheKey);
          queueManifestWrite();
          return false;
        }
        releaseOriginalFile(download.fileUri);
        download.fileUri = file.uri;
        retainOriginalFile(file.uri);
        download.cached = true;
        return true;
      });
      if (cached) return;
      if (download.users === 0) throw new Error('图片下载已取消');
      download.task = createDownloadResumable(normalized.source.uri!, fileUri, { headers: normalized.source.headers });
      const result = await download.task.downloadAsync();
      if (!result || result.status < 200 || result.status >= 300) {
        throw new Error(result ? `图片下载返回 HTTP ${result.status}` : '图片下载已取消');
      }
      const info = await getInfoAsync(fileUri);
      if (!info.exists || info.isDirectory || info.size <= 0) throw new Error('图片下载内容为空');
      await runFileOperation(async () => {
        if (!generationCurrent() || download.invalidated || download.users === 0) return;
        const state = await manifest();
        const root = await ensureCacheRoot();
        const finalFile = new File(root, `${cacheKey}.${Date.now()}.${++temporarySequence}.source`);
        await moveAsync({ from: fileUri, to: finalFile.uri });
        releaseOriginalFile(download.fileUri);
        download.fileUri = finalFile.uri;
        retainOriginalFile(finalFile.uri);
        if (!generationCurrent() || download.invalidated || download.users === 0) return;
        const now = Date.now();
        state.entries.set(cacheKey, { kind: 'original', fileName: finalFile.name,
          bytes: info.size, gameId, lastAccess: now });
        state.gameLastUsed.set(gameId, Math.max(state.gameLastUsed.get(gameId) ?? 0, now));
        download.cached = true;
        queueManifestWrite();
        await pruneCacheState(state, REMOTE_IMAGE_CACHE_BUDGET_BYTES, root);
      });
    })().finally(() => { download.settled = true; });
    entry = download;
    originals.set(identity, entry);
  }
  const current = entry;
  current.users += 1;
  return new Promise((resolve, reject) => {
    let released = false;
    let cleanup: Promise<void> | undefined;
    const release = (): Promise<void> => {
      if (released) return cleanup ?? Promise.resolve();
      released = true;
      signal?.removeEventListener('abort', cancel);
      current.users -= 1;
      if (current.users === 0) {
        if (!current.settled && !current.cached) {
          current.invalidated = true;
          if (originals.get(identity) === current) originals.delete(identity);
          void current.task?.cancelAsync().catch(() => undefined);
        }
        /** 原生取消可能迟到，下载结束后才删除本次文件。 */
        cleanup = current.promise.catch(() => undefined).then(() => runFileOperation(async () => {
          if (current.users > 0 || !current.held) return;
          if (originals.get(identity) === current) originals.delete(identity);
          current.held = false;
          releaseOriginalFile(current.fileUri);
          if (activeOriginalFiles.has(current.fileUri)) return;
          if (!current.cached || current.invalidated || !generationCurrent()) {
            if (current.cached) {
              const state = await manifest();
              const stored = state.entries.get(current.cacheKey);
              if (stored && entryFile(COMPRESSED_IMAGE_CACHE_ROOT(), current.cacheKey, stored).uri === current.fileUri) {
                state.entries.delete(current.cacheKey);
                queueManifestWrite();
              }
            }
            await deleteAsync(current.fileUri, { idempotent: true });
            return;
          }
          const state = await manifest();
          if (await pruneCacheState(state, REMOTE_IMAGE_CACHE_BUDGET_BYTES, await ensureCacheRoot())) queueManifestWrite();
        }));
      }
      return cleanup ?? Promise.resolve();
    };
    const cancel = () => {
      void release().catch(() => undefined);
      reject(signal?.reason ?? new Error('图片下载已取消'));
    };
    signal?.addEventListener('abort', cancel, { once: true });
    current.promise.then(async () => {
      if (!released) {
        await runFileOperation(async () => {
          if (released || !current.cached || current.invalidated || !generationCurrent()) return;
          const state = await manifest();
          const stored = state.entries.get(current.cacheKey);
          if (!stored || entryFile(COMPRESSED_IMAGE_CACHE_ROOT(), current.cacheKey, stored).uri !== current.fileUri) return;
          const now = Date.now();
          state.entries.set(current.cacheKey, { ...stored, lastAccess: now });
          state.gameLastUsed.set(gameId, Math.max(state.gameLastUsed.get(gameId) ?? 0, now));
          queueManifestWrite();
        });
      }
      if (!released) {
        signal?.removeEventListener('abort', cancel);
        resolve({ fileUri: current.fileUri, release, invalidate: () => {
          current.invalidated = true;
          for (const [key, download] of originals) {
            if (download.fileUri === current.fileUri) { download.invalidated = true; originals.delete(key); }
          }
          return runFileOperation(async () => {
            const state = await manifest();
            const stored = state.entries.get(current.cacheKey);
            if (stored && entryFile(COMPRESSED_IMAGE_CACHE_ROOT(), current.cacheKey, stored).uri === current.fileUri) {
              state.entries.delete(current.cacheKey);
              queueManifestWrite();
            }
            if (!activeOriginalFiles.has(current.fileUri)) await deleteAsync(current.fileUri, { idempotent: true });
          });
        } });
      }
    }).catch(error => {
      void release().catch(() => undefined);
      reject(error);
    });
    if (signal?.aborted) cancel();
  });
}

function entryFile(root: Directory, cacheKey: string, entry?: CacheEntry): File {
  return new File(root, entry?.fileName ?? `${cacheKey}.webp`);
}

function validEntry(value: unknown): value is CacheEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<CacheEntry>;
  return (entry.kind === 'compressed' || entry.kind === 'original')
    && typeof entry.fileName === 'string'
    && /^[a-z0-9_-]+(?:\.[0-9]+)*\.(?:webp|source)$/iu.test(entry.fileName)
    && entry.fileName.endsWith(entry.kind === 'compressed' ? '.webp' : '.source')
    && typeof entry.bytes === 'number'
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
  const root = await ensureCacheRoot();
  const manifestFile = new File(root, MANIFEST_FILE_NAME);
  let parsedEntries = new Map<string, CacheEntry>();
  let activeGameId: string | null = null;
  let gameLastUsed = new Map<string, number>();
  if ((await getInfoAsync(manifestFile.uri)).exists) {
    /** 读取失败时保留缓存文件。 */
    const text = await manifestFile.text();
    try {
      const parsed = JSON.parse(text) as Partial<CacheManifest>;
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
  const storedFiles = new Map([...parsedEntries].map(([key, entry]) => [entry.fileName, { key, entry }]));
  for (const name of await readDirectoryAsync(root.uri)) {
    const item = new File(root, name);
    if (name.endsWith('.part') && !activeOriginalFiles.has(item.uri)) {
      await deleteAsync(item.uri, { idempotent: true });
      continue;
    }
    if (!name.endsWith('.webp') && !name.endsWith('.source')) continue;
    const storedFile = storedFiles.get(name);
    const stored = storedFile?.entry;
    if (!stored) {
      if (!activeOriginalFiles.has(item.uri)) await deleteAsync(item.uri, { idempotent: true });
      continue;
    }
    const info = await getInfoAsync(item.uri);
    if (!info.exists || info.isDirectory) continue;
    const bytes = info.size;
    if ((stored.kind === 'compressed' && bytes > REMOTE_IMAGE_CACHE_ENTRY_BUDGET_BYTES)
      || (stored.kind === 'original' && bytes <= 0)) {
      await deleteAsync(item.uri, { idempotent: true });
      continue;
    }
    reconciled.set(storedFile!.key, { ...stored, bytes });
  }
  const state = { activeGameId, gameLastUsed, entries: reconciled };
  await pruneCacheState(state, REMOTE_IMAGE_CACHE_BUDGET_BYTES, root);
  return state;
}

function manifest(): Promise<CacheState> {
  if (!manifestPromise) {
    const pending = loadManifest().catch(error => {
      if (manifestPromise === pending) manifestPromise = null;
      throw error;
    });
    manifestPromise = pending;
  }
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
  const root = await ensureCacheRoot();
  const part = new File(root, `${MANIFEST_FILE_NAME}.part`);
  const finalFile = new File(root, MANIFEST_FILE_NAME);
  await writeAsStringAsync(part.uri, JSON.stringify(payload));
  await deleteAsync(finalFile.uri, { idempotent: true });
  await moveAsync({ from: part.uri, to: finalFile.uri });
}

function queueManifestWrite(): void {
  if (manifestWriteTimer) return;
  manifestWriteTimer = setTimeout(() => {
    manifestWriteTimer = null;
    manifestWriteQueue = runFileOperation(persistManifest);
    /** 定时写入先接住拒绝；flush 仍返回原失败。 */
    void manifestWriteQueue.catch(() => undefined);
  }, 1000);
}

export async function flushRemoteImageCacheManifest(): Promise<void> {
  if (manifestWriteTimer) {
    clearTimeout(manifestWriteTimer);
    manifestWriteTimer = null;
    manifestWriteQueue = runFileOperation(persistManifest);
  }
  await manifestWriteQueue;
}

function wakeNextTransformWaiter(): void {
  while (transformWaiters.length > 0) {
    const waiter = transformWaiters.shift()!;
    waiter.signal?.removeEventListener('abort', waiter.onAbort!);
    if (waiter.signal?.aborted) {
      waiter.resolve(false);
      continue;
    }
    activeTransforms += 1;
    waiter.resolve(true);
    return;
  }
}

async function acquireTransformSlot(signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return false;
  if (activeTransforms >= MAX_CONCURRENT_TRANSFORMS) {
    const acquired = await new Promise<boolean>((resolve) => {
      const waiter: TransformWaiter = { resolve, signal };
      waiter.onAbort = () => {
        const index = transformWaiters.indexOf(waiter);
        if (index >= 0) transformWaiters.splice(index, 1);
        resolve(false);
      };
      signal?.addEventListener('abort', waiter.onAbort, { once: true });
      transformWaiters.push(waiter);
    });
    return acquired;
  }
  activeTransforms += 1;
  return true;
}

async function withTransformSlot<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T | null> {
  if (!await acquireTransformSlot(signal)) return null;
  try {
    return await task();
  } finally {
    activeTransforms -= 1;
    wakeNextTransformWaiter();
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

async function pruneCacheState(state: CacheState, budgetBytes: number, root: Directory): Promise<boolean> {
  const usages = usageByGame(state);
  const total = usages.reduce((sum, usage) => sum + usage.bytes, 0);
  if (total <= budgetBytes) return false;
  const quotas = calculateRemoteImageCacheQuotas(usages, state.activeGameId, budgetBytes);
  let changed = false;
  for (const usage of usages) {
    let gameBytes = usage.bytes;
    const quota = quotas.get(usage.gameId) ?? 0;
    if (gameBytes <= quota) continue;
    const candidates = Array.from(state.entries.entries())
      .filter(([cacheKey, entry]) => entry.gameId === usage.gameId
        && !activeOriginalFiles.has(entryFile(root, cacheKey, entry).uri))
      .sort((left, right) => left[1].lastAccess - right[1].lastAccess);
    for (const [cacheKey, entry] of candidates) {
      if (gameBytes <= quota) break;
      const file = entryFile(root, cacheKey, entry);
      await deleteAsync(file.uri, { idempotent: true });
      state.entries.delete(cacheKey);
      gameBytes -= entry.bytes;
      changed = true;
    }
  }
  let remaining = [...state.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  if (remaining > budgetBytes) {
    const candidates = [...state.entries.entries()]
      .filter(([cacheKey, entry]) => !activeOriginalFiles.has(entryFile(root, cacheKey, entry).uri))
      .sort((left, right) => left[1].lastAccess - right[1].lastAccess);
    for (const [cacheKey, entry] of candidates) {
      if (remaining <= budgetBytes) break;
      await deleteAsync(entryFile(root, cacheKey, entry).uri, { idempotent: true });
      state.entries.delete(cacheKey);
      remaining -= entry.bytes;
      changed = true;
    }
  }
  return changed;
}

export async function pruneRemoteImageCache(
  budgetBytes = REMOTE_IMAGE_CACHE_BUDGET_BYTES,
): Promise<void> {
  await runFileOperation(async () => {
    const state = await manifest();
    const root = await ensureCacheRoot();
    if (await pruneCacheState(state, budgetBytes, root)) await persistManifest();
  });
}

export async function markRemoteImageCacheGameActive(gameId: string): Promise<void> {
  if (!gameId) return;
  await runFileOperation(async () => {
    const state = await manifest();
    const now = Date.now();
    state.activeGameId = gameId;
    state.gameLastUsed.set(gameId, now);
    queueManifestWrite();
    await pruneCacheState(state, REMOTE_IMAGE_CACHE_BUDGET_BYTES, await ensureCacheRoot());
  });
}

export async function listRemoteImageCacheUsage(): Promise<RemoteImageCacheUsage[]> {
  return runFileOperation(async () => {
    const state = await manifest();
    return usageByGame(state).map((usage) => ({ ...usage, active: usage.gameId === state.activeGameId }));
  });
}

export async function measureGameRemoteImageCacheBytes(gameId: string): Promise<number> {
  return runFileOperation(async () => {
    const state = await manifest();
    let total = 0;
    for (const entry of state.entries.values()) {
      if (entry.gameId === gameId) total += entry.bytes;
    }
    return total;
  });
}

export async function clearGameRemoteImageCache(gameId: string): Promise<void> {
  gameGenerations.set(gameId, (gameGenerations.get(gameId) ?? 0) + 1);
  await runFileOperation(async () => {
    const state = await manifest();
    const root = await ensureCacheRoot();
    for (const [cacheKey, entry] of state.entries) {
      if (entry.gameId !== gameId) continue;
      const file = entryFile(root, cacheKey, entry);
      if (!activeOriginalFiles.has(file.uri)) await deleteAsync(file.uri, { idempotent: true });
      state.entries.delete(cacheKey);
    }
    await persistManifest();
  });
}

async function findCached(cacheKey: string): Promise<CompressedRemoteImageResult | null> {
  const state = await manifest();
  const root = await ensureCacheRoot();
  const stored = state.entries.get(cacheKey);
  if (!stored || stored.kind !== 'compressed') return null;
  const file = entryFile(root, cacheKey, stored);
  const info = await getInfoAsync(file.uri);
  if (!info.exists) {
    if (state.entries.delete(cacheKey)) queueManifestWrite();
    return null;
  }
  const bytes = info.size;
  if (bytes > REMOTE_IMAGE_CACHE_ENTRY_BUDGET_BYTES) {
    await deleteAsync(file.uri, { idempotent: true });
    state.entries.delete(cacheKey);
    queueManifestWrite();
    return null;
  }
  state.entries.set(cacheKey, {
    ...stored,
    bytes,
    lastAccess: Date.now(),
  });
  queueManifestWrite();
  return { cacheKey, fileUri: file.uri, source: { uri: file.uri } };
}

function releaseSharedObject(value: { release?: () => void } | null | undefined): void {
  try {
    value?.release?.();
  } catch {
    /** 原生引用可能已随视图释放。 */
  }
}

async function createCompressed(
  normalized: NormalizedRemoteSource,
  options: RemoteImageCacheOptions,
  cacheKey: string,
  generation: number,
  gameGeneration: number,
  signal?: AbortSignal,
): Promise<CompressedRemoteImageResult | null> {
  const candidates = PROFILE_OPTIONS[options.profile];
  const root = COMPRESSED_IMAGE_CACHE_ROOT();
  const sequence = ++temporarySequence;
  let original: RemoteImageOriginal | null = null;
  let loaded: Awaited<ReturnType<typeof Image.loadAsync>> | null = null;
  let context: ReturnType<typeof ImageManipulator.manipulate> | null = null;
  let rendered: Awaited<ReturnType<ReturnType<typeof ImageManipulator.manipulate>['renderAsync']>> | null = null;
  let partUri: string | null = null;
  let selected: File | null = null;
  const current = () => !signal?.aborted
    && generation === cacheGeneration
    && gameGeneration === (gameGenerations.get(options.gameId) ?? 0);
  try {
    if (!current()) return null;
    original = await acquireRemoteImageOriginal(normalized.source, options.gameId, signal);
    if (!current()) return null;
    const largest = candidates[0].maxSize;
    try {
      loaded = await Image.loadAsync({ uri: original.fileUri }, {
        maxWidth: largest,
        maxHeight: largest,
      });
    } catch (error) {
      await original.invalidate();
      throw error;
    }
    if (loaded.isAnimated) return null;

    for (const candidate of candidates) {
      if (!current()) return null;
      context = ImageManipulator.manipulate(loaded);
      const width = loaded.width ?? candidate.maxSize;
      const height = loaded.height ?? candidate.maxSize;
      const largestEdge = Math.max(width, height);
      if (largestEdge > candidate.maxSize) {
        const scale = candidate.maxSize / largestEdge;
        context.resize({
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
        });
      }
      rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.WEBP, compress: candidate.compress });
      const savedFile = new File(saved.uri);
      const savedInfo = await getInfoAsync(savedFile.uri);
      if (savedInfo.exists && savedInfo.size <= REMOTE_IMAGE_CACHE_ENTRY_BUDGET_BYTES) {
        selected = savedFile;
      } else {
        await deleteAsync(savedFile.uri, { idempotent: true });
      }
      releaseSharedObject(rendered);
      releaseSharedObject(context);
      rendered = null;
      context = null;
      if (selected) break;
    }
    if (!selected || !current()) return null;
    return await runFileOperation(async () => {
      if (!current()) return null;
      const state = await manifest();
      if (!current()) return null;
      const finalFile = entryFile(root, cacheKey);
      partUri = new File(root, `${cacheKey}.${sequence}.part`).uri;
      await moveAsync({ from: selected!.uri, to: partUri });
      selected = null;
      await deleteAsync(finalFile.uri, { idempotent: true });
      await moveAsync({ from: partUri, to: finalFile.uri });
      partUri = null;
      if (!current()) {
        await deleteAsync(finalFile.uri, { idempotent: true });
        return null;
      }
      const info = await getInfoAsync(finalFile.uri);
      if (!info.exists) return null;
      const now = Date.now();
      state.entries.set(cacheKey, { kind: 'compressed', fileName: finalFile.name,
        bytes: info.size, gameId: options.gameId, lastAccess: now });
      state.gameLastUsed.set(options.gameId, Math.max(state.gameLastUsed.get(options.gameId) ?? 0, now));
      await pruneCacheState(state, REMOTE_IMAGE_CACHE_BUDGET_BYTES, root);
      queueManifestWrite();
      if (!current() || !state.entries.has(cacheKey)) return null;
      return { cacheKey, fileUri: finalFile.uri, source: { uri: finalFile.uri } };
    });
  } finally {
    releaseSharedObject(rendered);
    releaseSharedObject(context);
    releaseSharedObject(loaded);
    await original?.release();
    if (partUri) await deleteAsync(partUri, { idempotent: true });
    if (selected) await deleteAsync(selected.uri, { idempotent: true });
  }
}

export async function findCompressedRemoteImage(
  source: unknown,
  options: RemoteImageCacheOptions,
): Promise<CompressedRemoteImageResult | null> {
  const normalized = normalizeRemoteImageSource(source);
  if (!normalized || !options.gameId) return null;
  const cacheKey = await remoteImageCacheKey(normalized, options);
  return runFileOperation(() => findCached(cacheKey));
}

export async function cacheCompressedRemoteImage(
  source: unknown,
  options: RemoteImageCacheOptions,
  signal?: AbortSignal,
): Promise<CompressedRemoteImageResult | null> {
  const normalized = normalizeRemoteImageSource(source);
  if (!normalized || !options.gameId || signal?.aborted || !supportsCompressedRemoteImageCache()) return null;
  const generation = cacheGeneration;
  const gameGeneration = gameGenerations.get(options.gameId) ?? 0;
  const current = () => !signal?.aborted && generation === cacheGeneration
    && gameGeneration === (gameGenerations.get(options.gameId) ?? 0);
  const cacheKey = await remoteImageCacheKey(normalized, options);
  if (!current()) return null;
  const cached = await runFileOperation(() => findCached(cacheKey));
  if (!current()) return null;
  if (cached) return cached;
  try {
    return await inflight.share(`${cacheKey}:${generation}:${gameGeneration}`, (sharedSignal) => withTransformSlot(() => createCompressed(
      normalized, options, cacheKey, generation, gameGeneration, sharedSignal,
    ), sharedSignal), signal);
  } catch (error) {
    if (!current()) return null;
    throw error;
  }
}

export async function invalidateCompressedRemoteImage(cacheKey: string): Promise<void> {
  await runFileOperation(async () => {
    const state = await manifest();
    const stored = state.entries.get(cacheKey);
    if (!stored || stored.kind !== 'compressed') return;
    await deleteAsync(entryFile(await ensureCacheRoot(), cacheKey, stored).uri, { idempotent: true });
    state.entries.delete(cacheKey);
    queueManifestWrite();
  });
}

export async function clearCompressedRemoteImageCache(): Promise<void> {
  cacheGeneration += 1;
  gameGenerations.clear();
  if (manifestWriteTimer) clearTimeout(manifestWriteTimer);
  manifestWriteTimer = null;
  await runFileOperation(async () => {
    const root = COMPRESSED_IMAGE_CACHE_ROOT();
    if (activeOriginalFiles.size === 0) {
      await deleteAsync(root.uri, { idempotent: true });
    } else if ((await getInfoAsync(root.uri)).exists) {
      for (const name of await readDirectoryAsync(root.uri)) {
        const file = new File(root, name);
        if (!activeOriginalFiles.has(file.uri)) await deleteAsync(file.uri, { idempotent: true });
      }
    }
    manifestPromise = null;
  });
}
