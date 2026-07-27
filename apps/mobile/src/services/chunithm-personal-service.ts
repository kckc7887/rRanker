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
}
