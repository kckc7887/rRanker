import type { ScoreSnapshot } from '@/domain/models';
import { FIXTURE_CURRENT_VERSION } from '@/fixtures/sanitized';
import { FixtureProvider } from '@/providers/fixture-provider';
import type { SnapshotRepository } from '@/repositories/snapshot-repository';
import { ScoreService } from '@/services/score-service';

class MemoryRepository implements SnapshotRepository {
  value: ScoreSnapshot | null = null;
  async initialize() {}
  async getLatest() { return this.value; }
  async save(snapshot: ScoreSnapshot) { this.value = structuredClone(snapshot); }
  async clear() { this.value = null; }
}

describe('ScoreService', () => {
  it('stores a valid snapshot after refresh', async () => {
    const repository = new MemoryRepository();
    const snapshot = await new ScoreService(new FixtureProvider(), repository).load(FIXTURE_CURRENT_VERSION);
    expect(snapshot.records).toHaveLength(54); expect(repository.value?.best50.b35).toHaveLength(35);
  });
  it('returns stale cache without overwriting it when upstream fails', async () => {
    const repository = new MemoryRepository();
    await new ScoreService(new FixtureProvider(), repository).load(FIXTURE_CURRENT_VERSION);
    const saved = structuredClone(repository.value);
    const fail = async (): Promise<never> => { throw new Error('network'); };
    const failingProvider = {
      getPlayer: fail, getRecords: fail, getBest50: fail,
      getSongs: async () => [], getChartStats: async () => ({}),
    };
    const cached = await new ScoreService(failingProvider, repository).load(FIXTURE_CURRENT_VERSION);
    expect(cached.source.kind).toBe('cache'); expect(cached.source.isStale).toBe(true);
    expect(repository.value).toEqual(saved);
  });
});
