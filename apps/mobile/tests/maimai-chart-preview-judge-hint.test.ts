import { describe, expect, it } from 'vitest';
import {
  eachLineSpan,
  judgeHintBreakScore,
  judgeHintSlideOk,
  judgeHintTapHoldTouchText,
  judgeTextSkinPath,
  parseJudgeHint,
  slideOkShape,
  slideOkSkinPath,
} from '@/features/maimai-chart-preview/engine/utils/judgeHint';

describe('judge hint selection', () => {
  it('defaults missing or unknown values to distinguish', () => {
    expect(parseJudgeHint(undefined)).toBe('distinguish');
    expect(parseJudgeHint('')).toBe('distinguish');
    expect(parseJudgeHint('perfect')).toBe('distinguish');
    expect(parseJudgeHint('unified')).toBe('unified');
    expect(parseJudgeHint('hidden')).toBe('hidden');
  });

  it('picks tap/hold/touch text and break scores for each mode', () => {
    expect(judgeHintTapHoldTouchText('distinguish', false)).toBe('cPerfect');
    expect(judgeHintTapHoldTouchText('distinguish', true)).toBe('cPerfectBreak');
    expect(judgeHintTapHoldTouchText('unified', true)).toBe('perfect');
    expect(judgeHintTapHoldTouchText('hidden', false)).toBeNull();
    expect(judgeHintBreakScore('distinguish', true)).toBe('break2600');
    expect(judgeHintBreakScore('unified', true)).toBe('break2550');
    expect(judgeHintBreakScore('distinguish', false)).toBeNull();
    expect(judgeHintBreakScore('hidden', true)).toBeNull();
  });

  it('picks slide OK banners and shape variants', () => {
    expect(judgeHintSlideOk('distinguish')).toBe('critical');
    expect(judgeHintSlideOk('unified')).toBe('just');
    expect(judgeHintSlideOk('hidden')).toBeNull();
    expect(slideOkShape('w', 1, 1)).toBe('wifi_u');
    expect(slideOkShape('w', 1, 5)).toBe('wifi_d');
    expect(slideOkShape('-', 1, 3)).toBe('str_r');
    expect(slideOkShape('-', 1, 8)).toBe('str_l');
    expect(slideOkSkinPath('str_l', 'critical')).toBe('SlideOKSkins/just_str_l_break.png');
    expect(slideOkSkinPath('wifi_u', 'just')).toBe('SlideOKSkins/just_wifi_u.png');
  });

  it('maps judge text kinds to skin paths and shortest each-line spans', () => {
    expect(judgeTextSkinPath('cPerfect')).toBe('JudgeTextSkins/judge_text_cPerfect.png');
    expect(judgeTextSkinPath('perfect')).toBe('JudgeTextSkins/judge_text_perfect.png');
    expect(judgeTextSkinPath('break2600')).toBe('JudgeTextSkins/judge_text_break_2600.png');
    expect(eachLineSpan(1, 2)).toBe(1);
    expect(eachLineSpan(1, 8)).toBe(1);
    expect(eachLineSpan(1, 5)).toBe(4);
    expect(eachLineSpan(1, 1)).toBeNull();
  });
});
