import { stripUtageTitlePrefix } from '@/domain/catalog';
import type { Chart, DataSource, Song } from '@/domain/models';

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

export function dxRatingTagsForChart(
  snapshot: DxRatingChartTagsSnapshot | undefined,
  song: Song,
  chart: Chart,
): DxRatingChartTag[] {
  if (!snapshot) return [];

  if (chart.type !== 'UTAGE') {
    const sheetType: DxRatingSheetType = chart.type === 'DX' ? 'dx' : 'std';
    return relationTags(snapshot, snapshot.relations.filter((relation) => (
      relation.songTitle === song.title
      && relation.sheetType === sheetType
      && relation.sheetDifficulty === chart.difficulty
    )));
  }

  const sheetType: DxRatingSheetType = chart.utage?.isBuddy ? 'utage2p' : 'utage';
  const typeRelations = snapshot.relations.filter((relation) => relation.sheetType === sheetType);
  const candidateTitle = chart.utage?.kanji
    ? canonicalUtageTitle(`[${chart.utage.kanji}]${song.title}`)
    : undefined;
  const exact = candidateTitle
    ? typeRelations.filter((relation) => canonicalUtageTitle(relation.songTitle) === candidateTitle)
    : [];
  if (exact.length > 0) return relationTags(snapshot, exact);

  const strippedMatches = typeRelations.filter(
    (relation) => stripUtageTitlePrefix(relation.songTitle) === song.title,
  );
  const identities = new Set(strippedMatches.map((relation) => canonicalUtageTitle(relation.songTitle)));
  return identities.size === 1 ? relationTags(snapshot, strippedMatches) : [];
}
