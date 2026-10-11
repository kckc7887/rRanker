import { loadItemsBounded } from '@/services/offset-pagination';
import { createInflightGuard, captureResourceWrites, resourceWriteGeneration } from '@/services/snapshot-cache-utils';
import { downloadChartResource } from '@/features/chart-download-shared/chart-download-shared';
import { BEST_IMAGE_STAGE_ROOT, clearDirectoryContentsStrict, runSharedCacheFileOperation } from '@/features/storage-management/fs-storage';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
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

export function copyBestImageAsset(
  session: BestImageAssetSession, sourceUri: string, filename: string, signal?: AbortSignal,
): Promise<string> {
  const assertCurrent = captureResourceWrites(session.game, signal);
  return runSharedCacheFileOperation(async () => {
    assertSession(session, assertCurrent);
    const file = new File(session.directory, filename);
    if (!(await getInfoAsync(file.uri)).exists) {
      const slash = filename.lastIndexOf('/');
      const parent = slash < 0 ? session.directory : new Directory(session.directory, filename.slice(0, slash));
      await makeDirectoryAsync(parent.uri, { intermediates: true });
      const temporary = new File(parent, `asset-${++imageSequence}.tmp`);
      try {
        assertSession(session, assertCurrent);
        await copyAsync({ from: sourceUri, to: temporary.uri });
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
  return session.requests.share(resourceWriteGeneration(session.game) + ':' + url, async (requestSignal) => {
    const assertCurrent = captureResourceWrites(session.game, requestSignal);
    assertSession(session, assertGeneration);
    const hash = (await digestStringAsync(CryptoDigestAlgorithm.SHA256, url)).slice(0, 32);
    const extension = /\.([a-z0-9]{2,5})(?:[?#]|$)/iu.exec(url)?.[1]?.toLowerCase() ?? 'png';
    const staged = new File(session.directory, `${hash}.${extension}`);
    const info = await getInfoAsync(staged.uri);
    assertSession(session, assertCurrent);
    if (info.exists && info.size > 0) return staged.uri;
    const name = `rranker-best-image-session-${Date.now()}-${++imageSequence}.tmp`;
    const temporary = new File(Paths.cache, name);
    try {
      await downloadChartResource(Paths.cache, name, url, requestSignal);
      assertSession(session, assertCurrent);
      return await runSharedCacheFileOperation(async () => {
        assertSession(session, assertCurrent);
        await makeDirectoryAsync(session.directory.uri, { intermediates: true });
        assertSession(session, assertCurrent);
        await moveAsync({ from: temporary.uri, to: staged.uri });
        assertSession(session, assertCurrent);
        return staged.uri;
      });
    } finally {
      await deleteAsync(temporary.uri, { idempotent: true });
    }
  }, signal).catch(() => null);
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
