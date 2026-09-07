import { loadItemsBounded } from '@/services/offset-pagination';
import { createInflightGuard, captureResourceWrites, resourceWriteGeneration } from '@/services/snapshot-cache-utils';
import { downloadChartResource } from '@/features/chart-download-shared/chart-download-shared';
import { File, Paths } from 'expo-file-system';

let temporaryImageSequence = 0;
const inFlight = createInflightGuard<string>();

function imageMimeType(url: string): string {
  const extension = /\.([a-z0-9]+)(?:[?#]|$)/iu.exec(url)?.[1]?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'svg') return 'image/svg+xml';
  return 'image/png';
}

async function loadTemporaryImageAsDataUri(url: string, signal: AbortSignal): Promise<string | null> {
  temporaryImageSequence += 1;
  const name = `rranker-best-image-session-${Date.now()}-${temporaryImageSequence}.tmp`;
  const file = new File(Paths.cache, name);
  const assertCurrent = captureResourceWrites('shared', signal);
  try {
    await downloadChartResource(Paths.cache, name, url, signal);
    assertCurrent();
    if (!file.exists || (file.size ?? 0) <= 0) return null;
    const bytes = await file.base64();
    assertCurrent();
    return `data:${imageMimeType(url)};base64,${bytes}`;
  } catch {
    return null;
  } finally {
    if (file.exists) file.delete();
  }
}

export function loadRemoteImageAsDataUri(url: string | null | undefined, signal?: AbortSignal): Promise<string | null> {
  if (!url || signal?.aborted) return Promise.resolve(null);
  const assertGeneration = captureResourceWrites('shared');
  return inFlight.share(resourceWriteGeneration('shared') + ':' + url, (requestSignal) => {
    assertGeneration();
    return loadTemporaryImageAsDataUri(url, requestSignal);
  }, signal).catch(() => null);
}

/** Deduplicate by URL, keep output keys and progress in terms of caller IDs. */
export async function loadImageDataUris(
  ids: readonly string[], urlFor: (id: string) => string | null,
  onProgress?: (completed: number, total: number) => void, signal?: AbortSignal,
  load: (url: string, signal?: AbortSignal) => Promise<string | null> = loadRemoteImageAsDataUri,
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
    load: async ([url, group]) => ({ group, value: await load(url, signal).catch(() => null) }),
    onItem: ({ group, value }) => {
      group.forEach((id) => { output[id] = value; }); completed += group.length;
      onProgress?.(completed, unique.length);
    },
  });
  if (!groups.size && unique.length && !signal?.aborted) onProgress?.(completed, unique.length);
  return output;
}
