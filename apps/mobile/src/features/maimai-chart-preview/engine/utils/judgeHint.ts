export type JudgeHintMode = 'distinguish' | 'unified' | 'hidden';

export const DEFAULT_JUDGE_HINT: JudgeHintMode = 'distinguish';

export function parseJudgeHint(value: unknown): JudgeHintMode {
  if (value === 'distinguish' || value === 'unified' || value === 'hidden') return value;
  return DEFAULT_JUDGE_HINT;
}

export type JudgeTextKind = 'cPerfect' | 'perfect' | 'cPerfectBreak';

export function judgeHintTapHoldTouchText(
  mode: JudgeHintMode,
  isBreak: boolean,
): JudgeTextKind | null {
  if (mode === 'hidden') return null;
  if (mode === 'distinguish') return isBreak ? 'cPerfectBreak' : 'cPerfect';
  return 'perfect';
}

export function judgeTextSkinPath(kind: JudgeTextKind): string {
  switch (kind) {
    case 'cPerfect':
      return 'JudgeTextSkins/judge_text_cPerfect.png';
    case 'perfect':
      return 'JudgeTextSkins/judge_text_perfect.png';
    case 'cPerfectBreak':
      return 'JudgeTextSkins/judge_text_cPerfect_break.png';
  }
}
