import { chartVersionKey } from '@/domain/catalog';
import type { AliasSnapshot, CatalogSnapshot, DataSource, Song } from '@/domain/models';
import { compactSearchText, normalizeSearchText } from '@/utils/search';

export const PHIGROS_KYOU_ALIASES_RESOURCE_KEY = 'phigros-kyou-aliases';
export const PHIGROS_KYOU_ALIASES_SCHEMA_VERSION = 1;
export const PHIGROS_KYOU_TAGS_RESOURCE_KEY = 'phigros-kyou-chart-tags';
export const PHIGROS_KYOU_TAGS_SCHEMA_VERSION = 1;
export const PHIGROS_KYOU_RESOURCE_KEYS = [
  PHIGROS_KYOU_ALIASES_RESOURCE_KEY,
  PHIGROS_KYOU_TAGS_RESOURCE_KEY,
] as const;

export function isPhigrosKyouResourceKey(key: string): boolean {
  return (PHIGROS_KYOU_RESOURCE_KEYS as readonly string[]).includes(key);
}

export type PhigrosKyouDifficulty = 'ez' | 'hd' | 'in' | 'at';
export type PhigrosKyouTagType = 'primary' | 'secondary';

export interface PhigrosKyouSong {
  songId: string;
  name: string;
  pack: string;
}

export interface PhigrosKyouAlias {
  songId: string;
  songName: string;
  alias: string;
}

export interface PhigrosKyouChart {
  chartId: string;
  songId: string;
  songName: string;
  difficulty: PhigrosKyouDifficulty;
  constant: number;
  mainLabel: string;
  mainLabelQuestion: boolean;
  mainTopVotes: number;
  mainSecondVotes: number;
  tagSource: string;
}

export interface PhigrosKyouTag {
  id: number;
  name: string;
  type: PhigrosKyouTagType;
  parentIds: number[];
  description: string;
}

export interface PhigrosKyouTagVote {
  chartId: string;
  songId: string;
  songName: string;
  difficulty: PhigrosKyouDifficulty;
  tagType: PhigrosKyouTagType;
  tagId: number;
  tag: string;
  votes: number;
  parentIds: number[];
  source: string;
}

export interface PhigrosKyouAliasesSnapshot {
  songs: PhigrosKyouSong[];
  aliases: PhigrosKyouAlias[];
  source: DataSource;
}

export interface PhigrosKyouChartTagsSnapshot {
  songs: PhigrosKyouSong[];
  charts: PhigrosKyouChart[];
  tags: PhigrosKyouTag[];
  votes: PhigrosKyouTagVote[];
  source: DataSource;
}

export interface PhigrosKyouResolvedTag extends PhigrosKyouTag {
  votes: number;
}

export type PhigrosKyouChartTagIndex = ReadonlyMap<string, readonly PhigrosKyouResolvedTag[]>;

const DIFFICULTY_INDEX: Record<PhigrosKyouDifficulty, number> = {
  ez: 0,
  hd: 1,
  in: 2,
  at: 3,
};

const TITLE_OVERRIDES = new Map<string, string>([
  [compactSearchText('The Mountain Eater from MUSYNC'), compactSearchText('The Mountain Eater')],
]);

function canonicalTitle(title: string): string {
  const compact = compactSearchText(title);
  return TITLE_OVERRIDES.get(compact) ?? compact;
}

function canonicalPack(pack: string): string {
  return compactSearchText(pack)
    .replace(/^chapter/u, '')
    .replace(/^ex/u, '');
}

function constantsSignature(values: readonly number[]): string {
  return values.map((value) => value.toFixed(6)).join('|');
}

function kyouChartSignature(charts: readonly PhigrosKyouChart[]): string {
  return constantsSignature([...charts]
    .sort((left, right) => DIFFICULTY_INDEX[left.difficulty] - DIFFICULTY_INDEX[right.difficulty])
    .map((chart) => chart.constant));
}

function catalogChartSignature(song: Song): string {
  return constantsSignature([...song.charts]
    .sort((left, right) => left.levelIndex - right.levelIndex)
    .map((chart) => chart.difficultyConstant));
}

/**
 * Kyou 与 APK 使用不同歌曲 ID。只接受可唯一证明的标题、章节或定数组合匹配；
 * 无法唯一对应的条目留空，避免同名曲串数据。
 */
