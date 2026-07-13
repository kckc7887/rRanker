import { chartVersionKey } from '@/domain/catalog';
import { buildBest50, calculateChartRating, mapCoverId, minimumAchievementForRating } from '@/domain/rating';
import { fixtureCatalog, fixturePlayer, fixtureRecords, fixtureSource, FIXTURE_CURRENT_VERSION } from '@/fixtures/sanitized';

describe('rating and B50', () => {
  it('matches manually calculated rating boundaries', () => {
    expect(calculateChartRating(13.4, 100.5)).toBe(301);
    expect(calculateChartRating(13.4, 100)).toBe(289);
    expect(calculateChartRating(13.4, 97)).toBe(259);
  });
  it('covers low achievement tiers and reverses at 0.0001%', () => {
    expect(calculateChartRating(10, 5)).toBe(0);
    expect(calculateChartRating(10, 10)).toBe(1);
    const achievement = minimumAchievementForRating(13.4, 301);
    expect(achievement).not.toBeNull();
    expect(calculateChartRating(13.4, achievement!)).toBeGreaterThanOrEqual(301);
    expect(calculateChartRating(13.4, achievement! - 0.0001)).toBeLessThan(301);
    expect(minimumAchievementForRating(1, 999)).toBeNull();
  });
  it('selects exactly B35 and B15 and sums their ratings', () => {
    const best50 = buildBest50(fixturePlayer, fixtureRecords, fixtureCatalog, fixtureSource, fixtureSource.updatedAt);
    expect(best50.b35).toHaveLength(35); expect(best50.b15).toHaveLength(15);
    expect(best50.rating).toBe([...best50.b35, ...best50.b15].reduce((total, record) => total + record.rating, 0));
    expect(best50.b35.every((record) => record.version !== FIXTURE_CURRENT_VERSION)).toBe(true);
    expect(best50.b15.every((record) => record.version === FIXTURE_CURRENT_VERSION)).toBe(true);
    expect(best50.unmatchedRecordCount).toBe(0);
  });
  it('excludes unmatched charts instead of silently assigning them to B35', () => {
    const catalog = { ...fixtureCatalog, chartVersionIndex: {} };
    const best50 = buildBest50(fixturePlayer, fixtureRecords, catalog, fixtureSource);
    expect(best50.b35).toHaveLength(0);
    expect(best50.b15).toHaveLength(0);
    expect(best50.unmatchedRecordCount).toBe(fixtureRecords.length);
  });
  it('keeps historical cover id mapping behavior explicit', () => {
    expect(mapCoverId(110123)).toBe(123); expect(mapCoverId(100123)).toBe(123);
    expect(mapCoverId(10123)).toBe(123); expect(mapCoverId(123)).toBe(123);
  });
  it('handles empty and 700-record inputs without changing B50 limits', () => {
    const empty = buildBest50(fixturePlayer, [], fixtureCatalog, fixtureSource);
    expect(empty.b35).toHaveLength(0); expect(empty.b15).toHaveLength(0); expect(empty.rating).toBe(0);
    const large = Array.from({ length: 700 }, (_, index) => ({
      ...fixtureRecords[index % fixtureRecords.length],
      songId: `large-${index}`,
      version: index % 3 === 0 ? FIXTURE_CURRENT_VERSION : '历史版本',
    }));
    const catalog = {
      ...fixtureCatalog,
      chartVersionIndex: Object.fromEntries(large.map((record) => [
        chartVersionKey(record.songId, record.type, record.levelIndex),
        record.version === FIXTURE_CURRENT_VERSION ? fixtureCatalog.currentVersion.id : 1,
      ])),
    };
    const best50 = buildBest50(fixturePlayer, large, catalog, fixtureSource);
    expect(best50.b35).toHaveLength(35); expect(best50.b15).toHaveLength(15);
  });
});
