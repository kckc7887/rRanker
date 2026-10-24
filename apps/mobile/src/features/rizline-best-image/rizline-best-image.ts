import { sortRizlineRecords, type RizlineBest, type RizlineRecord, type RizlineSong } from '@/domain/rizline';
import { defaultRizlineFilters, matchesRizlineChart, type RizlineFilters } from '@/domain/rizline-filters';
import { parseBestImageQuantity } from '@/features/best-image/best-image-custom';
import { normalizeNumericInput } from '@/utils/numeric-input';

export type RizlineBestImageType = 'best40' | 'custom';
export type RizlineImageFilters = RizlineFilters & { accuracyMin: string; accuracyMax: string };
export const defaultRizlineImageFilters = (): RizlineImageFilters => ({ ...defaultRizlineFilters(), accuracyMin: '', accuracyMax: '' });
export type RizlineImageSection = { id: string; title: string; records: readonly RizlineRecord[]; rankOffset: number };
export type RizlineImagePage = { id: string; sections: RizlineImageSection[] };

export function validRizlineImageFilters(filters: RizlineImageFilters, quantity: string): boolean {
  if (parseBestImageQuantity(quantity) === null) return false;
  for (const [lower, upper, maximum] of [[filters.constantMin, filters.constantMax, Infinity], [filters.accuracyMin, filters.accuracyMax, 120]] as const) {
    const min = normalizeNumericInput(lower); const max = normalizeNumericInput(upper);
    if ([min, max].some(value => value && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > maximum))) return false;
    if (min && max && Number(min) > Number(max)) return false;
  }
  return true;
}
export function customRizlineRecords(records: readonly RizlineRecord[], songs: readonly RizlineSong[], filters: RizlineImageFilters, quantity: number): RizlineRecord[] {
  const songById = new Map(songs.map(song => [song.id, song]));
  const lower = filters.accuracyMin ? Number(normalizeNumericInput(filters.accuracyMin)) : null;
  const upper = filters.accuracyMax ? Number(normalizeNumericInput(filters.accuracyMax)) : null;
  const normalized = { ...filters, constantMin: normalizeNumericInput(filters.constantMin), constantMax: normalizeNumericInput(filters.constantMax) };
  const rows = sortRizlineRecords(records).filter(record => {
    const song = songById.get(record.songId);
    if (!song || !record.chart || record.achievements === null) return false;
    if (filters.packId !== 'all' && song.packId !== filters.packId) return false;
    const accuracy = Math.min(120, record.achievements);
    return matchesRizlineChart(record.chart, normalized) && (lower === null || accuracy >= lower) && (upper === null || accuracy <= upper);
  }).sort((a, b) => a.rks === null && b.rks === null ? (b.achievements ?? 0) - (a.achievements ?? 0) : 0);
  return quantity === 0 ? rows : rows.slice(0, quantity);
}
export function rizlineImagePages(type: RizlineBestImageType, best: RizlineBest, records: readonly RizlineRecord[]): RizlineImagePage[] {
  if (type === 'best40') return [{ id: 'best40', sections: [
    { id: 'ah5', title: 'AH5', records: best.ah5, rankOffset: 0 },
    { id: 'best35', title: 'Best35', records: best.b35, rankOffset: 0 },
  ] }];
  return Array.from({ length: Math.ceil(records.length / 40) }, (_, index) => ({ id: `custom-${index}`,
    sections: [{ id: 'custom', title: `Best${records.length}`, records: records.slice(index * 40, (index + 1) * 40), rankOffset: index * 40 }] }));
}
