import { describe, expect, it } from 'vitest';
import { formatPhiraRating, PhiraChartSchema, PhiraPoolResponseSchema, phiraChartStatus } from '@/domain/phira';
import { filterPhiraBests, phiraRecordXing } from '@/domain/phira-filters';
import { phiraContentAdapter, presentPhiraBestSection, presentPhiraScore } from '@/features/game-content/adapters';

const chart = PhiraChartSchema.parse({
  id: 38294, name: 'Test Song', level: 'Another Lv.?', difficulty: 15.6,
  charter: 'Charter', composer: 'Composer', illustrator: null, uploader: 323528,
  stable: true, ranked: false, rating: null,
});

describe('Phira domain contracts', () => {
  it('accepts missing optional fields and arbitrary difficulty names', () => {
    expect(chart.tags).toEqual([]);
    expect(chart.ratingCount).toBe(0);
    expect(chart.level).toBe('Another Lv.?');
  });

  it('maps the three catalog statuses exactly', () => {
    expect(phiraChartStatus({ stable: true, ranked: true })).toBe('ranked');
    expect(phiraChartStatus({ stable: true, ranked: false })).toBe('special');
    expect(phiraChartStatus({ stable: false, ranked: true })).toBe('unstable');
  });

  it('normalizes one chart to one song with the existing library reference', () => {
    const song = phiraContentAdapter.normalizeSong({ chart, notes: { click: 1, hold: 2, flick: 3, drag: 4 } });
    expect(song.songId).toBe('38294');
    expect(song.charts).toHaveLength(1);
    expect(song.charts[0]).toMatchObject({ chartId: '38294', order: 0, libraryRef: { type: 'SD', levelIndex: 0 } });
    expect(song.charts[0].notes[0].values.map((item) => item.value)).toEqual([1, 2, 3, 4, 10]);
  });

  it('keeps non-pool RKS unavailable instead of calculating it', () => {
    const item = { chart, record: { id: 1, chart: chart.id, score: 1_000_000, accuracy: 1, perfect: 100, good: 0, bad: 0, miss: 0, fullCombo: true, best: true, created: null }, poolRks: null, queriedAt: '2026-08-13T00:00:00.000Z' };
    const presentation = presentPhiraScore(item);
    expect(presentation.secondaryMetrics.find((metric) => metric.key === 'rks')?.text).toBe('—');
    expect(presentation.grade?.label).toBe('Phi');
    expect(presentPhiraBestSection([item]).items[0]?.position).toBe(1);
  });

  it('maps snake-case full combo and record time at the provider boundary', async () => {
    const { PhiraRecordSchema } = await import('@/domain/phira');
    expect(PhiraRecordSchema.parse({ id: 9, chart: 1, score: 999_999, accuracy: .99, full_combo: true, time: '2026-08-13T00:00:00Z' }))
      .toMatchObject({ fullCombo: true, created: '2026-08-13T00:00:00Z' });
  });

  it('formats OpenAPI rating on the game five-point scale', () => {
    expect(formatPhiraRating(0.94493824)).toBe('4.72 / 5');
    expect(formatPhiraRating(null)).toBe('—');
  });

  it('filters constant, ACC, grade and XING without relying on difficulty names', () => {
    const item = { chart, record: { id: 1, chart: chart.id, score: 999_000, accuracy: .999, perfect: 99, good: 1, bad: 0, miss: 0, fullCombo: true, best: true, created: null }, poolRks: null, queriedAt: '2026-08-13T00:00:00.000Z' };
    expect(phiraRecordXing(item)).toBe('good');
    expect(presentPhiraScore(item).achievementRows.flat().find((badge) => badge.key === 'xing'))
      .toMatchObject({ label: 'XING-GOOD', tone: 'xing-good' });
    expect(filterPhiraBests([item], { keyword: 'test', constantMin: '15', constantMax: '16', accuracyMin: '99', accuracyMax: '100', rank: 'fc', xing: 'good', sort: 'score' })).toEqual([item]);
  });

  it('supports a pool shorter than 20 and duplicate chart seeds', () => {
    const pool = PhiraPoolResponseSchema.parse({ bestPool: [{ record: 1, chart: chart.id, rks: 12.3 }], recentPool: [{ record: 2, chart: chart.id, rks: 12.3 }] });
    expect(pool.bestPool).toHaveLength(1);
    expect(new Set([...pool.bestPool, ...pool.recentPool].map((item) => item.chart)).size).toBe(1);
  });
});
