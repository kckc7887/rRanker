import { chartVersionKey, stripUtageTitlePrefix } from '@/domain/catalog';
import type { Chart, ChartType, DataSource, Song } from '@/domain/models';

export const DXRATING_CHART_TAGS_RESOURCE_KEY = 'dxrating-chart-tags';
export const DXRATING_CHART_TAGS_SCHEMA_VERSION = 3;

export type DxRatingSheetType = 'std' | 'dx' | 'utage' | 'utage2p';

export interface DxRatingDescriptionSegment {
  text: string;
  strikethrough: boolean;
}

export interface DxRatingChartTag {
  id: number;
  name: string;
  description: string;
  descriptionSegments: DxRatingDescriptionSegment[];
  color: string;
  groupId: number;
  groupName: string;
}

export interface DxRatingChartTagRelation {
  songTitle: string;
  sheetType: DxRatingSheetType;
  sheetDifficulty: string;
  tagId: number;
}

export interface DxRatingChartTagsSnapshot {
  tags: DxRatingChartTag[];
  relations: DxRatingChartTagRelation[];
  source: DataSource;
}

export type DxRatingChartTagIndex = ReadonlyMap<string, ReadonlySet<number>>;

interface DxRatingRelationIndex {
  normal: ReadonlyMap<string, readonly DxRatingChartTagRelation[]>;
  utageExact: ReadonlyMap<string, readonly DxRatingChartTagRelation[]>;
  utageFallback: ReadonlyMap<string, ReadonlyMap<string, readonly DxRatingChartTagRelation[]>>;
}

function canonicalUtageTitle(title: string): string {
  const match = title.match(/^\s*[\[［【]([^\]］】]+)[\]］】]\s*(.*)$/u);
  if (!match) return title.trim();
  return `[${match[1].trim()}]${match[2].trim()}`;
}

function relationTags(
  snapshot: DxRatingChartTagsSnapshot,
  relations: readonly DxRatingChartTagRelation[],
): DxRatingChartTag[] {
  const tagsById = new Map(snapshot.tags.map((tag) => [tag.id, tag]));
  const seen = new Set<number>();
  const result: DxRatingChartTag[] = [];
  for (const relation of relations) {
    if (seen.has(relation.tagId)) continue;
    const tag = tagsById.get(relation.tagId);
    if (!tag) continue;
    seen.add(tag.id);
    result.push(tag);
  }
  return result;
}

function appendRelation(
  map: Map<string, DxRatingChartTagRelation[]>,
  key: string,
  relation: DxRatingChartTagRelation,
): void {
  const current = map.get(key);
  if (current) current.push(relation);
  else map.set(key, [relation]);
}

function buildRelationIndex(snapshot: DxRatingChartTagsSnapshot): DxRatingRelationIndex {
  const normal = new Map<string, DxRatingChartTagRelation[]>();
  const utageExact = new Map<string, DxRatingChartTagRelation[]>();
  const utageFallback = new Map<string, Map<string, DxRatingChartTagRelation[]>>();
  for (const relation of snapshot.relations) {
    if (relation.sheetType === 'std' || relation.sheetType === 'dx') {
      appendRelation(normal, `${relation.songTitle}\u0000${relation.sheetType}\u0000${relation.sheetDifficulty}`, relation);
      continue;
    }
    const canonicalTitle = canonicalUtageTitle(relation.songTitle);
    appendRelation(utageExact, `${relation.sheetType}\u0000${canonicalTitle}`, relation);
    const fallbackKey = `${relation.sheetType}\u0000${stripUtageTitlePrefix(relation.songTitle)}`;
    const identities = utageFallback.get(fallbackKey) ?? new Map<string, DxRatingChartTagRelation[]>();
    appendRelation(identities, canonicalTitle, relation);
    utageFallback.set(fallbackKey, identities);
  }
  return { normal, utageExact, utageFallback };
}

function indexedRelationsForChart(
  index: DxRatingRelationIndex,
  song: Song,
  chart: Chart,
): readonly DxRatingChartTagRelation[] {
  if (chart.type !== 'UTAGE') {
    const sheetType: DxRatingSheetType = chart.type === 'DX' ? 'dx' : 'std';
    return index.normal.get(`${song.title}\u0000${sheetType}\u0000${chart.difficulty}`) ?? [];
  }

  const sheetType: DxRatingSheetType = chart.utage?.isBuddy ? 'utage2p' : 'utage';
  const candidateTitle = chart.utage?.kanji
    ? canonicalUtageTitle(`[${chart.utage.kanji}]${song.title}`)
    : undefined;
  const exact = candidateTitle
    ? index.utageExact.get(`${sheetType}\u0000${candidateTitle}`) ?? []
    : [];
  if (exact.length > 0) return exact;

  const identities = index.utageFallback.get(`${sheetType}\u0000${song.title}`);
  if (!identities || identities.size !== 1) return [];
  return identities.values().next().value ?? [];
}

export function dxRatingTagsForChart(
  snapshot: DxRatingChartTagsSnapshot | undefined,
  song: Song,
  chart: Chart,
): DxRatingChartTag[] {
  if (!snapshot) return [];
  return relationTags(snapshot, indexedRelationsForChart(buildRelationIndex(snapshot), song, chart));
}

export function buildDxRatingChartTagIndex(
  snapshot: DxRatingChartTagsSnapshot | undefined,
  songs: readonly Song[],
): DxRatingChartTagIndex {
  if (!snapshot) return new Map();
  const relations = buildRelationIndex(snapshot);
  const validTagIds = new Set(snapshot.tags.map((tag) => tag.id));
  const result = new Map<string, ReadonlySet<number>>();
  for (const song of songs) {
    for (const chart of song.charts) {
      const tagIds = new Set(indexedRelationsForChart(relations, song, chart)
        .map((relation) => relation.tagId)
        .filter((tagId) => validTagIds.has(tagId)));
      if (tagIds.size > 0) result.set(chartVersionKey(song.id, chart.type, chart.levelIndex), tagIds);
    }
  }
  return result;
}

export function dxRatingChartHasAllTags(
  index: DxRatingChartTagIndex,
  songId: string | number,
  chartType: ChartType,
  levelIndex: number,
  selectedTagIds: readonly number[],
): boolean {
  if (selectedTagIds.length === 0) return true;
  const chartTagIds = index.get(chartVersionKey(songId, chartType, levelIndex));
  return !!chartTagIds && selectedTagIds.every((tagId) => chartTagIds.has(tagId));
}
