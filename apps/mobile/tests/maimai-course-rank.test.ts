import {
  formatMaimaiCourseRank,
  normalizeDivingFishCourseRank,
  normalizeLxnsCourseRank,
  resolveMaimaiCourseRank,
} from '@/domain/maimai-course-rank';

describe('maimai course rank', () => {
  it('normalizes the distinct DivingFish and LXNS identifiers to the game asset index', () => {
    expect(normalizeDivingFishCourseRank(10)).toBe(10);
    expect(normalizeDivingFishCourseRank(11)).toBe(12);
    expect(normalizeDivingFishCourseRank(22)).toBe(23);
    expect(normalizeLxnsCourseRank(23)).toBe(23);
    expect(normalizeLxnsCourseRank(24)).toBeUndefined();
  });

  it('formats regular, true and kaiden ranks for UI presentation', () => {
    expect(formatMaimaiCourseRank(0)).toMatchObject({ label: '初学者', assetIndex: 0 });
    expect(formatMaimaiCourseRank(10)).toMatchObject({ label: '十段', assetIndex: 10 });
    expect(formatMaimaiCourseRank(12)).toMatchObject({ label: '真初段', assetIndex: 12 });
    expect(formatMaimaiCourseRank(22)).toMatchObject({ label: '真皆传', assetIndex: 22 });
    expect(formatMaimaiCourseRank(23)).toMatchObject({ label: '里皆传', assetIndex: 23 });
  });

  it('prefers the normalized game extension and keeps legacy WaterFish snapshots readable', () => {
    expect(resolveMaimaiCourseRank({
      extension: { kind: 'maimai', courseRank: 23 },
      additionalRating: 0,
    })?.label).toBe('里皆传');
    expect(resolveMaimaiCourseRank({ additionalRating: 21 })?.label).toBe('真皆传');
    expect(resolveMaimaiCourseRank({})).toBeNull();
  });
});
