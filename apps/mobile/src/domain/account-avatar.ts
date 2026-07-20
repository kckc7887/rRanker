/** Phigros 静态资源根路径，结构与 demo/phigros-resource-publisher 发布产物一致。 */
export const PHIGROS_OSS_BASE = 'https://rranker-phigros-data.cn-nb1.rains3.com';

/** 落雪咖啡屋舞萌收藏素材根路径。 */
export const LXNS_COLLECTION_ASSET_ROOT = 'https://assets2.lxns.net/maimai';

export function buildPhigrosAvatarUrl(
  gameVersion: string | null | undefined,
  avatarName: string | null | undefined,
): string | null {
  const name = avatarName?.trim();
  if (!gameVersion || !name) return null;
  return `${PHIGROS_OSS_BASE}/phigros/releases/${gameVersion}/avatars/${encodeURIComponent(name)}.png`;
}

export function buildLxnsIconUrl(iconId: number | null | undefined): string | null {
  if (!Number.isSafeInteger(iconId) || (iconId ?? -1) < 0) return null;
  return `${LXNS_COLLECTION_ASSET_ROOT}/icon/${iconId}.png`;
}

export function accountAvatarResourceKey(accountId: string): string {
  return `account-avatar:${accountId}`;
}
