import type { ChartType, Difficulty, Song } from '@/domain/models';
import { toHiragana, toRomaji } from 'wanakana';

export interface SongSearchFilters {
  keyword: string;
  types: ChartType[];
  difficulties: Difficulty[];
  constantMin?: number;
  constantMax?: number;
  songVersionIds: number[];
  chartVersionIds: number[];
}

export interface SearchDocument { text: string; compact: string }
export interface SongSearchEntry extends SearchDocument { song: Song }

export const EMPTY_SONG_FILTERS: SongSearchFilters = {
  keyword: '', types: [], difficulties: [], songVersionIds: [], chartVersionIds: [],
};

/** Hepburn ↔ Kunrei/Nihon 等同假名拼写；按长度优先替换。 */
const ROMAJI_MORA_ALIASES: readonly (readonly [string, string])[] = [
  ['tsu', 'tu'],
  ['shi', 'si'],
  ['chi', 'ti'],
  ['fu', 'hu'],
  ['shu', 'syu'],
  ['sho', 'syo'],
  ['sha', 'sya'],
  ['chu', 'tyu'],
  ['cho', 'tyo'],
  ['cha', 'tya'],
  ['dzu', 'du'],
  ['ju', 'zyu'],
  ['ju', 'jyu'],
  ['jo', 'zyo'],
  ['jo', 'jyo'],
  ['ja', 'zya'],
  ['ja', 'jya'],
  ['ji', 'zi'],
  ['zu', 'du'],
];

const MAX_ROMAJI_ALIAS_VARIANTS = 24;

export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim();
}

export function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** づ/ぢ 与 ず/じ 在检索中视为同音。 */
export function canonicalizeSearchKana(value: string): string {
  return value.replace(/\u3065/g, '\u305a').replace(/\u3062/g, '\u3058');
}

function uniqueSearchVariants(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

/** 生成同一假名下的多种罗马音拼写变体（有上限，避免长词组合爆炸）。 */
export function expandRomajiAliases(romaji: string): string[] {
  const normalized = normalizeSearchText(romaji);
  if (!normalized) return [];
  const variants = new Set<string>([normalized]);
  const queue = [normalized];
  while (queue.length > 0 && variants.size < MAX_ROMAJI_ALIAS_VARIANTS) {
    const current = queue.shift()!;
    for (const [left, right] of ROMAJI_MORA_ALIASES) {
      for (const [from, to] of [[left, right], [right, left]] as const) {
        let index = current.indexOf(from);
        while (index >= 0 && variants.size < MAX_ROMAJI_ALIAS_VARIANTS) {
          const next = `${current.slice(0, index)}${to}${current.slice(index + from.length)}`;
          if (!variants.has(next)) {
            variants.add(next);
            queue.push(next);
          }
          index = current.indexOf(from, index + from.length);
        }
      }
    }
  }
  return [...variants];
}

function documentVariants(value: string): string[] {
  const source = normalizeSearchText(value);
  if (!source) return [];
  const hiragana = canonicalizeSearchKana(normalizeSearchText(toHiragana(source)));
  const romaji = normalizeSearchText(toRomaji(source));
  const romajiFromKana = hiragana ? normalizeSearchText(toRomaji(hiragana)) : '';
  // 索引侧只存源文 / 假名 / Hepburn，避免长曲名罗马音别名组合爆炸。
  return uniqueSearchVariants([source, hiragana, romaji, romajiFromKana]);
}

function keywordVariants(keyword: string): string[] {
  const source = normalizeSearchText(keyword);
  if (!source) return [];
  const hiragana = canonicalizeSearchKana(normalizeSearchText(toHiragana(source)));
  const romaji = normalizeSearchText(toRomaji(source));
  const romajiFromKana = hiragana ? normalizeSearchText(toRomaji(hiragana)) : '';
  const variants = uniqueSearchVariants([
    source,
    hiragana,
    romaji,
    romajiFromKana,
    ...expandRomajiAliases(romaji),
    ...expandRomajiAliases(romajiFromKana),
    ...expandRomajiAliases(source),
  ]);
  return uniqueSearchVariants([
    ...variants,
    ...variants.map(compactSearchText),
  ]);
}

export function buildSearchDocument(values: readonly string[]): SearchDocument {
  const normalized = values.flatMap((value) => documentVariants(value));
  return { text: normalized.join('\u0000'), compact: normalized.map(compactSearchText).join('\u0000') };
}

export function searchDocumentMatches(document: SearchDocument, keyword: string): boolean {
  const variants = keywordVariants(keyword);
  if (variants.length === 0) return true;
  return variants.some((variant) => document.text.includes(variant) || document.compact.includes(variant));
}

export function buildSongSearchIndex(songs: readonly Song[]): SongSearchEntry[] {
  return songs.map((song) => {
    const document = buildSearchDocument([
      song.id, song.title, song.artist ?? '', ...(song.aliases ?? []),
      ...song.charts.map((chart) => chart.charter ?? ''),
    ]);
    return { song, ...document };
  });
}

function includesNumber(values: readonly number[], value?: number): boolean {
  return values.length === 0 || (value !== undefined && values.includes(value));
}

export function searchSongs(index: readonly SongSearchEntry[], filters: SongSearchFilters): Song[] {
  const keyword = normalizeSearchText(filters.keyword);
  const min = filters.constantMin ?? Number.NEGATIVE_INFINITY;
  const max = filters.constantMax ?? Number.POSITIVE_INFINITY;
  return index.filter(({ song, ...document }) => {
    if (keyword && !searchDocumentMatches(document, keyword)) return false;
    if (!includesNumber(filters.songVersionIds, song.versionId)) return false;
    const chartMatch = song.charts.some((chart) =>
      (filters.types.length === 0 || filters.types.includes(chart.type)) &&
      (filters.difficulties.length === 0 || filters.difficulties.includes(chart.difficulty)) &&
      chart.difficultyConstant >= min && chart.difficultyConstant <= max &&
      includesNumber(filters.chartVersionIds, chart.versionId));
    return chartMatch;
  }).map(({ song }) => song);
}

export function filterSongs(songs: Song[], keyword: string): Song[] {
  return searchSongs(buildSongSearchIndex(songs), { ...EMPTY_SONG_FILTERS, keyword });
}
