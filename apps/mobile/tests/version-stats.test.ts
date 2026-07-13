import { calculateVersionStats } from '@/domain/version-stats';
import { fixtureCatalog, fixtureRecords } from '@/fixtures/sanitized';

describe('version statistics', () => {
  it('returns null average when no score exists', () => {
    const result = calculateVersionStats(fixtureCatalog.currentVersion.id, fixtureCatalog, []);
    expect(result.averageAchievement).toBeNull();
    expect(result.playedCount).toBe(0);
    expect(result.chartCount).toBeGreaterThan(0);
  });
  it('uses best records without manufacturing duplicate plays', () => {
    const version = fixtureCatalog.currentVersion.id;
    const result = calculateVersionStats(version, fixtureCatalog, fixtureRecords);
    expect(result.playedCount).toBeGreaterThan(0);
    expect(result.averageAchievement).not.toBeNull();
  });
});
