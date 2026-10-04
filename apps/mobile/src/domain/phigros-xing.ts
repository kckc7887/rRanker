/** XING 表示整局只有一个 Good 或 Miss。 */
export type PhigrosXingKind = 'good' | 'miss';

/** Acc=(Perfect+0.65×Good)/N×100%；一个 Good/Miss 分别损失 0.35/N、1/N。 */
export function calculatePhigrosXingAcc(totalNotes: number, kind: PhigrosXingKind): number {
  if (!Number.isInteger(totalNotes) || totalNotes <= 0) return Number.NaN;
  /** 整数分子避免 0.35 的浮点误差。 */
  const percentNumerator = kind === 'good'
    ? 100 * (totalNotes - 1) + 65
    : 100 * (totalNotes - 1);
  return Math.round((percentNumerator * 100) / totalNotes) / 100;
}

export function isPhigrosXingAcc(acc: number, totalNotes: number, kind: PhigrosXingKind): boolean {
  if (!Number.isFinite(acc)) return false;
  const expected = calculatePhigrosXingAcc(totalNotes, kind);
  return Number.isFinite(expected) && Math.round(acc * 100) === Math.round(expected * 100);
}

/** XING-MISS 必断连击，排除 FC。 */
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

export const PHIGROS_XING_COLORS = { bg: '#FFF7ED', fg: '#EA580C' } as const;
