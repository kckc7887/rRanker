export const PHIGROS_OSS_BASE = 'https://rranker-phigros-data.cn-nb1.rains3.com';

export const LXNS_COLLECTION_ASSET_ROOT = 'https://assets2.lxns.net/maimai';

export function accountAvatarSchemaVersion(accountId: string): number {
  return accountId.startsWith('phigros:') ? 2 : 1;
}

export function isPhigrosAvatarUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === PHIGROS_OSS_BASE && /^\/phigros\/avatars\/[a-f\d]{64}\.png$/.test(url.pathname);
  } catch { return false; }
}

export function buildLxnsIconUrl(iconId: number | null | undefined): string | null {
  if (!Number.isSafeInteger(iconId) || (iconId ?? -1) < 0) return null;
  return `${LXNS_COLLECTION_ASSET_ROOT}/icon/${iconId}.png`;
}

export function accountAvatarResourceKey(accountId: string): string {
  return `account-avatar:${accountId}`;
}