export function buildPhigrosKyouSongMap(
  catalog: CatalogSnapshot,
  kyouSongs: readonly PhigrosKyouSong[],
  kyouCharts: readonly PhigrosKyouChart[] = [],
): ReadonlyMap<string, Song> {
  const catalogByTitle = new Map<string, Song[]>();
  for (const song of catalog.songs) {
    const key = canonicalTitle(song.title);
    const current = catalogByTitle.get(key);
    if (current) current.push(song);
    else catalogByTitle.set(key, [song]);
  }

  const chartsBySongId = new Map<string, PhigrosKyouChart[]>();
  for (const chart of kyouCharts) {
    const current = chartsBySongId.get(chart.songId);
    if (current) current.push(chart);
    else chartsBySongId.set(chart.songId, [chart]);
  }

  const result = new Map<string, Song>();
  for (const sourceSong of kyouSongs) {
    let candidates = catalogByTitle.get(canonicalTitle(sourceSong.name)) ?? [];
    if (candidates.length > 1) {
      const pack = canonicalPack(sourceSong.pack);
      const byPack = candidates.filter((song) => {
        const version = canonicalPack(song.version);
        return !!version && (pack.includes(version) || version.includes(pack));
      });
      if (byPack.length === 1) candidates = byPack;
    }
    if (candidates.length > 1) {
      const charts = chartsBySongId.get(sourceSong.songId) ?? [];
      if (charts.length > 0) {
        const signature = kyouChartSignature(charts);
        const byConstants = candidates.filter((song) => catalogChartSignature(song) === signature);
        if (byConstants.length === 1) candidates = byConstants;
      }
    }
    if (candidates.length === 1) result.set(sourceSong.songId, candidates[0]!);
  }
  return result;
}

export function mapPhigrosKyouAliases(
  snapshot: PhigrosKyouAliasesSnapshot,
  catalog: CatalogSnapshot,
): AliasSnapshot {
  const songMap = buildPhigrosKyouSongMap(catalog, snapshot.songs);
  const aliasesBySongId = new Map<string, string[]>();
  const normalizedBySongId = new Map<string, Set<string>>();
  for (const record of snapshot.aliases) {
    const song = songMap.get(record.songId);
    const alias = record.alias.normalize('NFKC').trim();
    if (!song || !alias) continue;
    const normalized = normalizeSearchText(alias);
    const seen = normalizedBySongId.get(song.id) ?? new Set<string>();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    normalizedBySongId.set(song.id, seen);
    const current = aliasesBySongId.get(song.id);
    if (current) current.push(alias);
    else aliasesBySongId.set(song.id, [alias]);
  }
  return {
    aliases: [...aliasesBySongId].map(([songId, aliases]) => ({ songId, aliases })),
    source: snapshot.source,
  };
}

export function buildPhigrosKyouChartTagIndex(
  snapshot: PhigrosKyouChartTagsSnapshot | undefined,
  catalog: CatalogSnapshot | undefined,
): PhigrosKyouChartTagIndex {
  if (!snapshot || !catalog) return new Map();
  const songMap = buildPhigrosKyouSongMap(catalog, snapshot.songs, snapshot.charts);
  const tagsById = new Map(snapshot.tags.map((tag) => [tag.id, tag]));
  const resolved = new Map<string, Map<number, PhigrosKyouResolvedTag>>();

  for (const vote of snapshot.votes) {
    if (vote.votes <= 0) continue;
    const song = songMap.get(vote.songId);
    const tag = tagsById.get(vote.tagId);
    if (!song || !tag) continue;
    const levelIndex = DIFFICULTY_INDEX[vote.difficulty];
    const chart = song.charts.find((item) => item.type === 'SD' && item.levelIndex === levelIndex);
    if (!chart) continue;
    const key = chartVersionKey(song.id, chart.type, chart.levelIndex);
    const current = resolved.get(key) ?? new Map<number, PhigrosKyouResolvedTag>();
    const previous = current.get(tag.id);
    if (!previous || vote.votes > previous.votes) current.set(tag.id, { ...tag, votes: vote.votes });
    resolved.set(key, current);
  }

  return new Map([...resolved].map(([key, tags]) => [
    key,
    [...tags.values()].sort((left, right) => (
      (left.type === right.type ? 0 : left.type === 'primary' ? -1 : 1)
      || right.votes - left.votes
      || left.id - right.id
    )),
  ]));
}

export function phigrosKyouTagsForChart(
  index: PhigrosKyouChartTagIndex,
  songId: string,
  levelIndex: number,
): readonly PhigrosKyouResolvedTag[] {
  return index.get(chartVersionKey(songId, 'SD', levelIndex)) ?? [];
}

export function phigrosKyouChartHasAllTags(
  index: PhigrosKyouChartTagIndex,
  songId: string,
  levelIndex: number,
  selectedTagIds: readonly number[],
): boolean {
  if (selectedTagIds.length === 0) return true;
  const tags = phigrosKyouTagsForChart(index, songId, levelIndex);
  if (tags.length === 0) return false;
  const ids = new Set(tags.map((tag) => tag.id));
  return selectedTagIds.every((tagId) => ids.has(tagId));
}
