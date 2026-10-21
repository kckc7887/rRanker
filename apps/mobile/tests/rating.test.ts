import { buildBest50, calculateChartRating, mapCoverId, minimumAchievementForRating, ratingTableDescending } from '@/domain/rating';
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
    expect(minimumAchievementForRating(13.4, 301)).toBe(100.5);
    expect(calculateChartRating(13.4, 100.4999)).toBe(298);
    expect(minimumAchievementForRating(1, 999)).toBeNull();
  });
  it('shows the achievement-to-Rating table in descending order', () => {
    const rows = ratingTableDescending(13.4);
    expect(rows[0].achievement).toBeGreaterThan(rows.at(-1)!.achievement);
    expect(rows).toEqual([...rows].sort((left, right) => right.achievement - left.achievement));
  });
  it('selects exactly B35 and B15 and sums their ratings', () => {
    const records = fixtureRecords.map((record, index) => ({ ...record, rating: index + 1 }));
    const best50 = buildBest50(fixturePlayer, records, fixtureCatalog, fixtureSource, fixtureSource.updatedAt);
    expect(best50.b35).toHaveLength(35); expect(best50.b15).toHaveLength(15);
    expect(best50.rating).toBe(1405);
    expect(best50.b35[0]?.songId).toBe('37');
    expect(best50.b35.at(-1)?.songId).toBe('3');
    expect(best50.b15[0]?.songId).toBe('10054');
    expect(best50.b15.at(-1)?.songId).toBe('10040');
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
  it('maps current song identifiers to cover identifiers', () => {
    expect(mapCoverId(110123)).toBe(123); expect(mapCoverId(100123)).toBe(123);
    expect(mapCoverId(10123)).toBe(123); expect(mapCoverId(123)).toBe(123);
    expect(mapCoverId(120227)).toBe(227);
  });
  it('returns an empty B50 with zero rating when no records exist', () => {
    const empty = buildBest50(fixturePlayer, [], fixtureCatalog, fixtureSource);
    expect(empty.b35).toEqual([]);
    expect(empty.b15).toEqual([]);
    expect(empty.rating).toBe(0);
  });
});
