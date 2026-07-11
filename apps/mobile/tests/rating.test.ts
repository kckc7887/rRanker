import { buildBest50, calculateChartRating, mapCoverId } from '@/domain/rating';
import { fixturePlayer, fixtureRecords, fixtureSource, FIXTURE_CURRENT_VERSION } from '@/fixtures/sanitized';

describe('rating and B50', () => {
  it('matches manually calculated rating boundaries', () => {
    expect(calculateChartRating(13.4, 100.5)).toBe(301);
    expect(calculateChartRating(13.4, 100)).toBe(289);
    expect(calculateChartRating(13.4, 97)).toBe(259);
  });
  it('selects exactly B35 and B15 and sums their ratings', () => {
    const best50 = buildBest50(fixturePlayer, fixtureRecords, FIXTURE_CURRENT_VERSION, fixtureSource, fixtureSource.updatedAt);
    expect(best50.b35).toHaveLength(35); expect(best50.b15).toHaveLength(15);
    expect(best50.rating).toBe([...best50.b35, ...best50.b15].reduce((total, record) => total + record.rating, 0));
    expect(best50.b35.every((record) => record.version !== FIXTURE_CURRENT_VERSION)).toBe(true);
    expect(best50.b15.every((record) => record.version === FIXTURE_CURRENT_VERSION)).toBe(true);
  });
  it('requires an explicitly verified current version', () => {
    expect(() => buildBest50(fixturePlayer, fixtureRecords, '', fixtureSource)).toThrow(/currentVersion/);
  });
  it('keeps historical cover id mapping behavior explicit', () => {
    expect(mapCoverId(110123)).toBe(123); expect(mapCoverId(100123)).toBe(123);
    expect(mapCoverId(10123)).toBe(123); expect(mapCoverId(123)).toBe(123);
  });
  it('handles empty and 700-record inputs without changing B50 limits', () => {
    const empty = buildBest50(fixturePlayer, [], FIXTURE_CURRENT_VERSION, fixtureSource);
    expect(empty.b35).toHaveLength(0); expect(empty.b15).toHaveLength(0); expect(empty.rating).toBe(0);
    const large = Array.from({ length: 700 }, (_, index) => ({
      ...fixtureRecords[index % fixtureRecords.length],
      songId: `large-${index}`,
      version: index % 3 === 0 ? FIXTURE_CURRENT_VERSION : '历史版本',
    }));
    const best50 = buildBest50(fixturePlayer, large, FIXTURE_CURRENT_VERSION, fixtureSource);
    expect(best50.b35).toHaveLength(35); expect(best50.b15).toHaveLength(15);
  });
});
