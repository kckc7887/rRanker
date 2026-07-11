import type { ScoreSnapshot } from '@/domain/models';
import type { ScoreProvider } from '@/providers/contracts';
import type { SnapshotRepository } from '@/repositories/snapshot-repository';

export class ScoreService {
  constructor(private readonly provider: ScoreProvider, private readonly repository?: SnapshotRepository) {}
  async load(currentVersion: string): Promise<ScoreSnapshot> {
    try {
      const [player, records, best50] = await Promise.all([
        this.provider.getPlayer(), this.provider.getRecords(), this.provider.getBest50(currentVersion),
      ]);
      const snapshot = { player, records, best50, source: best50.source };
      await this.repository?.save(snapshot);
      return snapshot;
    } catch (error) {
      const cached = await this.repository?.getLatest();
      if (cached) return { ...cached, source: { ...cached.source, kind: 'cache', isStale: true } };
      throw error;
    }
  }
}
