import type { OsuBestScore } from './osu';
import { normalizeNumericInput } from '@/utils/numeric-input';

/** 「无模组」筛选特殊值：与任何具体模组互斥（互斥由筛选栏勾选回调保证）。 */
export const OSU_MOD_FILTER_NONE = 'NM';

/** 成绩页模组筛选固定常用列表（acronym + 中文标签，同 OsuModBadge 的 acronym 口径）。 */
export const OSU_RECORDS_MOD_FILTERS: readonly { flag: string; label: string }[] = [
  { flag: OSU_MOD_FILTER_NONE, label: '无模组' },
  { flag: 'EZ', label: '简化' },
  { flag: 'NF', label: '不失败' },
  { flag: 'HT', label: '半速' },
  { flag: 'DT', label: '双倍速度' },
  { flag: 'NC', label: '夜晚核心' },
  { flag: 'HD', label: '隐藏' },
  { flag: 'HR', label: '硬式摇滚' },
  { flag: 'FL', label: '闪光灯' },
  { flag: 'PF', label: '完美' },
  { flag: 'SD', label: '突然死亡' },
  { flag: 'RX', label: '放松' },
];

/** 成绩页筛选状态口径（useOsuRecordsFilter 的筛选字段子集）。 */
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

/** 数值区间匹配：空为不限、非法输入 false、min>max false、闭区间比较（同 Phira matchesPhiraRange 口径）。 */
export function matchesOsuRange(value: number, minInput: string, maxInput: string): boolean {
  const min = finiteBound(minInput);
  const max = finiteBound(maxInput);
  if (Number.isNaN(min) || Number.isNaN(max)) return false;
  if (min !== undefined && max !== undefined && min > max) return false;
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

/**
 * 成绩页本地过滤（Top 100 客户端筛，不排序、保持上游 pp 序）：
 * - keyword：标题/艺术家/谱面名任一包含即命中（大小写不敏感）；
 * - mods：含 NM 时仅无模组成绩命中；否则 AND（每个选中 acronym 均在成绩 mods 中）；
 * - 达成率输入为百分比（98~99.5），与 accuracy*100 比较；难度为星数；PP 缺失在设置 pp 范围时排除。
 */
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
