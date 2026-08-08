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

/**
 * 同一账号并发 load 共享一次网络请求：缓存优先后台刷新与用户主动同步等待共用同一 promise，
 * 保证同步判定等到的是与 UI 回写同一次读取的真实结果。
 */
const inflightChunithmLoads = new Map<string, Promise<ChunithmPersonalSnapshot>>();

/**
 * 用户主动同步判定用：等待该账号最近一次网络个人成绩读取（缓存优先后台刷新）落定，吞掉失败兜底。
 * 无进行中的读取（已落定或未开始）时立即返回；落定后调用方可读取最终缓存判定真实结果。
 */
export function awaitChunithmFresh(accountId: string): Promise<void> {
  const inflight = inflightChunithmLoads.get(accountId);
  return inflight ? inflight.then(() => undefined, () => undefined) : Promise.resolve();
}

export class ChunithmPersonalService {
  constructor(
    private readonly provider: ChunithmScoreProvider,
    private readonly repository: SqliteSnapshotRepository,
    private readonly accountId: string,
  ) {}

  async load(): Promise<ChunithmPersonalSnapshot> {
    const inflight = inflightChunithmLoads.get(this.accountId);
    if (inflight) return inflight;
    const fresh = this.loadFresh();
    inflightChunithmLoads.set(this.accountId, fresh);
    void fresh.then(() => {
      if (inflightChunithmLoads.get(this.accountId) === fresh) {
        inflightChunithmLoads.delete(this.accountId);
      }
    }, () => {
      if (inflightChunithmLoads.get(this.accountId) === fresh) {
        inflightChunithmLoads.delete(this.accountId);
      }
    });
    return fresh;
  }

  private async loadFresh(): Promise<ChunithmPersonalSnapshot> {
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
