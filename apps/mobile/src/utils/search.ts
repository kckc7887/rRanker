import type { Chart, ChartType, Difficulty, Song } from '@/domain/models';
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
export type SongChartPredicate = (song: Song, chart: Chart) => boolean;

export const EMPTY_SONG_FILTERS: SongSearchFilters = {
  keyword: '', types: [], difficulties: [], songVersionIds: [], chartVersionIds: [],
};

/** 按长度优先匹配同一假名的罗马音拼写。 */
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

/** 检索时将 づ/ぢ 与 ず/じ 视为同音。 */
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

/** 限制变体数量，避免长词组合爆炸。 */
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
  /** 索引只存源文、假名与 Hepburn，避免展开全部组合。 */
  return uniqueSearchVariants([source, hiragana, romaji, romajiFromKana]);
}

let lastKeyword: string | undefined;
let lastKeywordVariants: string[] = [];

function keywordVariants(keyword: string): string[] {
  if (keyword === lastKeyword) return lastKeywordVariants;
  const variants = buildKeywordVariants(keyword);
  lastKeyword = keyword;
  lastKeywordVariants = variants;
  return variants;
}

function buildKeywordVariants(keyword: string): string[] {
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
  const inputs = [...values];
  let document: SearchDocument | undefined;
  const read = () => {
    if (!document) {
      const normalized = inputs.flatMap((value) => documentVariants(value));
      document = { text: normalized.join('\u0000'), compact: normalized.map(compactSearchText).join('\u0000') };
    }
    return document;
  };
  return { get text() { return read().text; }, get compact() { return read().compact; } };
}

export function searchDocumentMatches(document: SearchDocument, keyword: string): boolean {
  const variants = keywordVariants(keyword);
  if (variants.length === 0) return true;
  return variants.some((variant) => document.text.includes(variant) || document.compact.includes(variant));
}

const documentsByFields = new WeakMap<object, WeakMap<object, SearchDocument>>();

export function searchDocumentFor<T extends object>(item: T, fields: (item: T) => readonly string[]): SearchDocument {
  let documents = documentsByFields.get(fields);
  if (!documents) {
    documents = new WeakMap();
    documentsByFields.set(fields, documents);
  }
  let document = documents.get(item);
  if (!document) {
    document = buildSearchDocument(fields(item));
    documents.set(item, document);
  }
  return document;
}

const aliasDocuments = new WeakMap<object, { title: SearchDocument; aliases: { value: string; document: SearchDocument }[] }>();

export function findMatchedAlias(song: { title: string; aliases?: string[] }, keyword: string): string | undefined {
  if (!keyword.trim()) return undefined;
  let documents = aliasDocuments.get(song);
  if (!documents) {
    documents = {
      title: buildSearchDocument([song.title]),
      aliases: (song.aliases ?? []).map((value) => ({ value, document: buildSearchDocument([value]) })),
    };
    aliasDocuments.set(song, documents);
  }
  if (searchDocumentMatches(documents.title, keyword)) return undefined;
  return documents.aliases.find(({ document }) => searchDocumentMatches(document, keyword))?.value;
}

const songSearchValues = (song: Song) => [
  song.id, song.title, song.artist ?? '', ...(song.aliases ?? []),
  ...song.charts.map((chart) => chart.charter ?? ''),
];

export function songSearchDocument(song: Song): SearchDocument {
  return searchDocumentFor(song, songSearchValues);
}

export function buildSongSearchIndex(songs: readonly Song[]): SongSearchEntry[] {
  return songs.map((song) => {
    const document = songSearchDocument(song);
    return { song, get text() { return document.text; }, get compact() { return document.compact; } };
  });
}

function includesNumber(values: readonly number[], value?: number): boolean {
  return values.length === 0 || (value !== undefined && values.includes(value));
}

export function searchSongs(
  index: readonly SongSearchEntry[],
  filters: SongSearchFilters,
  chartPredicate?: SongChartPredicate,
): Song[] {
  return index.filter((document) => matchesSongDocument(document.song, document, filters, chartPredicate)).map(({ song }) => song);
}

export function matchesSongSearch(song: Song, filters: SongSearchFilters, chartPredicate?: SongChartPredicate): boolean {
  return matchesSongDocument(song, songSearchDocument(song), filters, chartPredicate);
}

function matchesSongDocument(song: Song, document: SearchDocument, filters: SongSearchFilters, chartPredicate?: SongChartPredicate): boolean {
  if (!searchDocumentMatches(document, filters.keyword)) return false;
  if (!includesNumber(filters.songVersionIds, song.versionId)) return false;
  const min = filters.constantMin ?? Number.NEGATIVE_INFINITY;
  const max = filters.constantMax ?? Number.POSITIVE_INFINITY;
  const hasConstantFilter = filters.constantMin !== undefined || filters.constantMax !== undefined;
  return song.charts.some((chart) =>
    (filters.types.length === 0 || filters.types.includes(chart.type)) &&
    (filters.difficulties.length === 0 || filters.difficulties.includes(chart.difficulty)) &&
    !(chart.type === 'UTAGE' && hasConstantFilter) &&
    chart.difficultyConstant >= min && chart.difficultyConstant <= max &&
    includesNumber(filters.chartVersionIds, chart.versionId) &&
    (!chartPredicate || chartPredicate(song, chart)));
}

export function filterSongs(songs: Song[], keyword: string): Song[] {
  return searchSongs(buildSongSearchIndex(songs), { ...EMPTY_SONG_FILTERS, keyword });
}
