import { File, Paths } from 'expo-file-system';

let temporaryImageSequence = 0;
const inFlight = new Map<string, Promise<string | null>>();

function imageMimeType(url: string): string {
  const extension = /\.([a-z0-9]+)(?:[?#]|$)/iu.exec(url)?.[1]?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'svg') return 'image/svg+xml';
  return 'image/png';
}

async function loadTemporaryImageAsDataUri(url: string): Promise<string | null> {
  temporaryImageSequence += 1;
  const file = new File(Paths.cache, `rranker-best-image-session-${Date.now()}-${temporaryImageSequence}.tmp`);
  try {
    await File.downloadFileAsync(url, file, { idempotent: true });
    if (!file.exists || (file.size ?? 0) <= 0) return null;
    return `data:${imageMimeType(url)};base64,${await file.base64()}`;
  } catch {
    return null;
  } finally {
    if (file.exists) file.delete();
  }
}

export function loadRemoteImageAsDataUri(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  const existing = inFlight.get(url);
  if (existing) return existing;
  const pending = loadTemporaryImageAsDataUri(url).finally(() => inFlight.delete(url));
  inFlight.set(url, pending);
  return pending;
}
