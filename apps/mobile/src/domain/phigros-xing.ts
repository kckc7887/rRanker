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

export function phigrosXingLabel(kind: PhigrosXingKind): string {
  return kind === 'good' ? 'XING-Good' : 'XING-Miss';
}

export function phigrosChartNoteKey(songId: string, levelIndex: number): string {
  return `${songId}:${levelIndex}`;
}
