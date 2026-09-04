export type JudgeHintMode = 'distinguish' | 'unified' | 'hidden';

export const DEFAULT_JUDGE_HINT: JudgeHintMode = 'distinguish';

export function parseJudgeHint(value: unknown): JudgeHintMode {
  if (value === 'distinguish' || value === 'unified' || value === 'hidden') return value;
  return DEFAULT_JUDGE_HINT;
}

export type JudgeTextKind = 'cPerfect' | 'perfect' | 'cPerfectBreak' | 'break2600' | 'break2550';

export function judgeHintTapHoldTouchText(
  mode: JudgeHintMode,
  isBreak: boolean,
): JudgeTextKind | null {
  if (mode === 'hidden') return null;
  if (mode === 'distinguish') return isBreak ? 'cPerfectBreak' : 'cPerfect';
  return 'perfect';
}

export function judgeHintBreakScore(mode: JudgeHintMode, isBreak: boolean): 'break2600' | 'break2550' | null {
  if (!isBreak || mode === 'hidden') return null;
  return mode === 'distinguish' ? 'break2600' : 'break2550';
}

export type SlideOkKind = 'just' | 'critical';

export function judgeHintSlideOk(mode: JudgeHintMode): SlideOkKind | null {
  if (mode === 'hidden') return null;
  return mode === 'distinguish' ? 'critical' : 'just';
}

export type SlideOkShape = 'str_l' | 'str_r' | 'curv_l' | 'curv_r' | 'wifi_u' | 'wifi_d';

export function slideOkShape(
  slideType: string,
  startPos: number,
  endPos: number,
): SlideOkShape {
  if (slideType === 'w') {
    return endPos === 1 || endPos === 2 || endPos === 8 ? 'wifi_u' : 'wifi_d';
  }
  const cw = (((endPos - startPos) % 8) + 8) % 8;
  const left = cw > 4;
  if (slideType === '-') return left ? 'str_l' : 'str_r';
  return left ? 'curv_l' : 'curv_r';
}

export function judgeTextSkinPath(kind: JudgeTextKind): string {
  switch (kind) {
    case 'cPerfect':
      return 'JudgeTextSkins/judge_text_cPerfect.png';
    case 'perfect':
      return 'JudgeTextSkins/judge_text_perfect.png';
    case 'cPerfectBreak':
      return 'JudgeTextSkins/judge_text_cPerfect_break.png';
    case 'break2600':
      return 'JudgeTextSkins/judge_text_break_2600.png';
    case 'break2550':
      return 'JudgeTextSkins/judge_text_break_2550.png';
  }
}

export function slideOkSkinPath(shape: SlideOkShape, kind: SlideOkKind): string {
  const suffix = kind === 'critical' ? '_break' : '';
  return `SlideOKSkins/just_${shape}${suffix}.png`;
}

export function eachLineSpan(a: number, b: number): 1 | 2 | 3 | 4 | null {
  const raw = Math.abs(a - b);
  const span = Math.min(raw, 8 - raw);
  if (span < 1 || span > 4) return null;
  return span as 1 | 2 | 3 | 4;
}
