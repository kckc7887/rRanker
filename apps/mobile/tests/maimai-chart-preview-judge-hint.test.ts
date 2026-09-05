import { describe, expect, it } from 'vitest';
import {
  judgeHintTapHoldTouchText,
  judgeTextSkinPath,
  parseJudgeHint,
} from '@/features/maimai-chart-preview/engine/utils/judgeHint';
import { parseSimaiBody } from '@/features/maimai-chart-preview/engine/core/parser/SimaiParser';
import { prepareChart, buildFrame } from '@/features/maimai-chart-preview/engine/renderers/frame';
import { DEFAULT_RENDERER_CONFIG } from '@/features/maimai-chart-preview/engine/renderers/MainRenderer';

describe('judge hint selection', () => {
  it('defaults missing or unknown values to distinguish', () => {
    expect(parseJudgeHint(undefined)).toBe('distinguish');
    expect(parseJudgeHint('')).toBe('distinguish');
    expect(parseJudgeHint('perfect')).toBe('distinguish');
    expect(parseJudgeHint('unified')).toBe('unified');
    expect(parseJudgeHint('hidden')).toBe('hidden');
  });

  it('picks tap/hold/touch text for each mode', () => {
    expect(judgeHintTapHoldTouchText('distinguish', false)).toBe('cPerfect');
    expect(judgeHintTapHoldTouchText('distinguish', true)).toBe('cPerfectBreak');
    expect(judgeHintTapHoldTouchText('unified', true)).toBe('perfect');
    expect(judgeHintTapHoldTouchText('hidden', false)).toBeNull();
  });

  it('maps judge text kinds to skin paths', () => {
    expect(judgeTextSkinPath('cPerfect')).toBe('JudgeTextSkins/judge_text_cPerfect.png');
    expect(judgeTextSkinPath('perfect')).toBe('JudgeTextSkins/judge_text_perfect.png');
    expect(judgeTextSkinPath('cPerfectBreak')).toBe('JudgeTextSkins/judge_text_cPerfect_break.png');
  });
  it('uses the prefab offset and alternating Break cover', () => {
    const chart = prepareChart(parseSimaiBody('(120)1b,'));
    const hint = (time: number) => buildFrame(chart, time, DEFAULT_RENDERER_CONFIG).find(c => c.path.startsWith('JudgeTextSkins/'))!;
    expect(Math.hypot(hint(2010).x, hint(2010).y)).toBeCloseTo(3.8);
    expect(hint(2010).angle).toBeCloseTo(-Math.PI / 8);
    expect(hint(2010).path).toBe(judgeTextSkinPath('cPerfect'));
    expect(hint(2050).path).toBe(judgeTextSkinPath('cPerfectBreak'));
    expect(hint(2090).path).toBe(judgeTextSkinPath('cPerfect'));
  });
});
