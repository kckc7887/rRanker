import type { ChartType, Difficulty, ScoreRecord } from '@/domain/models';
import {
  matchesAchievementRange,
  matchesAchievementStatus,
  matchesConstantRange,
  maimaiFcAchievementLabel,
  maimaiFsAchievementLabel,
  type MaimaiFcAchievement,
  type MaimaiFsAchievement,
} from '@/domain/maimai-filters';
import type { DxRatingChartTagIndex } from '@/domain/dxrating-chart-tags';
import { dxRatingChartHasAllTags } from '@/domain/dxrating-chart-tags';
import { isNearMissAchievement } from '@/domain/score-presentation';
import { rankScoreRecords } from '@/domain/rating';

export type CustomBestImageFilters = {
  quantity: number;
  versions: readonly string[];
  splitVersions: boolean;
  difficulty: Difficulty | 'all';
  type: ChartType | 'all';
  constantMin: string;
  constantMax: string;
  achievementMin: string;
  achievementMax: string;
  soloAchievement: MaimaiFcAchievement | null;
  multiAchievement: MaimaiFsAchievement | null;
  strictAchievement: boolean;
  nearMiss: boolean;
  selectedDxRatingTagIds: readonly number[];
  dxRatingTagIndex: DxRatingChartTagIndex;
  /** 版本名 → 展示名（跟随筛选器的中/日切换）。 */
  versionLabels: Readonly<Record<string, string>>;
};

export type BestImageScoreSectionData = {
  id: string;
  title: string;
  records: readonly ScoreRecord[];
  rankOffset?: number;
};

export type BestImagePage = {
  id: string;
  sections: readonly BestImageScoreSectionData[];
  pageIndex: number;
  pageCount: number;
};

export const DEFAULT_CUSTOM_BEST_IMAGE_FILTERS: CustomBestImageFilters = {
  quantity: 50,
  versions: [],
  splitVersions: false,
  difficulty: 'all',
  type: 'all',
  constantMin: '',
  constantMax: '',
  achievementMin: '',
  achievementMax: '',
  soloAchievement: null,
  multiAchievement: null,
  strictAchievement: false,
  nearMiss: false,
  selectedDxRatingTagIds: [],
  dxRatingTagIndex: new Map(),
  versionLabels: {},
};

export function bestImageAchievementTitleLabel(
  soloAchievement: MaimaiFcAchievement | null,
  multiAchievement: MaimaiFsAchievement | null,
): string {
  const solo = soloAchievement ? maimaiFcAchievementLabel(soloAchievement) : null;
  const multi = multiAchievement ? maimaiFsAchievementLabel(multiAchievement) : null;
  if (!solo && !multi) return 'Best';
  return [solo, multi].filter(Boolean).join('');
}

