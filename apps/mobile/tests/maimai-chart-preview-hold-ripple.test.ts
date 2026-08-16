import { describe, expect, it } from 'vitest';
import { holdRipplePhase } from '@/features/maimai-chart-preview/engine/renderers/NoteRenderer';
import type { HoldStartNote } from '@/features/maimai-chart-preview/engine/types';

// duration（拍）× bpm → hold 持续毫秒：60000 × duration / bpm。
function makeHold(timingMs: number, duration: number, bpm: number): HoldStartNote {
  return {
    type: 'hold-start',
    position: 1,
    timing: 0,
    timingMs,
    measure: 1,
    positionInMeasure: 0,
    scale: 1,
    bpm,
    duration,
    isHoldStart: true,
  };
}

describe('holdRipplePhase', () => {
  it('hold 开始前不生成波纹', () => {
    const hold = makeHold(1000, 1, 200); // 持续 300ms
    expect(holdRipplePhase(hold, 999.999)).toBeNull();
  });

  it('hold 开始瞬间生成第 0 个波纹，progress 为 0', () => {
    const hold = makeHold(1000, 1, 200);
    expect(holdRipplePhase(hold, 1000)).toEqual({ generateMs: 1000, progress: 0 });
  });

  it('按 0.1s 间隔生成新波纹，与扩散时长无缝衔接', () => {
    const hold = makeHold(1000, 2, 400); // 持续 300ms
    expect(holdRipplePhase(hold, 1099)).toEqual({ generateMs: 1000, progress: 0.99 });
    // 上一圈消失的瞬间下一圈生成，无空窗期
    expect(holdRipplePhase(hold, 1100)).toEqual({ generateMs: 1100, progress: 0 });
    expect(holdRipplePhase(hold, 1149)).toEqual({ generateMs: 1100, progress: 0.49 });
  });

  it('单个波纹扩散 0.1s 完成，全程无空窗', () => {
    const hold = makeHold(0, 1, 200); // 持续 300ms，结束时刻恰为 300（整除 100）
    expect(holdRipplePhase(hold, 50)).toEqual({ generateMs: 0, progress: 0.5 });
    expect(holdRipplePhase(hold, 99)).toEqual({ generateMs: 0, progress: 0.99 });
    expect(holdRipplePhase(hold, 100)).toEqual({ generateMs: 100, progress: 0 });
    expect(holdRipplePhase(hold, 200)).toEqual({ generateMs: 200, progress: 0 });
    expect(holdRipplePhase(hold, 299)).toEqual({ generateMs: 200, progress: 0.99 });
  });

  it('长 hold 中段波纹序号正确', () => {
    const hold = makeHold(0, 8, 240); // 持续 2000ms
    // 1000ms：k=10，恰为第 10 个波纹生成瞬间
    expect(holdRipplePhase(hold, 1000)).toEqual({ generateMs: 1000, progress: 0 });
    // 1050ms：第 10 个波纹扩散到一半
    expect(holdRipplePhase(hold, 1050)).toEqual({ generateMs: 1000, progress: 0.5 });
  });

  it('hold 结束后不再生成新波纹，最后一圈自然扩散消亡', () => {
    const hold = makeHold(0, 1, 200); // 持续 300ms，结束时刻恰为 300（整除 100）
    // 结束时刻 300 允许生成最后一圈（g=300 ≤ end），399ms 时仍可见
    expect(holdRipplePhase(hold, 300)).toEqual({ generateMs: 300, progress: 0 });
    expect(holdRipplePhase(hold, 399)).toEqual({ generateMs: 300, progress: 0.99 });
    // 400ms：该波纹扩散完毕
    expect(holdRipplePhase(hold, 400)).toBeNull();
    // 450ms：k=4 → generateMs=400 > 300，不生成
    expect(holdRipplePhase(hold, 450)).toBeNull();
  });

  it('短 hold（不足一个间隔）仅第 0 个波纹', () => {
    const hold = makeHold(0, 0.5, 400); // 持续 75ms
    expect(holdRipplePhase(hold, 0)).toEqual({ generateMs: 0, progress: 0 });
    expect(holdRipplePhase(hold, 74)).toEqual({ generateMs: 0, progress: 0.74 });
    // 75ms 为 hold 结束：k=0 波纹 t=75 < 100 仍可见
    expect(holdRipplePhase(hold, 75)).toEqual({ generateMs: 0, progress: 0.75 });
    expect(holdRipplePhase(hold, 100)).toBeNull();
  });

  it('拍与 BPM 换算持续毫秒', () => {
    const hold = makeHold(0, 2, 120); // 持续 1000ms
    // 950ms：k=9 → g=900 ≤ 1000，t=50 → progress 0.5
    expect(holdRipplePhase(hold, 950)).toEqual({ generateMs: 900, progress: 0.5 });
    // 1000ms：恰为结束时刻，允许生成最后一圈（g=1000 ≤ 1000）
    expect(holdRipplePhase(hold, 1000)).toEqual({ generateMs: 1000, progress: 0 });
  });
});
