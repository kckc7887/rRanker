import type { OsuBestScore } from './osu';
import { normalizeNumericInput } from '@/utils/numeric-input';

/** NM 与具体模组互斥。 */
export const OSU_MOD_FILTER_NONE = 'NM';

export type OsuRecordsFilters = {
  keyword: string;
  mods: readonly string[];
  accuracyMin: string;
  accuracyMax: string;
  starMin: string;
  starMax: string;
  ppMin: string;
  ppMax: string;
};

function finiteBound(value: string): number | undefined {
  const normalized = normalizeNumericInput(value);
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function matchesOsuRange(value: number, minInput: string, maxInput: string): boolean {
  const min = finiteBound(minInput);
  const max = finiteBound(maxInput);
  if (Number.isNaN(min) || Number.isNaN(max)) return false;
  if (min !== undefined && max !== undefined && min > max) return false;
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

/** 筛选保持上游 PP 顺序；准确率输入为百分数。 */
export function filterOsuBestScores(
  values: readonly OsuBestScore[],
  filters: OsuRecordsFilters,
): OsuBestScore[] {
  const keyword = filters.keyword.trim().toLocaleLowerCase();
  const ppRangeActive = filters.ppMin.trim() !== '' || filters.ppMax.trim() !== '';
  return values.filter((score) => {
    if (keyword) {
      const title = score.beatmapset.title.toLocaleLowerCase();
      const artist = score.beatmapset.artist.toLocaleLowerCase();
      const version = score.beatmap.version.toLocaleLowerCase();
      if (!title.includes(keyword) && !artist.includes(keyword) && !version.includes(keyword)) {
        return false;
      }
    }
    if (filters.mods.length > 0) {
      if (filters.mods.includes(OSU_MOD_FILTER_NONE)) {
        if (score.mods.length > 0) return false;
      } else {
        for (const flag of filters.mods) {
          if (!score.mods.includes(flag)) return false;
        }
      }
    }
    if (!matchesOsuRange(score.accuracy * 100, filters.accuracyMin, filters.accuracyMax)) {
      return false;
    }
    if (!matchesOsuRange(score.beatmap.difficultyRating, filters.starMin, filters.starMax)) {
      return false;
    }
    if (ppRangeActive) {
      if (score.pp == null) return false;
      if (!matchesOsuRange(score.pp, filters.ppMin, filters.ppMax)) return false;
    }
    return true;
  });
}
