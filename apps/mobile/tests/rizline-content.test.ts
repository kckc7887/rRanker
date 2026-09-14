import { describe, expect, it } from 'vitest';
import { defaultRizlineFilters, filterRizlineSongs, matchesRizlineChart, rizlinePackOptions } from '@/domain/rizline-filters';
import { presentRizlineChart, presentRizlineScore, presentRizlineSong, rizlineContentAdapter } from '@/features/game-content/adapters/rizline';
import { defaultRizlineRandomChartsPreferences, parseRizlineRandomChartsPreferences, RizlineRandomChartsPreferencesStore } from '@/features/toolbox/rizline-random-charts-preferences';
import { rizlineChart, rizlineRecord, rizlineSong } from './rizline-ui-fixtures';

describe('Rizline catalog and presentation', () => {
  it('applies difficulty and inclusive constant bounds to the same chart', () => {
    const songs = [rizlineSong()];
    const filter = { ...defaultRizlineFilters(), difficulty: 'IN' as const, constantMin: '12', constantMax: '12' };
    expect(filterRizlineSongs(songs, filter)).toHaveLength(1);
    expect(filterRizlineSongs(songs, { ...filter, constantMin: '15', constantMax: '' })).toHaveLength(0);
    expect(matchesRizlineChart(rizlineChart('IN', null), defaultRizlineFilters())).toBe(true);
    expect(matchesRizlineChart(rizlineChart('IN', null), filter)).toBe(false);
  });

  it('keeps independent SP songs and searches song metadata within the selected pack', () => {
    const original = rizlineSong();
    const sp = rizlineSong({ id: 'song.a.sp', title: 'Special Mix', artist: 'Composer', packId: 'extra', packName: '特别曲包', charts: [rizlineChart('SP', null, 'song.a.sp')] });
    expect(filterRizlineSongs([original, sp], { ...defaultRizlineFilters(), difficulty: 'SP' })).toEqual([sp]);
    expect(filterRizlineSongs([original, sp], { ...defaultRizlineFilters(), packId: 'extra' }, 'composer')).toEqual([sp]);
    expect(filterRizlineSongs([original, sp], { ...defaultRizlineFilters(), packId: 'main' }, 'composer')).toEqual([]);
    expect(rizlinePackOptions([original, original, sp]).map((pack) => pack.value)).toEqual(['all', 'main', 'extra']);
  });

  it('preserves stable library indices independently of reversed display order', () => {
    const song = rizlineSong({ charts: [rizlineChart('EZ'), rizlineChart('IN'), rizlineChart('SP')] });
    const normalized = rizlineContentAdapter.normalizeSong(song);
    expect(normalized.charts.map((chart) => chart.label)).toEqual(['SP', 'IN', 'EZ']);
    expect(normalized.charts.map((chart) => chart.libraryRef)).toEqual([
      { type: 'SD', levelIndex: 4 }, { type: 'SD', levelIndex: 2 }, { type: 'SD', levelIndex: 0 },
    ]);
    expect(presentRizlineSong(song).chartBadges.map((badge) => badge.label)).toEqual(['SP', 'IN', 'EZ']);
  });

  it('shows four decimal metrics, AP only from the normalized flag, and missing values as dashes', () => {
    const record = rizlineRecord();
    expect(presentRizlineScore(record)).toMatchObject({ primaryMetric: { text: '119.1235%' }, secondaryMetrics: [{ text: '139.1235' }], grade: undefined });
    expect(presentRizlineScore(rizlineRecord(undefined, { achievements: 119.999999, ap: false })).grade).toBeUndefined();
    expect(presentRizlineScore(rizlineRecord(undefined, { achievements: 120, ap: true })).grade?.label).toBe('AP');
    const empty = presentRizlineChart({ ...rizlineChart('SP', null), hit: null, combo: null, maxScore: null, designer: null });
    expect(empty.primaryMetric.text).toBe('—');
    expect(empty.secondaryMetrics.map((metric) => metric.text)).toEqual(['—', '—']);
    expect(empty.notes[0]?.values.map((note) => note.value)).toEqual(['—', '—', '—']);
    expect(empty.charter).toBe('—');
  });
});

describe('Rizline random chart preferences', () => {
  it('validates persisted choices and ignores unknown schemas', () => {
    expect(parseRizlineRandomChartsPreferences({ version: 3, count: 4 })).toEqual(defaultRizlineRandomChartsPreferences());
    expect(parseRizlineRandomChartsPreferences({ version: 1, difficulty: 'DX', count: 10, packId: '', constantMin: 'NaN' })).toEqual(defaultRizlineRandomChartsPreferences());
    expect(parseRizlineRandomChartsPreferences({ version: 1, difficulty: 'SP', count: 4, packId: 'extra', constantMin: ' 12.3 ' })).toEqual({
      ...defaultRizlineRandomChartsPreferences(), difficulty: 'SP', count: 4, packId: 'extra', constantMin: '12.3',
    });
  });

  it('round-trips through the shared preferences store', async () => {
    const values = new Map<string, string>();
    const storage = { getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => { values.set(key, value); }, removeItem: async (key: string) => { values.delete(key); } };
    const store = new RizlineRandomChartsPreferencesStore(storage);
    const preferences = { ...defaultRizlineRandomChartsPreferences(), difficulty: 'AT' as const, count: 2 as const, constantMin: '14', constantMax: '15.5' };
    await store.save(preferences);
    await expect(store.load()).resolves.toEqual(preferences);
  });
});
