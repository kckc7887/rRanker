import { describe, expect, it } from 'vitest';
import { buildRizlineRecords, inferRizlineAh, rizlineAccuracyRks, rizlineRiztimeThreshold, selectRizlineBest } from '@/domain/rizline';
import { rizlineCatalog, rizlineChart, rizlineSave, rizlineSong } from './fixtures/rizline';

describe('Rizline arithmetic boundaries', () => {
  it('switches Riztime threshold branches at the difficulty-specific five-hit boundary', () => {
    expect([10, 11].map(hit => rizlineRiztimeThreshold(hit, 'EZ'))).toEqual([5, 6]);
    expect([50, 51].map(hit => rizlineRiztimeThreshold(hit, 'HD'))).toEqual([45, 46]);
    expect([250, 251].map(hit => rizlineRiztimeThreshold(hit, 'IN'))).toEqual([245, 246]);
    expect([250, 251].map(hit => rizlineRiztimeThreshold(hit, 'AT'))).toEqual([245, 246]);
    expect(inferRizlineAh({ difficulty: 'IN', chart: rizlineChart({ riztimeHit: 5 }), achievements: 120, score: 1000500, rks: 142.5 })).toBe('unknown');
  });

  it('keeps the accuracy bucket boundary separate from rounded display precision', () => {
    expect(rizlineAccuracyRks(119.99999)).toBe(10.2);
    expect(rizlineAccuracyRks(120)).toBe(10.5);
    expect(rizlineAccuracyRks(59.99999)).toBe(0);
    expect(rizlineAccuracyRks(60)).toBe(1.5);
    expect(rizlineAccuracyRks(116)).toBe(9.9);
  });

  it('accepts float32 storage rounding when score reconstructs the compatible All Hit candidate', () => {
    // Constructed arithmetic case, not a captured player record: C=12.3, h=100, mP=1.
    // Pinned public implementation compares Float32Array values for this fallback.
    const observed = 133.0229949951172;
    const integralCandidate = 100 * (11 * 12.3 + 9.9 - observed) / 12.3;
    expect(Math.abs(integralCandidate - Math.round(integralCandidate))).toBeGreaterThan(1e-6);
    expect(inferRizlineAh({ difficulty: 'IN', chart: rizlineChart({ constant: 12.3, hit: 400, riztimeHit: 105 }),
      achievements: 116, score: 1000100, rks: observed })).toBe('inferred');
  });

  it('keeps a compatible result estimated when score and accuracy may be from other plays', () => {
    const chart = rizlineChart({ difficulty: 'HD', constant: 12, hit: 400, riztimeHit: 111 });
    expect(inferRizlineAh({ difficulty: 'HD', chart, achievements: 116, score: 1010000, rks: 141.3 })).toBe('inferred');
    // An integer-compatible RKS identifies a possible no-Miss play, not which historical play produced it.
  });
});

describe('Rizline best contribution uncertainty', () => {
  const record = buildRizlineRecords(rizlineSave(), rizlineCatalog())[0];
  const five = () => Array.from({ length: 5 }, (_, i) => ({ ...record, chartId: String(i).padStart(2, '0'), rks: 200 - i }));

  it('retains known contributions when unknown rows cannot displace the fifth inferred AH', () => {
    const result = selectRizlineBest([...five(), { ...record, chartId: 'low', rks: 1, ahStatus: 'unknown' }]);
    expect(result.hasUnknownCandidates).toBe(false);
    expect(result.ah5Contribution).toBe((200 + 199 + 198 + 197 + 196) / 40);
    expect(result.b35Contribution).toBe(1 / 40);
  });

  it('uses the same stable tie order when deciding whether an unknown row can displace AH5', () => {
    const laterTie = selectRizlineBest([...five(), { ...record, chartId: '99', rks: 196, ahStatus: 'unknown' }]);
    expect(laterTie.hasUnknownCandidates).toBe(false);
    const earlierTie = selectRizlineBest([...five(), { ...record, chartId: '00a', rks: 196, ahStatus: 'unknown' }]);
    expect(earlierTie.hasUnknownCandidates).toBe(true);
    expect(earlierTie.ah5Contribution).toBeNull(); expect(earlierTie.b35Contribution).toBeNull();
  });

  it('keeps incomplete AH groups unknown even when the unresolved record is low-ranked', () => {
    const result = selectRizlineBest([...five().slice(0, 4), { ...record, chartId: 'low', rks: 1, ahStatus: 'unknown' }]);
    expect(result.hasUnknownCandidates).toBe(true);
  });
});

it('matches real official normal and SP Bamboo identities without dropping the final variant suffix', () => {
  // Metadata copied from the official 2.7.1 resource catalog; player values below are synthetic.
  const normal = rizlineSong({ id: 'Bamboo.rissyuu.0', title: '竹', charts: [rizlineChart({
    id: 'chart.Bamboo.rissyuu.0.IN', songId: 'Bamboo.rissyuu.0', constant: 14.2, level: '14', hit: 1166, riztimeHit: 122, maxScore: 1012200,
  })] });
  const special = rizlineSong({ id: 'Bamboo.rissyuu.1', title: '竹', charts: [rizlineChart({
    id: 'chart.Bamboo.rissyuu.1.SP', songId: 'Bamboo.rissyuu.1', difficulty: 'SP', constant: null, level: '竹', hit: 1048, riztimeHit: null, maxScore: null,
  })] });
  const catalog = { ...rizlineCatalog(), songs: [normal, special] };
  const save = rizlineSave({ myBest: [
    { trackAssetId: 'track.Bamboo.rissyuu.0', difficultyClassName: 'IN', score: 1012200, completeRate: 120 },
    { trackAssetId: 'track.Bamboo.rissyuu.1', difficultyClassName: 'SP', score: 900000, completeRate: 100 },
  ], levelsRks: [{ trackId: 'Bamboo.rissyuu.0', difficultyClassName: 'IN', rks: 166.7 }] });
  const records = buildRizlineRecords(save, catalog);
  expect(records.map(value => [value.songId, value.chartId, value.levelIndex])).toEqual([
    ['Bamboo.rissyuu.0', 'chart.Bamboo.rissyuu.0.IN', 2], ['Bamboo.rissyuu.1', 'chart.Bamboo.rissyuu.1.SP', 4],
  ]);
  expect(records[0].ap).toBe(true); expect(records[1].rks).toBeNull();
});