export function parseBestImageQuantity(value: string): number | null {
  const normalized = value.normalize('NFKC').trim();
  if (!/^\d+$/u.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function limited(records: readonly ScoreRecord[], quantity: number): ScoreRecord[] {
  const ranked = rankScoreRecords(records);
  return quantity === 0 ? ranked : ranked.slice(0, quantity);
}

function title(
  prefix: string,
  soloAchievement: MaimaiFcAchievement | null,
  multiAchievement: MaimaiFsAchievement | null,
  nearMiss: boolean,
  count: number,
): string {
  return `${prefix}${nearMiss ? '寸' : ''}${bestImageAchievementTitleLabel(soloAchievement, multiAchievement)}${count}`;
}

function matchesCustomAchievementFilters(
  record: ScoreRecord,
  soloAchievement: MaimaiFcAchievement | null,
  multiAchievement: MaimaiFsAchievement | null,
  strictAchievement: boolean,
): boolean {
  if (soloAchievement && !matchesAchievementStatus(record, { family: 'fc', value: soloAchievement }, strictAchievement)) {
    return false;
  }
  if (multiAchievement && !matchesAchievementStatus(record, { family: 'fs', value: multiAchievement }, strictAchievement)) {
    return false;
  }
  return true;
}

export function buildCustomBestImageSections(
  records: readonly ScoreRecord[],
  filters: CustomBestImageFilters,
): BestImageScoreSectionData[] {
  if (filters.versions.length === 0) return [];
  const selected = new Set(filters.versions);
  const filtered = records.filter((record) => {
    if (record.type === 'UTAGE') return false;
    if (record.version === 'unknown') return false;
    if (!selected.has(record.version)) return false;
    if (filters.difficulty !== 'all' && record.difficulty !== filters.difficulty) return false;
    if (filters.type !== 'all' && record.type !== filters.type) return false;
    if (!matchesConstantRange(record.difficultyConstant, filters.constantMin, filters.constantMax)) return false;
    if (!matchesAchievementRange(record.achievements, filters.achievementMin, filters.achievementMax)) return false;
    if (filters.nearMiss && !isNearMissAchievement(record.achievements)) return false;
    if (!matchesCustomAchievementFilters(record, filters.soloAchievement, filters.multiAchievement, filters.strictAchievement)) {
      return false;
    }
    if (filters.selectedDxRatingTagIds.length > 0 && !dxRatingChartHasAllTags(
      filters.dxRatingTagIndex,
      record.songId,
      record.type,
      record.levelIndex,
      filters.selectedDxRatingTagIds,
    )) {
      return false;
    }
    return true;
  });
  const labelFor = (version: string) => filters.versionLabels[version] ?? version;
  if (filters.splitVersions && filters.versions.length > 1) {
    return filters.versions.map((version) => {
      const output = limited(filtered.filter((record) => record.version === version), filters.quantity);
      return {
        id: `custom-${version}`,
        title: title(labelFor(version), filters.soloAchievement, filters.multiAchievement, filters.nearMiss, output.length),
        records: output,
      };
    });
  }
  const prefix = filters.versions.length === 1 ? labelFor(filters.versions[0]!) : '';
  const output = limited(filtered, filters.quantity);
  return [{
    id: 'custom',
    title: title(prefix, filters.soloAchievement, filters.multiAchievement, filters.nearMiss, output.length),
    records: output,
  }];
}

export function paginateBestImageSections(
  sections: readonly BestImageScoreSectionData[],
  maximumRows = 50,
  columns = 5,
): BestImagePage[] {
  const safeRows = Math.max(1, Math.floor(maximumRows));
  const safeColumns = Math.max(1, Math.floor(columns));
  const rawPages: { sections: BestImageScoreSectionData[]; rows: number }[] = [];
  const currentPage = () => rawPages.at(-1) ?? (() => {
    const page = { sections: [] as BestImageScoreSectionData[], rows: 0 };
    rawPages.push(page);
    return page;
  })();

  for (const section of sections) {
    if (section.records.length === 0) {
      currentPage().sections.push({ ...section, rankOffset: 0 });
      continue;
    }
    let offset = 0;
    while (offset < section.records.length) {
      let page = currentPage();
      if (page.rows >= safeRows) {
        rawPages.push({ sections: [], rows: 0 });
        page = currentPage();
      }
      const availableCards = (safeRows - page.rows) * safeColumns;
      const chunk = section.records.slice(offset, offset + availableCards);
      page.sections.push({ ...section, id: `${section.id}-${offset}`, records: chunk, rankOffset: offset });
      page.rows += Math.ceil(chunk.length / safeColumns);
      offset += chunk.length;
    }
  }
  if (rawPages.length === 0) rawPages.push({ sections: [], rows: 0 });
  const pageCount = rawPages.length;
  return rawPages.map((page, index) => ({
    id: `best-image-page-${index + 1}`,
    sections: page.sections,
    pageIndex: index,
    pageCount,
  }));
}

/**
 * Keep each exported bitmap in roughly the same memory range as a 1080 px,
 * 50-row page. Higher resolutions therefore use more, shorter pages instead
 * of constructing one exceptionally large native bitmap.
 */
export function maximumBestImageRowsForWidth(width: number): number {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1080;
  return Math.max(1, Math.min(50, Math.floor(50 * (1080 / safeWidth) ** 2)));
}
