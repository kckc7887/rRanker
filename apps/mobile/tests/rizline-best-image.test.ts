import { describe, expect, it, vi } from 'vitest';
import { buildRizlineRecords, selectRizlineBest } from '@/domain/rizline';
import { buildMaxedRizlineSnapshot } from '@/providers/maxed-rizline-test-provider';
import { customRizlineRecords, rizlineAvatarCrop, defaultRizlineImageFilters, rizlineImagePages, validRizlineImageFilters } from '@/features/rizline-best-image/rizline-best-image';
import { buildRizlineBestImageHtml } from '@/features/rizline-best-image/build-rizline-best-image-html';
import Storage from '@/storage/key-value-storage';
import { rizlineImagePreferencesStore, DEFAULT_RIZLINE_IMAGE_PREFERENCES } from '@/features/rizline-best-image/rizline-best-image-preferences';
import { rizlineCatalog, rizlineChart, rizlineSong } from './fixtures/rizline';

function data() {
  const catalog = rizlineCatalog();
  catalog.songs = Array.from({ length: 45 }, (_, i) => rizlineSong({ id: `song.${i}`, packId: i < 20 ? 'pack-a' : 'pack-b',
    charts: [rizlineChart({ id: `chart.${i}`, songId: `song.${i}`, constant: 10 + i / 10 })] }));
  const save = buildMaxedRizlineSnapshot(catalog, '测试玩家').save;
  return { catalog, save, records: buildRizlineRecords(save, catalog) };
}
describe('Rizline 成绩图', () => {
  it('uses the existing AH5 and Best35 groups and preserves the player total', () => {
    const { records, save } = data(); const best = selectRizlineBest(records);
    const [page] = rizlineImagePages('best40', best, []);
    expect(page.sections.map(section => section.records)).toEqual([best.ah5, best.b35]);
    const html = buildRizlineBestImageHtml({ width: 1080, page, player: save, signature: '闪亮的 星星', background: null, urls: {}, dataSource: '测试来源' });
    expect(html).toContain(save.totalRks.toFixed(4)); expect(html).toContain('闪亮的 星星');
    expect(html).toContain('测试来源'); expect(html).toContain('mark/AP.svg');
  });
  it('combines difficulty, pack, constant and accuracy filters before taking the highest records', () => {
    const { records, catalog } = data();
    const filters = { ...defaultRizlineImageFilters(), difficulty: 'IN' as const, packId: 'pack-a', constantMin: '11', constantMax: '11.5', accuracyMin: '120', accuracyMax: '120' };
    records.forEach(record => { record.achievements = 120.00000762939453; });
    const result = customRizlineRecords(records, catalog.songs, filters, 2);
    expect(result.map(record => record.chart?.constant)).toEqual([11.5, 11.4]);
    expect(customRizlineRecords(records, catalog.songs, { ...filters, difficulty: 'HD' }, 0)).toHaveLength(0);
  });
  it('keeps SP without RKS after ordinary charts and sorts it by achievement', () => {
    const { records, catalog } = data();
    const special = [100, 118].map((accuracy, i) => {
      const song = rizlineSong({ id: `sp${i}`, charts: [rizlineChart({ id: `sp${i}`, songId: `sp${i}`, difficulty: 'SP', constant: null })] });
      catalog.songs.push(song);
      return { ...records[0], chartId: `sp${i}`, songId: song.id, difficulty: 'SP' as const, rks: null, achievements: accuracy, chart: song.charts[0] };
    });
    const pool = [...special, ...records];
    expect(customRizlineRecords(pool, catalog.songs, defaultRizlineImageFilters(), 0).slice(-2).map(record => record.achievements)).toEqual([118, 100]);
    expect(customRizlineRecords(pool, catalog.songs, { ...defaultRizlineImageFilters(), difficulty: 'SP', constantMin: '0' }, 0)).toEqual([]);
  });
  it('paginates all matching records with continuous ranks and rejects invalid bounds', () => {
    const { records } = data(); const pages = rizlineImagePages('custom', selectRizlineBest(records), records);
    expect(pages.map(page => page.sections[0].records.length)).toEqual([40, 5]);
    expect(pages[1].sections[0].rankOffset).toBe(40);
    expect(rizlineImagePages('custom', selectRizlineBest([]), [])).toEqual([]);
    expect(validRizlineImageFilters(defaultRizlineImageFilters(), '０')).toBe(true);
    for (const quantity of ['-1', '1.5', 'x']) expect(validRizlineImageFilters(defaultRizlineImageFilters(), quantity)).toBe(false);
    expect(validRizlineImageFilters({ ...defaultRizlineImageFilters(), accuracyMin: '120', accuracyMax: '100' }, '40')).toBe(false);
    expect(validRizlineImageFilters({ ...defaultRizlineImageFilters(), accuracyMax: '121' }, '40')).toBe(false);
  });
});

it('restores game avatar anchors with horizontal reversal, top origin and saved zoom', () => {
  expect(rizlineAvatarCrop()).toBeNull();
  expect(rizlineAvatarCrop({ x: 1, y: 1, z: 1 })).toBeNull();
  expect(rizlineAvatarCrop({ x: 1, y: 0, z: 2 })).toEqual({ x: 0, y: 0, width: 0.5, height: 0.5 });
  expect(rizlineAvatarCrop({ x: 0, y: 1, z: 2 })).toEqual({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
  const crop = rizlineAvatarCrop({ x: 0.25, y: 0.5, z: 2.5 })!;
  expect(crop.x).toBeCloseTo(0.45); expect(crop.y).toBeCloseTo(0.3); expect(crop.width).toBeCloseTo(0.4);
});

it('persists appearance per account and resets only unsupported preferences after successful reads', async () => {
  const values = new Map<string, string>();
  const read = vi.spyOn(Storage, 'getItem').mockImplementation(async key => values.get(key) ?? null);
  const write = vi.spyOn(Storage, 'setItem').mockImplementation(async (key, value) => { values.set(key, value); });
  try {
    const choice = { ...DEFAULT_RIZLINE_IMAGE_PREFERENCES, background: { mode: 'random' as const, id: 'illustration.song' } };
    await rizlineImagePreferencesStore.save('b', choice);
    values.set('rranker.rizline-best-image:a', JSON.stringify({ avatar: null }));
    expect(await rizlineImagePreferencesStore.load('a')).toEqual(DEFAULT_RIZLINE_IMAGE_PREFERENCES);
    expect(await rizlineImagePreferencesStore.load('b')).toEqual(choice);
    read.mockRejectedValueOnce(new Error('I/O failure')); write.mockClear();
    await expect(rizlineImagePreferencesStore.load('b')).rejects.toThrow('I/O failure');
    expect(write).not.toHaveBeenCalled();
    expect(await rizlineImagePreferencesStore.load('b')).toEqual(choice);
  } finally { read.mockRestore(); write.mockRestore(); }
});
