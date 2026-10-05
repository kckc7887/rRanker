import { captureResourceWrites, resourceWriteGeneration } from '@/services/snapshot-cache-utils';
import { loadItemsBounded } from '@/services/offset-pagination';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';
import { hydrateLocalAccountRatings } from '@/services/hydrate-local-account-ratings';
import {
  ACCOUNT_THUMBNAIL_SCHEMA_VERSION,
  accountThumbnailResourceKey,
  type AccountThumbnailSnapshot,
} from '@/domain/account-thumbnail';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { useSession } from '@/state/session-store';
import { z } from 'zod';
import { isPhigrosAvatarUrl } from '@/domain/account-avatar';

const repository = new SqliteSnapshotRepository();

type ThumbnailWrite = {
  revision: string; pending: AccountThumbnailSnapshot; saved: AccountThumbnailSnapshot | null; running?: Promise<void>;
};
const thumbnailWrites = new Map<string, ThumbnailWrite>();
const thumbnailSchema = z.object({
  scoreDisplay: z.string().optional(), avatarUrl: z.string().nullable().optional(),
  challengeModeRank: z.number().finite().nullable().optional(), ratingPossession: z.string().nullable().optional(),
});
function schemaForAccount(accountId: string) {
  return accountId.startsWith('phigros:')
    ? thumbnailSchema.refine(value => !value.avatarUrl || isPhigrosAvatarUrl(value.avatarUrl))
    : thumbnailSchema;
}

export type AccountThumbnailInput = {
  scoreDisplay?: string;
  avatarUrl?: string | null;
  challengeModeRank?: number | null;
  ratingPossession?: string | null;
};

export async function persistBoundAccountThumbnail(
  accountId: string,
  input: AccountThumbnailInput,
): Promise<void> {
  const value: AccountThumbnailSnapshot = {
    ...(input.scoreDisplay !== undefined ? { scoreDisplay: input.scoreDisplay } : {}),
    ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
    ...(input.challengeModeRank !== undefined ? { challengeModeRank: input.challengeModeRank } : {}),
    ...(input.ratingPossession !== undefined ? { ratingPossession: input.ratingPossession } : {}),
  };
  if (Object.keys(value).length === 0) return;
  const gameScope = accountId.split(':')[0];
  const revision = resourceWriteGeneration(gameScope) + ':' + resourceWriteGeneration('account:' + accountId);
  let entry = thumbnailWrites.get(accountId);
  if (!entry || entry.revision !== revision) {
    entry = { revision, pending: {}, saved: null };
    thumbnailWrites.set(accountId, entry);
  }
  const current = entry;
  current.pending = { ...current.pending, ...value };
  if (!current.running) {
    const assertCurrent = captureResourceWrites(gameScope, undefined, accountId);
    current.running = Promise.resolve().then(async () => {
      try {
        if (current.saved === null) {
          current.saved = await repository.getResource(accountThumbnailResourceKey(accountId), ACCOUNT_THUMBNAIL_SCHEMA_VERSION, schemaForAccount(accountId)) ?? {};
        }
        while (Object.keys(current.pending).length) {
          const next: AccountThumbnailSnapshot = { ...current.saved, ...current.pending };
          current.pending = {};
          assertCurrent();
          if (Object.entries(next).every(([key, field]) => current.saved?.[key as keyof AccountThumbnailSnapshot] === field)) continue;
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
        if (thumbnailWrites.size > 128) for (const [key, item] of thumbnailWrites) {
          if (thumbnailWrites.size <= 128) break;
          if (!item.running) thumbnailWrites.delete(key);
        }
      }
    });
  }
  await current.running;
}

export async function hydrateBoundAccountThumbnails(
  signal?: AbortSignal,
): Promise<void> {
  const { boundAccounts, updateBoundAccountScore } = useSession.getState();
  await loadItemsBounded({
    items: boundAccounts,
    concurrency: 4,
    signal,
    load: async (account) => {
      const assertCurrent = captureResourceWrites(account.gameId, signal, account.id);
      try {
        const thumbnail = await repository.getResource(
          accountThumbnailResourceKey(account.id),
          ACCOUNT_THUMBNAIL_SCHEMA_VERSION,
          schemaForAccount(account.id),
        );
        if (!thumbnail) return;
        assertCurrent();
        updateBoundAccountScore(
          account.id,
          thumbnail.scoreDisplay ?? account.scoreDisplay,
          undefined,
          thumbnail.avatarUrl ?? undefined,
          thumbnail.challengeModeRank ?? undefined,
          thumbnail.ratingPossession ?? undefined,
        );
      } catch {
      }
    },
  });
}

const displayHydrations = new WeakMap<AbortSignal, { key: string; promise: Promise<void> }>();
export function hydrateAccountDisplayData(signal: AbortSignal = getForegroundAbortSignal()): Promise<void> {
  const key = useSession.getState().boundAccounts.map((account) => account.id + ':'
    + resourceWriteGeneration(account.gameId) + ':' + resourceWriteGeneration('account:' + account.id)).join('|');
  const existing = displayHydrations.get(signal);
  if (existing?.key === key) return existing.promise;
  const promise = hydrateBoundAccountThumbnails(signal)
    .then(() => hydrateLocalAccountRatings(signal));
  displayHydrations.set(signal, { key, promise });
  void promise.catch(() => { if (displayHydrations.get(signal)?.promise === promise) displayHydrations.delete(signal); });
  return promise;
}
