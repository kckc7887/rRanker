import type { OsuGameId } from '@/domain/game-mode-family';
import {
  OSU_SNAPSHOT_SCHEMA_VERSION,
  OsuSnapshotSchema,
  normalizeOsuSnapshot,
  osuSnapshotCacheKey,
  type OsuSnapshot,
  type OsuSnapshotData,
} from '@/domain/osu';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { clearResourcesByPrefix, createInflightGuard, makeSnapshot } from '@/services/snapshot-cache-utils';

/** 构造 osu! 缓存快照；source 记录本次拉取时间，供缓存命中时展示来源与过期标。 */
export function makeOsuSnapshot(
  data: OsuSnapshotData,
  updatedAt = new Date().toISOString(),
): OsuSnapshot {
  return makeSnapshot(data, { kind: 'osu', label: 'osu.ppy.sh' }, updatedAt);
}

/** 同一模式同一玩家并发读取共享一次网络请求（总览与最佳页可能并发）。 */
const inflightLoads = createInflightGuard<string>();

export function loadOsuSnapshotFresh(
  provider: OsuScoreProvider,
  gameId: OsuGameId,
  userId: number,
): Promise<OsuSnapshot> {
  return inflightLoads.dedupe(`${gameId}:${userId}`, async () => {
    const [user, bestScores] = await Promise.all([
      provider.getUser(userId, gameId),
      provider.getBestScores(userId, gameId),
    ]);
    return makeOsuSnapshot(normalizeOsuSnapshot(user, bestScores));
  });
}

/** osu! 分模式玩家快照的本地持久化（缓存优先渲染）。 */
export class OsuCache {
  constructor(private readonly repository = new SqliteSnapshotRepository()) {}

  async load(gameId: OsuGameId, userId: number): Promise<OsuSnapshot | null> {
    const raw = await this.repository.getResource<unknown>(
      osuSnapshotCacheKey(gameId, userId),
      OSU_SNAPSHOT_SCHEMA_VERSION,
    );
    if (!raw) return null;
    const parsed = OsuSnapshotSchema.safeParse(raw);
    return parsed.success ? (parsed.data as OsuSnapshot) : null;
  }

  async save(
    gameId: OsuGameId,
    userId: number,
    snapshot: OsuSnapshot,
  ): Promise<void> {
    await this.repository.saveResource(
      osuSnapshotCacheKey(gameId, userId),
      OSU_SNAPSHOT_SCHEMA_VERSION,
      snapshot.source.updatedAt,
      snapshot,
    );
  }

  /** 解绑模式账号时清理该玩家该模式缓存。 */
  async clear(gameId: OsuGameId, userId: number): Promise<void> {
    await clearResourcesByPrefix(this.repository, {
      keys: [osuSnapshotCacheKey(gameId, userId)],
    });
  }
}

/** 测试用：清除 in-flight 去重表。 */
export function resetOsuInflightForTests(): void {
  inflightLoads.resetForTests();
}
