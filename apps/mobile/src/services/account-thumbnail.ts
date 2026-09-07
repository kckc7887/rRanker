import { captureResourceWrites, resourceWriteGeneration } from '@/services/snapshot-cache-utils';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';
import { hydrateLocalAccountRatings } from '@/services/hydrate-local-account-ratings';
import {
  ACCOUNT_THUMBNAIL_SCHEMA_VERSION,
  accountThumbnailResourceKey,
  type AccountThumbnailSnapshot,
} from '@/domain/account-thumbnail';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { useSession } from '@/state/session-store';

const repository = new SqliteSnapshotRepository();

type ThumbnailWrite = {
  revision: string; pending: AccountThumbnailSnapshot; saved: AccountThumbnailSnapshot | null; running?: Promise<void>;
};
const thumbnailWrites = new WeakMap<ThumbnailResourceRepository, Map<string, ThumbnailWrite>>();

type ThumbnailResourceRepository = Pick<SqliteSnapshotRepository, 'getResource' | 'saveResource'>;

export type AccountThumbnailInput = {
  scoreDisplay?: string;
  avatarUrl?: string | null;
  challengeModeRank?: number | null;
  ratingPossession?: string | null;
};

/**
 * 数据同步成功后持久化账号列表缩略元数据。
 * 展示字段齐全后再写入；失败静默，不影响同步与渲染。
 */
export async function persistBoundAccountThumbnail(
  accountId: string,
  input: AccountThumbnailInput,
  repo: ThumbnailResourceRepository = repository,
): Promise<void> {
  const value: AccountThumbnailSnapshot = {
    ...(input.scoreDisplay !== undefined ? { scoreDisplay: input.scoreDisplay } : {}),
    ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
    ...(input.challengeModeRank !== undefined ? { challengeModeRank: input.challengeModeRank } : {}),
    ...(input.ratingPossession !== undefined ? { ratingPossession: input.ratingPossession } : {}),
  };
  if (Object.keys(value).length === 0) return;
  let entries = thumbnailWrites.get(repo);
  if (!entries) thumbnailWrites.set(repo, entries = new Map());
  const gameScope = accountId.split(':')[0];
  const revision = resourceWriteGeneration(gameScope) + ':' + resourceWriteGeneration('account:' + accountId);
  let entry = entries.get(accountId);
  if (!entry || entry.revision !== revision) {
    entry = { revision, pending: {}, saved: null };
    entries.set(accountId, entry);
  }
  const current = entry;
  current.pending = { ...current.pending, ...value };
  if (!current.running) {
    const assertCurrent = captureResourceWrites(gameScope, undefined, accountId);
    current.running = Promise.resolve().then(async () => {
      try {
        if (current.saved === null) {
          current.saved = await repo.getResource<AccountThumbnailSnapshot>(accountThumbnailResourceKey(accountId), ACCOUNT_THUMBNAIL_SCHEMA_VERSION) ?? {};
        }
        while (Object.keys(current.pending).length) {
          const next: AccountThumbnailSnapshot = { ...current.saved, ...current.pending };
          current.pending = {};
          assertCurrent();
          if (Object.entries(next).every(([key, field]) => current.saved?.[key as keyof AccountThumbnailSnapshot] === field)) continue;
          try {
            await repo.saveResource(accountThumbnailResourceKey(accountId), ACCOUNT_THUMBNAIL_SCHEMA_VERSION,
              new Date().toISOString(), next, assertCurrent);
          } catch (error) {
            current.pending = { ...next, ...current.pending };
            throw error;
          }
          current.saved = next;
        }
      } finally {
        current.running = undefined;
        // Bound memory even after many deleted/rebound accounts.
        if (entries.size > 128) for (const [key, item] of entries) {
          if (entries.size <= 128) break;
          if (!item.running) entries.delete(key);
        }
      }
    });
  }
  await current.running;
}

/**
 * 启动与账号列表挂载时，从缩略快照补齐所有已绑定账号的展示元数据。
 * 无快照（从未同步过）的账号保持当前值；单个账号读取失败不阻断列表。
 */
export async function hydrateBoundAccountThumbnails(
  repo: ThumbnailResourceRepository = repository,
  signal?: AbortSignal,
): Promise<void> {
  const { boundAccounts, updateBoundAccountScore } = useSession.getState();
  await Promise.all(boundAccounts.map(async (account) => {
    const assertCurrent = captureResourceWrites(account.gameId, signal, account.id);
    try {
      const thumbnail = await repo.getResource<AccountThumbnailSnapshot>(
        accountThumbnailResourceKey(account.id),
        ACCOUNT_THUMBNAIL_SCHEMA_VERSION,
      );
      if (!thumbnail || signal?.aborted) return;
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
      // 单个账号缓存读取失败不阻断列表
    }
  }));
}

const displayHydrations = new WeakMap<AbortSignal, { key: string; promise: Promise<void> }>();
/** Root and account list share one hydration per foreground/account membership/cache generation. */
export function hydrateAccountDisplayData(signal: AbortSignal = getForegroundAbortSignal()): Promise<void> {
  const key = useSession.getState().boundAccounts.map((account) => account.id + ':'
    + resourceWriteGeneration(account.gameId) + ':' + resourceWriteGeneration('account:' + account.id)).join('|');
  const existing = displayHydrations.get(signal);
  if (existing?.key === key) return existing.promise;
  const promise = hydrateBoundAccountThumbnails(undefined, signal)
    .then(() => hydrateLocalAccountRatings(undefined, signal));
  displayHydrations.set(signal, { key, promise });
  void promise.catch(() => { if (displayHydrations.get(signal)?.promise === promise) displayHydrations.delete(signal); });
  return promise;
}
