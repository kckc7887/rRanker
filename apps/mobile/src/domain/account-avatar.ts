/** Phigros 静态资源根路径。 */
export const PHIGROS_OSS_BASE = 'https://rranker-phigros-data.cn-nb1.rains3.com';

/** 落雪咖啡屋舞萌收藏素材根路径。 */
export const LXNS_COLLECTION_ASSET_ROOT = 'https://assets2.lxns.net/maimai';

/** 发布对象目录，与 current.manifest 同级；不含清单文件名。 */
export function phigrosReleaseDirectory(manifestPath: string | null | undefined): string {
  const path = manifestPath?.trim();
  if (!path) return '';
  const index = path.lastIndexOf('/');
  return index <= 0 ? '' : path.slice(0, index + 1);
}

export function buildPhigrosAvatarUrl(
  releaseDirectory: string | null | undefined,
  avatarName: string | null | undefined,
  resourceVersion?: string,
): string | null {
  const name = avatarName?.trim();
  const directory = releaseDirectory?.trim();
  if (!directory || !name) return null;
  const prefix = directory.endsWith('/') ? directory : `${directory}/`;
  const url = `${PHIGROS_OSS_BASE}/${prefix}avatars/${encodeURIComponent(name)}.png`;
  return resourceVersion ? `${url}?v=${encodeURIComponent(resourceVersion)}` : url;
}

export function buildLxnsIconUrl(iconId: number | null | undefined): string | null {
  if (!Number.isSafeInteger(iconId) || (iconId ?? -1) < 0) return null;
  return `${LXNS_COLLECTION_ASSET_ROOT}/icon/${iconId}.png`;
}

export function accountAvatarResourceKey(accountId: string): string {
  return `account-avatar:${accountId}`;
}
