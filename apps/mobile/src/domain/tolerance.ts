export type NormalJudgment = 'perfect' | 'great' | 'good' | 'miss';
export type BreakJudgment = 'criticalPerfect' | 'perfect1' | 'perfect2' | 'great1' | 'great2' | 'great3' | 'good' | 'miss';
export type NoteKind = 'tap' | 'hold' | 'slide' | 'touch' | 'break';

export interface NoteCounts { tap: number; hold: number; slide: number; touch: number; break: number }
export interface JudgmentInput {
  tap?: Partial<Record<NormalJudgment, number>>;
  hold?: Partial<Record<NormalJudgment, number>>;
  slide?: Partial<Record<NormalJudgment, number>>;
  touch?: Partial<Record<NormalJudgment, number>>;
  break?: Partial<Record<BreakJudgment, number>>;
}

const NOTE_WEIGHT: Record<Exclude<NoteKind, 'break'>, number> = { tap: 1, hold: 2, slide: 3, touch: 1 };
const NORMAL_RATIO: Record<NormalJudgment, number> = { perfect: 1, great: 0.8, good: 0.5, miss: 0 };
const BREAK_BASE: Record<BreakJudgment, number> = { criticalPerfect: 5, perfect1: 5, perfect2: 5, great1: 4, great2: 3, great3: 2.5, good: 2, miss: 0 };
const BREAK_BONUS: Record<BreakJudgment, number> = { criticalPerfect: 1, perfect1: 0.75, perfect2: 0.5, great1: 0.4, great2: 0.4, great3: 0.4, good: 0.3, miss: 0 };

function validCount(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) throw new Error('判定数量必须是非负整数');
  return value;
}
export function weightedNoteTotal(notes: NoteCounts): number {
  const values = Object.values(notes);
  if (values.some((value) => !Number.isInteger(value) || value < 0)) throw new Error('物量必须是非负整数');
  const total = notes.tap + notes.touch + notes.hold * 2 + notes.slide * 3 + notes.break * 5;
  if (total === 0) throw new Error('总物量不能为零');
  return total;
}

export function calculateAchievement(notes: NoteCounts, judgments: JudgmentInput): number {
  const total = weightedNoteTotal(notes);
  let base = 0;
  (['tap', 'hold', 'slide', 'touch'] as const).forEach((kind) => {
    let entered = 0;
    (Object.keys(NORMAL_RATIO) as NormalJudgment[]).forEach((judgment) => {
      const count = validCount(judgments[kind]?.[judgment]); entered += count;
      base += count * NOTE_WEIGHT[kind] * NORMAL_RATIO[judgment];
    });
    if (entered > notes[kind]) throw new Error(`${kind.toUpperCase()} 判定数超过物量`);
    base += (notes[kind] - entered) * NOTE_WEIGHT[kind];
  });
  let breakEntered = 0;
  let breakBonus = 0;
  (Object.keys(BREAK_BASE) as BreakJudgment[]).forEach((judgment) => {
    const count = validCount(judgments.break?.[judgment]); breakEntered += count;
    base += count * BREAK_BASE[judgment]; breakBonus += count * BREAK_BONUS[judgment];
  });
  if (breakEntered > notes.break) throw new Error('BREAK 判定数超过物量');
  base += (notes.break - breakEntered) * 5;
  breakBonus += notes.break - breakEntered;
  return base / total * 100 + (notes.break ? breakBonus / notes.break : 0);
}

export function singleNoteLoss(notes: NoteCounts, kind: NoteKind, judgment: NormalJudgment | BreakJudgment): number {
  const total = weightedNoteTotal(notes);
  if (kind === 'break') {
    if (!notes.break) throw new Error('零 BREAK 谱面无法计算 BREAK 容错');
    const key = judgment as BreakJudgment;
    return (5 - BREAK_BASE[key]) / total * 100 + (1 - BREAK_BONUS[key]) / notes.break;
  }
  return NOTE_WEIGHT[kind] * (1 - NORMAL_RATIO[judgment as NormalJudgment]) / total * 100;
}

export function maximumSameErrors(notes: NoteCounts, target: number, kind: NoteKind, judgment: NormalJudgment | BreakJudgment): number {
  if (!Number.isFinite(target) || target < 0 || target > 101) throw new Error('目标达成率必须在 0% 到 101% 之间');
  const loss = singleNoteLoss(notes, kind, judgment);
  if (loss <= 0) return notes[kind];
  return Math.min(notes[kind], Math.max(0, Math.floor((101 - target + 1e-10) / loss)));
}
