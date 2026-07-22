/** XING：整局仅落下 1 个 Good 或 1 个 Miss 时的 Acc 种类 */
export type PhigrosXingKind = 'good' | 'miss';

/**
 * 理论 XING Acc（百分数，两位小数）。
 * Acc = (N_Perfect + 0.65 N_Good) / N_Total × 100%
 * - good：1 Good，其余 Perfect → (N - 0.35) / N × 100
 * - miss：1 Miss，其余 Perfect → (N - 1) / N × 100
 */
export function calculatePhigrosXingAcc(totalNotes: number, kind: PhigrosXingKind): number {
  if (!Number.isInteger(totalNotes) || totalNotes <= 0) return Number.NaN;
  // Acc% = (N_Perfect + 0.65 N_Good) / N × 100；用整数分子避免 0.35 浮点误差
  const percentNumerator = kind === 'good'
    ? 100 * (totalNotes - 1) + 65
    : 100 * (totalNotes - 1);
  return Math.round((percentNumerator * 100) / totalNotes) / 100;
}

/** 成绩 Acc（两位小数）是否等于该谱面物量下的理论 XING Acc */
export function isPhigrosXingAcc(acc: number, totalNotes: number, kind: PhigrosXingKind): boolean {
  if (!Number.isFinite(acc)) return false;
  const expected = calculatePhigrosXingAcc(totalNotes, kind);
  return Number.isFinite(expected) && Math.round(acc * 100) === Math.round(expected * 100);
}

/**
 * 判定成绩是否为 XING；无物量返回 null。
 * XING-MISS 必断连击，故 FC（蓝 V）一律不算 MISS。
 */
export function resolvePhigrosXingKind(
  acc: number,
  totalNotes: number | undefined,
  isFc: boolean,
): PhigrosXingKind | null {
  if (typeof totalNotes !== 'number' || !Number.isInteger(totalNotes) || totalNotes <= 0) {
    return null;
  }
  if (isPhigrosXingAcc(acc, totalNotes, 'good')) return 'good';
  if (isFc) return null;
  if (isPhigrosXingAcc(acc, totalNotes, 'miss')) return 'miss';
  return null;
}

/** null = 关闭筛选；Miss 排除 FC；无物量不命中 */
export function matchesPhigrosXingFilter(
  record: {
    achievements: number;
    songId: string;
    levelIndex: number;
    fc?: string | null;
  },
  xing: PhigrosXingKind | null,
  noteTotalByKey: Readonly<Record<string, number>>,
): boolean {
  if (xing === null) return true;
  // Miss 必断连击，排除 FC（存档映射为 fc === 'ap'）
  if (xing === 'miss' && record.fc === 'ap') return false;
  const total = noteTotalByKey[phigrosChartNoteKey(record.songId, record.levelIndex)];
  if (total === undefined) return false;
  return isPhigrosXingAcc(record.achievements, total, xing);
}

export function phigrosXingLabel(kind: PhigrosXingKind): string {
  return kind === 'good' ? 'XING-GOOD' : 'XING-MISS';
}

export function phigrosChartNoteKey(songId: string, levelIndex: number): string {
  return `${songId}:${levelIndex}`;
}
