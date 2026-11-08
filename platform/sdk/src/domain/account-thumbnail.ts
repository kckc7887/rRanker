import type { AccountDisplayData } from '@rranker/sdk/account';

export const ACCOUNT_THUMBNAIL_SCHEMA_VERSION = 2;

export type AccountThumbnailSnapshot = {
  scoreDisplay?: string;
  avatarUrl?: string | null;
  displayData?: AccountDisplayData;
};

export function accountThumbnailResourceKey(accountId: string): string {
  return `account-thumbnail:${accountId}`;
}
