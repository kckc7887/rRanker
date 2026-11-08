import { accountWriteKey, captureBoundAccountWrites } from '@rranker/sdk/services/account-write-scope';
import { loadItemsBounded } from '@rranker/sdk/services/offset-pagination';
import {
  ACCOUNT_THUMBNAIL_SCHEMA_VERSION,
  accountThumbnailResourceKey,
  type AccountThumbnailSnapshot,
} from '@rranker/sdk/domain/account-thumbnail';
import { SqliteSnapshotRepository } from '@rranker/sdk/storage/sqlite-snapshot-repository';
import { accountIsAvailable, useAccountStore } from '@rranker/sdk/state/account-store';
import { z } from 'zod';
import { isAccountDisplayData, sameDisplayData, type AccountDisplayData } from '@rranker/sdk/account';

const repository = new SqliteSnapshotRepository();

type ThumbnailWrite = {
  revision: string; pending: AccountThumbnailSnapshot; saved: AccountThumbnailSnapshot | null; running?: Promise<void>;
};
const thumbnailWrites = new Map<string, ThumbnailWrite>();
const thumbnailSchema = z.object({
  scoreDisplay: z.string().optional(), avatarUrl: z.string().nullable().optional(),
  displayData: z.custom<AccountDisplayData>(isAccountDisplayData).optional(),
});

export type AccountThumbnailInput = AccountThumbnailSnapshot;

export async function persistBoundAccountThumbnail(
  accountId: string,
  input: AccountThumbnailInput,
  assertEligible?: () => void,
): Promise<void> {
  const assertCurrent = assertEligible ?? captureBoundAccountWrites(accountId);
  assertCurrent();
  const value: AccountThumbnailSnapshot = {
    ...(input.scoreDisplay !== undefined ? { scoreDisplay: input.scoreDisplay } : {}),
    ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    ...(input.displayData !== undefined ? { displayData: input.displayData } : {}),
  };
  if (Object.keys(value).length === 0) return;
  const revision = accountWriteKey(accountId);
  let entry = thumbnailWrites.get(accountId);
  if (!entry || entry.revision !== revision) {
    entry = { revision, pending: {}, saved: null };
    thumbnailWrites.set(accountId, entry);
  }
  const current = entry;
  current.pending = { ...current.pending, ...value };
  if (!current.running) {
    current.running = Promise.resolve().then(async () => {
      try {
        if (current.saved === null) {
          current.saved = await loadBoundAccountThumbnail(accountId) ?? {};
        }
        while (Object.keys(current.pending).length) {
          const next: AccountThumbnailSnapshot = { ...current.saved, ...current.pending };
          current.pending = {};
          assertCurrent();
          if (next.scoreDisplay === current.saved.scoreDisplay && next.avatarUrl === current.saved.avatarUrl
            && sameDisplayData(next.displayData, current.saved.displayData)) continue;
          try {
            await repository.saveResource(accountThumbnailResourceKey(accountId), ACCOUNT_THUMBNAIL_SCHEMA_VERSION,
              new Date().toISOString(), next, assertCurrent);
          } catch (error) {
            current.pending = { ...next, ...current.pending };
            throw error;
          }
          current.saved = next;
        }
      } finally {
        current.running = undefined;
        let eligible = true;
        try { assertCurrent(); } catch { eligible = false; }
        if ((!eligible || !Object.keys(current.pending).length) && thumbnailWrites.get(accountId) === current) {
          thumbnailWrites.delete(accountId);
        }
        if (thumbnailWrites.size > 128) for (const [key, item] of thumbnailWrites) {
          if (thumbnailWrites.size <= 128) break;
          if (!item.running) thumbnailWrites.delete(key);
        }
      }
    });
  }
  await current.running;
}

export function loadBoundAccountThumbnail(accountId: string): Promise<AccountThumbnailSnapshot | null> {
  return repository.getResource(accountThumbnailResourceKey(accountId), ACCOUNT_THUMBNAIL_SCHEMA_VERSION, thumbnailSchema);
}

export async function hydrateBoundAccountThumbnails(
  signal?: AbortSignal,
): Promise<void> {
  const { boundAccounts, updateBoundAccountScore } = useAccountStore.getState();
  await loadItemsBounded({
    items: boundAccounts.filter(accountIsAvailable).map(account => ({ account, assertCurrent: captureBoundAccountWrites(account.id, signal) })),
    concurrency: 4,
    signal,
    load: async ({ account, assertCurrent }) => {
      try {
        assertCurrent();
        const thumbnail = await loadBoundAccountThumbnail(account.id);
        if (!thumbnail) return;
        assertCurrent();
        updateBoundAccountScore(
          account.id,
          thumbnail.scoreDisplay ?? account.scoreDisplay,
          undefined,
          thumbnail.avatarUrl,
          thumbnail.displayData,
        );
      } catch {
      }
    },
  });
}
