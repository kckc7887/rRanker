import { loadItemsBounded } from '@/services/offset-pagination';
import { createInflightGuard, captureResourceWrites, resourceWriteGeneration, subscribeResourceWrites } from '@/services/snapshot-cache-utils';
import { ProviderError } from '@/providers/errors';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import { acquireRemoteImageOriginal } from '@/services/remote-image-cache';
import { BEST_IMAGE_STAGE_ROOT, clearDirectoryContentsStrict, runSharedCacheFileOperation } from '@/features/storage-management/fs-storage';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';
import { copyAsync, deleteAsync, getInfoAsync, makeDirectoryAsync, moveAsync } from 'expo-file-system/legacy';

export type BestImageGame = 'maimai' | 'chunithm' | 'phigros';
export type BestImageAssetSession = {
  directory: Directory;
  game: BestImageGame;
  requests: ReturnType<typeof createInflightGuard<string>>;
  disposed: boolean;
};

let imageSequence = 0;
const activeDirectories = new Set<string>();

export function createBestImageAssetSession(game: BestImageGame): BestImageAssetSession {
  return {
    directory: new Directory(BEST_IMAGE_STAGE_ROOT(game), `session-${Date.now()}-${++imageSequence}`),
    game,
    requests: createInflightGuard<string>(),
    disposed: false,
  };
}

export function retainBestImageAssetSession(session: BestImageAssetSession): void {
  activeDirectories.add(session.directory.uri);
}

export function clearUnusedBestImageAssets(game: BestImageGame): Promise<void> {
  const root = BEST_IMAGE_STAGE_ROOT(game);
  return runSharedCacheFileOperation(() => clearDirectoryContentsStrict(root, {
    skip: (name) => activeDirectories.has(new Directory(root, name).uri),
  }));
}

export function invalidateBestImageAssetSession(session: BestImageAssetSession): void {
  session.disposed = true;
  session.requests.clear();
}

export function disposeBestImageAssetSession(session: BestImageAssetSession): Promise<void> {
  invalidateBestImageAssetSession(session);
  return runSharedCacheFileOperation(async () => {
    try { await deleteAsync(session.directory.uri, { idempotent: true }); }
    finally { activeDirectories.delete(session.directory.uri); }
  });
}

function assertSession(session: BestImageAssetSession, assertCurrent: () => void): void {
  assertCurrent();
  if (session.disposed) throw new Error('成绩图会话已结束');
}

export async function retryBestImagePreparation<T>(
  session: BestImageAssetSession, signal: AbortSignal, prepare: () => Promise<T>,
  onFailure?: (error: unknown) => void,
): Promise<T> {
  const assertCurrent = captureResourceWrites(session.game, signal);
  const delays = [500, 2_000, 10_000, 30_000];
  let failures = 0;
  for (;;) {
    assertSession(session, assertCurrent);
    try { return await prepare(); }
    catch (error) {
      assertSession(session, assertCurrent);
      failures += 1;
      if (failures === 1 || (failures & (failures - 1)) === 0) recordRuntimeError('best-image-prepare', error, false, { phase: 'retry' });
      onFailure?.(error);
      await new Promise<void>((resolve, reject) => {
        const cancel = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', cancel);
          unsubscribe();
          reject(signal.reason ?? new Error('成绩图准备已取消'));
        };
        const unsubscribe = subscribeResourceWrites(session.game, cancel);
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', cancel);
          unsubscribe();
          resolve();
        }, delays[Math.min(failures - 1, delays.length - 1)]);
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
      });
    }
  }
}

export function copyBestImageAsset(
  session: BestImageAssetSession, sourceUri: string, filename: string, signal?: AbortSignal,
): Promise<string> {
  const assertCurrent = captureResourceWrites(session.game, signal);
  return runSharedCacheFileOperation(async () => {
    assertSession(session, assertCurrent);
    const file = new File(session.directory, filename);
    const info = await getInfoAsync(file.uri);
    if (!info.exists || info.size <= 0) {
      const slash = filename.lastIndexOf('/');
      const parent = slash < 0 ? session.directory : new Directory(session.directory, filename.slice(0, slash));
      await makeDirectoryAsync(parent.uri, { intermediates: true });
      const temporary = new File(parent, `asset-${++imageSequence}.tmp`);
      try {
        assertSession(session, assertCurrent);
        await copyAsync({ from: sourceUri, to: temporary.uri });
        assertSession(session, assertCurrent);
        await deleteAsync(file.uri, { idempotent: true });
        assertSession(session, assertCurrent);
        await moveAsync({ from: temporary.uri, to: file.uri });
      } finally { await deleteAsync(temporary.uri, { idempotent: true }); }
    }
    assertSession(session, assertCurrent);
    return file.uri;
  });
}

export function loadRemoteImageFile(
  session: BestImageAssetSession, url: string | null | undefined, signal?: AbortSignal,
): Promise<string | null> {
  if (!url || signal?.aborted || session.disposed) return Promise.resolve(null);
  const assertGeneration = captureResourceWrites(session.game);
  return session.requests.share(resourceWriteGeneration(session.game) + ':' + url, (requestSignal) => retryBestImagePreparation(session, requestSignal, async () => {
    const assertCurrent = captureResourceWrites(session.game, requestSignal);
    assertSession(session, assertGeneration);
    const hash = (await digestStringAsync(CryptoDigestAlgorithm.SHA256, url)).slice(0, 32);
    const extension = /\.([a-z0-9]{2,5})(?:[?#]|$)/iu.exec(url)?.[1]?.toLowerCase() ?? 'png';
    const filename = `${hash}.${extension}`;
    const staged = new File(session.directory, filename);
    const info = await getInfoAsync(staged.uri);
    assertSession(session, assertCurrent);
    if (info.exists && info.size > 0) return staged.uri;
    let original;
    try { original = await acquireRemoteImageOriginal(url, session.game, requestSignal); }
    catch (error) {
      if (error instanceof ProviderError && error.code === 'no_data') return null;
      throw error;
    }
    try {
      assertSession(session, assertCurrent);
      return await copyBestImageAsset(session, original.fileUri, filename, requestSignal);
    } finally {
      await original.release();
    }
  }), signal).catch(() => null);
}

/** 同 URL 只下载一次，结果仍按调用方 ID 返回。 */
export async function loadImageFiles(
  session: BestImageAssetSession, ids: readonly string[], urlFor: (id: string) => string | null,
  onProgress?: (completed: number, total: number) => void, signal?: AbortSignal,
): Promise<Record<string, string | null>> {
  const unique = [...new Set(ids)];
  const output = Object.fromEntries(unique.map((id) => [id, null])) as Record<string, string | null>;
  const groups = new Map<string, string[]>();
  let completed = 0;
  for (const id of unique) {
    const url = urlFor(id);
    if (!url) { completed++; continue; }
    const group = groups.get(url) ?? []; group.push(id); groups.set(url, group);
  }
  if (!signal?.aborted) onProgress?.(0, unique.length);
  await loadItemsBounded({ items: [...groups], concurrency: 4, signal,
    load: async ([url, group]) => ({ group, value: await loadRemoteImageFile(session, url, signal) }),
    onItem: ({ group, value }) => {
      group.forEach((id) => { output[id] = value; }); completed += group.length;
      onProgress?.(completed, unique.length);
    },
  });
  if (!groups.size && unique.length && !signal?.aborted) onProgress?.(completed, unique.length);
  return output;
}
