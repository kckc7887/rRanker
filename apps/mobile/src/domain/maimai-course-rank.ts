import type { Player } from './models';

export type MaimaiCourseRankPresentation = {
  /** 与舞萌/LXNS 段位素材编号一致。 */
  id: number;
  label: string;
  assetIndex: number;
};

const ORDINAL_LABELS = ['初', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'] as const;

export function normalizeLxnsCourseRank(value: number | null | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const id = Math.floor(value!);
  return id >= 0 && id <= 23 ? id : undefined;
}

export function normalizeDivingFishCourseRank(value: number | null | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const id = Math.floor(value!);
  if (id < 0 || id > 22) return undefined;
  // 水鱼 11–22 比舞萌/LXNS 的素材编号少一位；11 号素材不是水鱼段位。
  return id <= 10 ? id : id + 1;
}

export function formatMaimaiCourseRank(id: number | null | undefined): MaimaiCourseRankPresentation | null {
  const normalized = normalizeLxnsCourseRank(id);
  if (normalized === undefined) return null;
  if (normalized === 0) return { id: normalized, label: '初学者', assetIndex: normalized };
  if (normalized >= 1 && normalized <= 10) {
    return { id: normalized, label: `${ORDINAL_LABELS[normalized]}段`, assetIndex: normalized };
  }
  if (normalized >= 12 && normalized <= 21) {
    const ordinal = normalized === 12 ? '初' : ORDINAL_LABELS[normalized - 11];
    return { id: normalized, label: `真${ordinal}段`, assetIndex: normalized };
  }
  if (normalized === 22) return { id: normalized, label: '真皆传', assetIndex: normalized };
  if (normalized === 23) return { id: normalized, label: '裏皆伝', assetIndex: normalized };
  return { id: normalized, label: `段位 ${normalized}`, assetIndex: normalized };
}

export function resolveMaimaiCourseRank(
  player: Pick<Player, 'extension' | 'additionalRating'>,
): MaimaiCourseRankPresentation | null {
  const extensionRank = player.extension?.kind === 'maimai'
    ? player.extension.courseRank
    : undefined;
  const normalized = extensionRank ?? normalizeDivingFishCourseRank(player.additionalRating);
  return formatMaimaiCourseRank(normalized);
}
