import { buildPhigrosAvatarUrl, PHIGROS_OSS_BASE } from '@/domain/account-avatar';

type AvatarAliasMap = {
  fileByKey: Map<string, string>;
};

const aliasCache = new Map<string, AvatarAliasMap>();

function parseAvatarAliasTsv(text: string): AvatarAliasMap {
  const fileByKey = new Map<string, string>();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tab = trimmed.indexOf('\t');
    if (tab < 0) continue;
    const displayName = trimmed.slice(0, tab).trim();
    const ossName = trimmed.slice(tab + 1).trim();
    if (!displayName || !ossName) continue;
    // OSS avatars/ 下文件名与 tmp.tsv 第二列（内部 key）一致，如 Cipher1.png。
    fileByKey.set(ossName, ossName);
    fileByKey.set(displayName, ossName);
  }
  return { fileByKey };
}

async function loadAvatarAliasMap(gameVersion: string): Promise<AvatarAliasMap> {
  const cached = aliasCache.get(gameVersion);
  if (cached) return cached;

  const url = `${PHIGROS_OSS_BASE}/phigros/releases/${gameVersion}/metadata/tmp.tsv`;
  try {
    const res = await fetch(url, { headers: { Accept: 'text/plain' } });
    if (!res.ok) {
      const empty = { fileByKey: new Map<string, string>() };
      aliasCache.set(gameVersion, empty);
      return empty;
    }
    const map = parseAvatarAliasTsv(await res.text());
    aliasCache.set(gameVersion, map);
    return map;
  } catch {
    const empty = { fileByKey: new Map<string, string>() };
    aliasCache.set(gameVersion, empty);
    return empty;
  }
}

/** 可分发 OSS 头像素材清单，供成绩图样式选择使用。 */
export async function loadPhigrosAvatarCatalog(gameVersion: string): Promise<string[]> {
  const map = await loadAvatarAliasMap(gameVersion);
  return [...new Set(map.fileByKey.values())].sort((left, right) => left.localeCompare(right));
}

export function normalizePhigrosAvatarKey(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return '';
  return trimmed.startsWith('avatar.') ? trimmed.slice(7) : trimmed;
}

export async function resolvePhigrosAvatarFileName(
  gameVersion: string,
  avatarKey: string | null | undefined,
): Promise<string | null> {
  const key = normalizePhigrosAvatarKey(avatarKey);
  if (!key) return null;
  const map = await loadAvatarAliasMap(gameVersion);
  return map.fileByKey.get(key) ?? key;
}

export async function resolvePhigrosAvatarUrl(
  gameVersion: string | null | undefined,
  avatarKey: string | null | undefined,
): Promise<string | null> {
  if (!gameVersion) return null;
  const fileName = await resolvePhigrosAvatarFileName(gameVersion, avatarKey);
  return buildPhigrosAvatarUrl(gameVersion, fileName);
}

export function resetPhigrosAvatarAliasCacheForTests(): void {
  aliasCache.clear();
}
