/** 账号列表缩略展示元数据（scoreDisplay 等）持久化快照。 */
export const ACCOUNT_THUMBNAIL_SCHEMA_VERSION = 1;

export type AccountThumbnailSnapshot = {
  scoreDisplay?: string;
  avatarUrl?: string | null;
  challengeModeRank?: number | null;
  ratingPossession?: string | null;
};

export function accountThumbnailResourceKey(accountId: string): string {
  return `account-thumbnail:${accountId}`;
}
