import {
  ACCOUNT_THUMBNAIL_SCHEMA_VERSION,
  accountThumbnailResourceKey,
  type AccountThumbnailSnapshot,
} from '@/domain/account-thumbnail';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { useSession } from '@/state/session-store';

const repository = new SqliteSnapshotRepository();

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
  await repo.saveResource(
    accountThumbnailResourceKey(accountId),
    ACCOUNT_THUMBNAIL_SCHEMA_VERSION,
    new Date().toISOString(),
    value,
  );
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
    try {
      const thumbnail = await repo.getResource<AccountThumbnailSnapshot>(
        accountThumbnailResourceKey(account.id),
        ACCOUNT_THUMBNAIL_SCHEMA_VERSION,
      );
      if (!thumbnail || signal?.aborted) return;
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
