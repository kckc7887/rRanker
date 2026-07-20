import type { ScoreRecord } from '@/domain/models';
import {
  MAIMAI_FC_ACHIEVEMENTS,
  MAIMAI_FS_ACHIEVEMENTS,
  matchesAchievementStatus,
  maimaiAchievementStatusLabel,
  type MaimaiAchievementStatus,
  type MaimaiFcAchievement,
  type MaimaiFsAchievement,
} from '@/domain/maimai-filters';
import { achievementTenThousandths, isNearMissAchievement } from '@/domain/score-presentation';
import { rankScoreRecords } from '@/domain/rating';

export type BestImageVersionFilter = 'current' | 'past';
export type BestImageFcAchievement = MaimaiFcAchievement;
export type BestImageFsAchievement = MaimaiFsAchievement;
export type BestImageAchievementFilter = MaimaiAchievementStatus;

export type CustomBestImageFilters = {
  quantity: number;
  versions: readonly BestImageVersionFilter[];
  splitVersions: boolean;
  minimumAchievement: number;
  achievement: BestImageAchievementFilter;
  strictAchievement: boolean;
  nearMiss: boolean;
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
  versions: ['current', 'past'],
  splitVersions: false,
  minimumAchievement: 0,
  achievement: null,
  strictAchievement: false,
  nearMiss: false,
};

export const FC_ACHIEVEMENTS = MAIMAI_FC_ACHIEVEMENTS;
export const FS_ACHIEVEMENTS = MAIMAI_FS_ACHIEVEMENTS;

export function bestImageAchievementLabel(filter: BestImageAchievementFilter): string {
  if (!filter) return 'Best';
  const label = maimaiAchievementStatusLabel(filter);
  return label === '全部' ? 'Best' : label;
}

export function parseBestImageQuantity(value: string): number | null {
  const normalized = value.normalize('NFKC').trim();
  if (!/^\d+$/u.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseBestImageMinimumAchievement(value: string): number | null {
  const normalized = value.normalize('NFKC').trim().replace(',', '.');
  if (normalized.length === 0) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 101 ? parsed : null;
}

function limited(records: readonly ScoreRecord[], quantity: number): ScoreRecord[] {
  const ranked = rankScoreRecords(records);
  return quantity === 0 ? ranked : ranked.slice(0, quantity);
}

function title(prefix: string, achievement: BestImageAchievementFilter, nearMiss: boolean, count: number): string {
  return `${prefix}${nearMiss ? '寸' : ''}${bestImageAchievementLabel(achievement)}${count}`;
}

export function buildCustomBestImageSections(
  records: readonly ScoreRecord[],
  currentVersionTitle: string,
  filters: CustomBestImageFilters,
): BestImageScoreSectionData[] {
  const selected = new Set(filters.versions);
  if (selected.size === 0) return [];
  const minimum = achievementTenThousandths(filters.minimumAchievement);
  const filtered = records.filter((record) => {
    if (record.version === 'unknown') return false;
    const version = record.version === currentVersionTitle ? 'current' : 'past';
    return selected.has(version)
      && achievementTenThousandths(record.achievements) >= minimum
      && (!filters.nearMiss || isNearMissAchievement(record.achievements))
      && matchesAchievementStatus(record, filters.achievement, filters.strictAchievement);
  });
  const split = selected.has('current') && selected.has('past') && filters.splitVersions;
  const makeSection = (id: string, prefix: string, source: readonly ScoreRecord[]) => {
    const output = limited(source, filters.quantity);
    return { id, title: title(prefix, filters.achievement, filters.nearMiss, output.length), records: output };
  };
  if (split) {
    return [
      makeSection('custom-current', '当前版本', filtered.filter((record) => record.version === currentVersionTitle)),
      makeSection('custom-past', '过往版本', filtered.filter((record) => record.version !== currentVersionTitle)),
    ];
  }
  const prefix = selected.size > 1 ? '' : selected.has('current') ? '当前版本' : '过往版本';
  return [makeSection('custom', prefix, filtered)];
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
