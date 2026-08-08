import {
  CHUNITHM_PERSONAL_LEGACY_SCHEMA_VERSION,
  CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
  chunithmPersonalResourceKey,
  emptyChunithmBests,
  type LegacyChunithmPersonalSnapshot,
  type ChunithmPersonalSnapshot,
} from '@/domain/chunithm-personal';
import { ProviderError } from '@/providers/errors';
import type { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import type { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { cacheFirstLoad, staleCached } from '@/services/cache-first';

export class ChunithmPersonalService {
  constructor(
    private readonly provider: ChunithmScoreProvider,
    private readonly repository: SqliteSnapshotRepository,
    private readonly accountId: string,
  ) {}

  async load(): Promise<ChunithmPersonalSnapshot> {
    try {
      const snapshot = await this.provider.getSnapshot();
      await this.repository.saveResource(
        chunithmPersonalResourceKey(this.accountId),
        CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
        snapshot.source.updatedAt,
        snapshot,
      );
      return snapshot;
    } catch (error) {
      if (error instanceof ProviderError && error.code === 'authentication') throw error;
      const cached = await this.repository.getResource<ChunithmPersonalSnapshot>(
        chunithmPersonalResourceKey(this.accountId),
        CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
      );
      const compatible = cached ?? await this.repository.getResource<LegacyChunithmPersonalSnapshot>(
        chunithmPersonalResourceKey(this.accountId),
        CHUNITHM_PERSONAL_LEGACY_SCHEMA_VERSION,
      ).then((legacy) => legacy ? { ...legacy, bests: emptyChunithmBests() } : null);
      if (!compatible) throw error;
      return {
        ...compatible,
        source: {
          ...compatible.source,
          label: '落雪咖啡屋（缓存）',
          isStale: true,
        },
      };
    }
  }

  /**
   * 缓存优先：先返回本地快照渲染首屏，同时后台发网络刷新；
   * 刷新成功（非缓存兜底）后通过 onFresh 回写（供 hook 静默替换查询缓存）。
   * 无本地快照时直接走网络加载（含失败兜底）。
   */
  async loadCacheFirst(onFresh: (fresh: ChunithmPersonalSnapshot) => void): Promise<ChunithmPersonalSnapshot> {
    const key = chunithmPersonalResourceKey(this.accountId);
    return cacheFirstLoad({
      loadCached: () => this.repository.getResource<ChunithmPersonalSnapshot>(
        key,
        CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
      ),
      loadFresh: () => this.load(),
      onFresh,
      markStale: (snapshot) => staleCached(snapshot, { label: '落雪咖啡屋（缓存）' }),
    });
  }
}
