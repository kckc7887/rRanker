import { phigrosResources, type PhigrosRelease } from '@/services/phigros-resources';

let aliasCache: { revision: string; files: Map<string, string> } | undefined;

function avatarAliases(release: PhigrosRelease): Map<string, string> {
  if (aliasCache?.revision === release.revision) return aliasCache.files;
  const files = new Map<string, string>();
  for (const line of release.avatarAliases.split('\n')) {
    const [displayName, fileName] = line.split('\t').map(value => value.trim());
    if (!displayName || !fileName) continue;
    files.set(fileName, fileName);
    files.set(displayName, fileName);
  }
  aliasCache = { revision: release.revision, files };
  return files;
}

function normalizeAvatarKey(raw: string | null | undefined): string {
  const key = raw?.trim() ?? '';
  return key.startsWith('avatar.') ? key.slice(7) : key;
}

export async function loadPhigrosAvatarCatalog(signal?: AbortSignal): Promise<string[]> {
  const release = await phigrosResources.load(signal);
  return [...new Set(avatarAliases(release).values())].sort((left, right) => left.localeCompare(right));
}

export async function resolvePhigrosAvatarUrl(
  avatarKey: string | null | undefined,
  signal?: AbortSignal,
): Promise<string | null> {
  const key = normalizeAvatarKey(avatarKey);
  if (!key) return null;
  try {
    const release = await phigrosResources.load(signal);
    if (signal?.aborted) throw signal.reason;
    const fileName = avatarAliases(release).get(key) ?? key;
    const asset = release.assetsByPath.get(`avatars/${fileName}.png`);
    return asset ? phigrosResources.assetUrl(release, asset) : null;
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}
