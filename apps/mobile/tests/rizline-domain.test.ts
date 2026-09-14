import { describe, expect, it } from 'vitest';
import { buildRizlineRecords, formatRizlineAccuracy, formatRizlineRks, inferRizlineAh, rizlineRecordStatus, rizlineTrackId,
  selectRizlineBest, sortedRizlineCharts, sortRizlineRecords } from '@/domain/rizline';
import { rizlinePayloadFromSnapshot } from '@/domain/game-data';
import { RizlineCatalogSchema } from '@/providers/rizline-catalog-schema';
import { normalizeLibrarySongId } from '@/domain/user-library';
import { rizlineCatalog, rizlineChart, rizlineSave, rizlineSong } from './fixtures/rizline';

describe('Rizline identities and score semantics', () => {
  it('keeps full official IDs and separates special tracks sharing music', () => {
    expect(rizlineTrackId('track.Song.A.1')).toBe('Song.A.1');
    expect(normalizeLibrarySongId('rizline', '012345')).toBe('012345');
    const catalog = rizlineCatalog();
    catalog.songs.push(rizlineSong({ id: 'Song.A.1', charts: [rizlineChart({ id: 'chart.Song.A.1.SP', songId: 'Song.A.1', difficulty: 'SP' })] }));
    const save = rizlineSave(); save.myBest.push({ trackAssetId: 'track.Song.A.1', difficultyClassName: 'SP', score: 1_000_000, completeRate: 120 });
    save.levelsRks.push({ trackId: 'track.Song.A.1', difficultyClassName: 'SP', rks: 900 });
    const records = buildRizlineRecords(save, catalog);
    expect(records.map(record => record.songId)).toEqual(['Song.A.0', 'Song.A.1']);
    expect(records[1].rks).toBeNull();
    expect(selectRizlineBest(records).ah5).toHaveLength(1);
  });
  it('labels raw completion reaching 120 percent as AP and retains missing data', () => {
    const save = rizlineSave(); save.myBest[0].completeRate = 119.99999;
    expect(buildRizlineRecords(save)[0].ap).toBe(false);
    save.myBest[0].completeRate = 120;
    expect(buildRizlineRecords(save)[0].ap).toBe(true);
    // Numeric example: HiXcc/RizlineSavingTest@88b16f9, RizScoreUploader.py:37 (MIT, Copyright (c) 2026 HiXcc).
    // Source and full license: THIRD_PARTY_NOTICES.md, LICENSES/RizlineSavingTest-MIT.txt.
    const fullCompletion = Math.fround(Math.fround(1.2) * 100);
    expect(fullCompletion).toBe(120.00000762939453);
    save.myBest[0].completeRate = fullCompletion;
    expect(formatRizlineAccuracy(fullCompletion)).toBe('120.0000%');
    const full = buildRizlineRecords(save, rizlineCatalog())[0];
    expect(full).toMatchObject({ achievements: fullCompletion, ap: true, ahStatus: 'inferred' });
    expect(rizlineRecordStatus(full)).toBe('ap');
    const withoutBest = buildRizlineRecords({ ...save, myBest: [] });
    expect(withoutBest[0]).toMatchObject({ achievements: null, score: null, ahStatus: 'unknown' });
    expect(formatRizlineAccuracy(null)).toBe('—'); expect(formatRizlineRks(12)).toBe('12.0000');
  });
  it('does not infer AH solely from all notes occurring during Riztime', () => {
    const chart = rizlineChart({ hit: 100, riztimeHit: 100 });
    expect(inferRizlineAh({ difficulty: 'IN', chart, rks: 1.234, score: 600_000, achievements: 70 })).toBe('incompatible');
    expect(inferRizlineAh({ difficulty: 'IN', chart: { ...chart, constant: null }, rks: 142, score: 600_000, achievements: 70 })).toBe('unknown');
  });
  it('prioritizes AP independently of missing AH evidence and does not upgrade rounded values below 120', () => {
    expect(rizlineRecordStatus({ achievements: 120, ahStatus: 'unknown' })).toBe('ap');
    expect(rizlineRecordStatus({ achievements: 120, ahStatus: 'inferred' })).toBe('ap');
    expect(rizlineRecordStatus({ achievements: 120.00000762939453, ahStatus: 'unknown' })).toBe('ap');
    expect(rizlineRecordStatus({ achievements: 120.00000762939453, ahStatus: 'inferred' })).toBe('ap');
    expect(rizlineRecordStatus({ achievements: Infinity, ahStatus: 'unknown' })).toBe('normal');
    expect(rizlineRecordStatus({ achievements: 119.999999, ahStatus: 'inferred' })).toBe('ah');
    expect(rizlineRecordStatus({ achievements: 119.999999, ahStatus: 'unknown' })).toBe('normal');
    expect(rizlineRecordStatus({ achievements: 119, ahStatus: 'incompatible' })).toBe('normal');
    expect(rizlineRecordStatus()).toBe('normal');
  });
  it('divides contributions by forty without filling missing slots or overriding official RKS', () => {
    const catalog = rizlineCatalog(); const source = { kind: 'rizline-official' as const, label: '官方账号', updatedAt: '2026-09-13', isStale: false };
    const result = rizlinePayloadFromSnapshot({ save: rizlineSave(), source }, { snapshot: catalog, source });
    expect(result.best.ah5).toHaveLength(1); expect(result.best.b35).toHaveLength(0);
    expect(result.best.ah5Contribution).toBe(142.5 / 40);
    expect(result.playerScore.value).toBe(99.1234);
    expect((result.best.ah5Contribution ?? 0) + (result.best.b35Contribution ?? 0)).not.toBe(result.playerScore.value);
  });
  it('selects disjoint highest five and remaining thirty-five with stable ties', () => {
    const record = buildRizlineRecords(rizlineSave(), rizlineCatalog())[0];
    const records = Array.from({ length: 44 }, (_, i) => ({ ...record, chartId: String(i).padStart(2, '0'), rks: 200 - i }));
    const best = selectRizlineBest([...records.reverse(), records[0]]);
    expect(best.ah5.map(row => row.rks)).toEqual([200, 199, 198, 197, 196]);
    expect(best.b35).toHaveLength(35);
    expect(best.b35[0].rks).toBe(195);
    expect(sortRizlineRecords([{ ...record, chartId: 'b' }, { ...record, chartId: 'a' }]).map(row => row.chartId)).toEqual(['a', 'b']);
  });
  it('keeps contributions unknown when the catalog cannot identify AH candidates', () => {
    const records = buildRizlineRecords(rizlineSave());
    const best = selectRizlineBest(records);
    expect(best.hasUnknownCandidates).toBe(true);
    expect(best.ah5Contribution).toBeNull(); expect(best.b35Contribution).toBeNull();
    expect(best.b35).toHaveLength(1);
    expect(records[0].rks).toBe(142.5);
  });
  it('orders difficulties independently of numeric display levels', () => {
    const charts = (['EZ', 'SP', 'IN', 'HD', 'AT'] as const).map(difficulty => rizlineChart({ difficulty }));
    expect(sortedRizlineCharts(charts).map(chart => chart.difficulty)).toEqual(['SP', 'AT', 'IN', 'HD', 'EZ']);
  });
  it('rejects duplicate or cross-song chart references', () => {
    const catalog = rizlineCatalog(); catalog.songs[0].charts[0].songId = 'different';
    expect(RizlineCatalogSchema.safeParse(catalog).success).toBe(false);
    const duplicate = rizlineCatalog(); duplicate.songs.push(duplicate.songs[0]);
    expect(RizlineCatalogSchema.safeParse(duplicate).success).toBe(false);
  });
  it('rejects incomplete publications and inconsistent score metadata', () => {
    const catalog = rizlineCatalog();
    expect(RizlineCatalogSchema.safeParse({ ...catalog, songs: [] }).success).toBe(false);
    catalog.songs[0].updatedAt = '2026-02-30';
    expect(RizlineCatalogSchema.safeParse(catalog).success).toBe(false);
    catalog.songs[0].updatedAt = null;
    catalog.songs[0].charts[0].maxScore = 1;
    expect(RizlineCatalogSchema.safeParse(catalog).success).toBe(false);
  });
});
