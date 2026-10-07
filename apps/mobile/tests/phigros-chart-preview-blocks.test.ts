import { describe, expect, it } from 'vitest';
import { parsePgrChart } from '@/features/phigros-chart-preview/webview-player/pgr-core';
import { indexPgrBlocks, parsePgrBlocks, pgrBlockEase, samplePgrBlock } from '@/features/phigros-chart-preview/webview-player/pgr-blocks';
import { CHART_PREVIEW_MAX_EVENTS, ChartPreviewBudgetExceededError } from '@/features/chart-preview-shared/chart-preview-resource-budget';

const vector = (x: number, y: number) => ({ x, y });
function block(overrides: Record<string, unknown> = {}) {
  return { bottomLeftPercentage: vector(.2, .3), topRightPercentage: vector(.4, .5),
    appearTime: 2, enableTime: 4, disableTime: 8, disappearTime: 10, isSubtract: false,
    moveEvents: [], rotateEvents: [], scaleEvents: [], ...overrides };
}
const parsed = (overrides: Record<string, unknown> = {}) => parsePgrBlocks([block(overrides)])[0]!;
const at = (overrides: Record<string, unknown>, time: number, aspect = 1) => samplePgrBlock(parsed(overrides), time, aspect);
const move = (time: number, x: number, y: number, easeTypeX = 0, easeTypeY = 0) => ({ time, endPosition: vector(x, y), easeTypeX, easeTypeY });

describe('PGR block regions', () => {
  it('缺少区域、空数组和不合法容器不会改变旧谱', () => {
    for (const input of [undefined, null, {}, []]) expect(parsePgrBlocks(input)).toEqual([]);
    for (const formatVersion of [1, 3]) {
      const chart = { formatVersion, judgeLineList: [{ bpm: 90,
        speedEvents: [{ startTime: 0, endTime: 32, value: 1 }] }] };
      const before = parsePgrChart(chart);
      expect(parsePgrChart({ ...chart, blockAreaList: [] })).toEqual(before);
      const after = parsePgrChart({ ...chart, blockAreaList: [block()] });
      expect(after.lines).toEqual(before.lines);
      expect(after.stats.noteCount).toBe(0);
      expect(after.stats.maxTime).toBe(10);
    }
  });

  it('秒时间、渐入、启用、渐出与退出边界独立于 BPM', () => {
    expect(at({}, 1.99)).toBeNull();
    expect(at({}, 2)).toBeNull();
    expect(at({}, 3)).toMatchObject({ opacity: .5, enabled: false });
    expect(at({}, 4)).toMatchObject({ opacity: 1, enabled: true });
    expect(at({}, 8)).toMatchObject({ opacity: 1, enabled: false });
    expect(at({}, 9)).toMatchObject({ opacity: .5, enabled: false });
    expect(at({}, 10)).toBeNull();
    expect(at({}, Number.NaN)).toBeNull();
  });

  it('零长度和提前消失时间不会除零或延长渐出', () => {
    expect(at({ appearTime: 4, disappearTime: 8 }, 4)?.opacity).toBe(1);
    expect(at({ disappearTime: 0 }, 7)?.opacity).toBe(1);
    expect(at({ disappearTime: 0 }, 8)).toBeNull();
    expect(at({ appearTime: 4, enableTime: 4, disableTime: 4, disappearTime: 4 }, 4)).toBeNull();
  });

  it('判定范围只服从启用区间，显示生命周期与透明度不改变范围', () => {
    const region = parsed({ appearTime: 9, enableTime: 4, disableTime: 8, disappearTime: 3 });
    expect(samplePgrBlock(region, 5, 1)).toBeNull();
    const enabled = samplePgrBlock(region, 4, 1, true)!;
    expect(enabled.opacity).toBe(1);
    expect(enabled.enabled).toBe(true);
    expect(enabled.corners[0][0]).toBeCloseTo(.2);
    expect(enabled.corners[0][1]).toBeCloseTo(.3);
    expect(samplePgrBlock(region, 3.99, 1, true)).toBeNull();
    expect(samplePgrBlock(region, 8, 1, true)).toBeNull();
    expect(indexPgrBlocks([region])(5)).toEqual([]);
    expect(indexPgrBlocks([region], true)(5)).toContain(region);
    expect(indexPgrBlocks([region], true)(3)).toEqual([]);
    expect(indexPgrBlocks([region], true)(9)).toEqual([]);
    expect(samplePgrBlock(parsed(), 3, 1, true)).toBeNull();
    expect(samplePgrBlock(parsed(), 9, 1, true)).toBeNull();
    expect(samplePgrBlock(parsed({ enableTime: 4, disableTime: 4 }), 4, 1, true)).toBeNull();
  });

  it('判定范围在不可见阶段仍应用负缩放、屏幕比例旋转与移动', () => {
    const region = parsed({ appearTime: 9,
      bottomLeftPercentage: vector(.2, .2), topRightPercentage: vector(.4, .4),
      rotateEvents: [{ time: 4, rotation: 90, anchor: vector(.2, .2), easeType: 0 }],
      scaleEvents: [{ time: 4, scale: vector(-2, .5), anchor: vector(.2, .2), easeTypeX: 0, easeTypeY: 0 }],
      moveEvents: [move(4, .4, .5)],
    });
    const corners = samplePgrBlock(region, 5, 2, true)!.corners;
    expect(corners[0][0]).toBeCloseTo(.3); expect(corners[0][1]).toBeCloseTo(.4);
    expect(corners[1][0]).toBeCloseTo(.3); expect(corners[1][1]).toBeCloseTo(-.4);
    expect(corners[2][0]).toBeCloseTo(.25); expect(corners[2][1]).toBeCloseTo(-.4);
  });

  it('阶段时间不重排；提前启用或禁用时仍可显示有效的出现与消失阶段', () => {
    expect(at({ appearTime: 5 }, 5)).toMatchObject({ enabled: true, opacity: 1 });
    expect(at({ enableTime: 9, disableTime: 1 }, 5.5)).toMatchObject({ enabled: false, opacity: .5 });
    expect(at({ appearTime: 9, disableTime: 8 }, 9.5)).toMatchObject({ enabled: false, opacity: .25 });
    expect(parsePgrBlocks([block({ disappearTime: 0 })])).toHaveLength(1);
  });

  it('拒绝非数值字段，保留屏幕外和反向矩形，并独立过滤坏关键帧', () => {
    const valid = block({ bottomLeftPercentage: vector(2, 3), topRightPercentage: vector(-1, -2),
      moveEvents: [move(4, .2, .2), move(Number.NaN, 0, 0), { ...move(6, 0, 0), endPosition: null }] });
    const result = parsePgrBlocks([null, block({ enableTime: null }), block({ appearTime: '2' }),
      block({ disableTime: Infinity }), block({ topRightPercentage: { x: 1 } }), valid]);
    expect(result).toHaveLength(1);
    expect(result[0]!.bounds).toEqual([-1, -2, 2, 3]);
    expect(result[0]!.move).toHaveLength(1);
  });

  it('首帧之前为恒等，之后使用绝对目标位置且分别应用起始帧缓动', () => {
    const config = { moveEvents: [move(5, .3, .4, 4, 2), move(7, .7, .8, 13, 13)] };
    expect(at(config, 4)!.corners[0][0]).toBeCloseTo(.2);
    expect(at(config, 4)!.corners[0][1]).toBeCloseTo(.3);
    const corner = at(config, 6)!.corners[0];
    expect(corner[0]).toBeCloseTo(.3);
    expect(corner[1]).toBeCloseTo(.3 + .4 * Math.SQRT1_2);
    expect(at(config, 9)!.corners[0][0]).toBeCloseTo(.6);
  });

  it('同一时间的后写关键帧优先，跳跃缓动在段边界可复现', () => {
    const config = { moveEvents: [move(6, .8, .8), move(4, .3, .4, 13), move(4, .5, .4, 14)] };
    expect(at(config, 4.1)!.corners[0][0]).toBeCloseTo(.7);
    const hold = { moveEvents: [move(4, .3, .4, 13), move(6, .8, .4)] };
    expect(at(hold, 5.9)!.corners[0][0]).toBeCloseTo(.2);
    expect(at(hold, 6)!.corners[0][0]).toBeCloseTo(.7);
  });

  it('先在区域轴上缩放，再按屏幕度量绕锚点旋转，最后移动', () => {
    const transform = {
      bottomLeftPercentage: vector(.2, .2), topRightPercentage: vector(.4, .4),
      rotateEvents: [{ time: 4, rotation: 90, anchor: vector(.2, .2), easeType: 0 }],
      scaleEvents: [{ time: 4, scale: vector(2, .5), anchor: vector(.2, .2), easeTypeX: 0, easeTypeY: 0 }],
      moveEvents: [move(4, .4, .5)],
    };
    const corners = at(transform, 5, 2)!.corners;
    expect(corners[0][0]).toBeCloseTo(.3); expect(corners[0][1]).toBeCloseTo(.4);
    expect(corners[1][0]).toBeCloseTo(.3); expect(corners[1][1]).toBeCloseTo(1.2);
    expect(corners[2][0]).toBeCloseTo(.25); expect(corners[2][1]).toBeCloseTo(1.2);
  });

  it('负缩放保留翻转几何，isSubtract 保留为独立合成通道', () => {
    const sample = at({ isSubtract: true, scaleEvents: [{ time: 4, scale: vector(-1, 0), anchor: vector(.3, .4) }] }, 6)!;
    expect(sample.subtract).toBe(true);
    expect(sample.corners[0][0]).toBeCloseTo(.4);
    expect(sample.corners[1][0]).toBeCloseTo(.2);
    expect(sample.corners.every(p => p[1] === .4)).toBe(true);
  });

  it('缩放两轴独立缓动，切换关键帧后不沿用上一个轴的曲线', () => {
    const config = { scaleEvents: [
      { time: 4, scale: vector(1, 1), anchor: vector(.2, .3), easeTypeX: 4, easeTypeY: 13 },
      { time: 6, scale: vector(3, 2), anchor: vector(.2, .3), easeTypeX: 13, easeTypeY: 0 },
      { time: 8, scale: vector(1, 4), anchor: vector(.2, .3) },
    ] };
    expect(at(config, 5)!.corners[2][0]).toBeCloseTo(.5);
    expect(at(config, 5)!.corners[2][1]).toBeCloseTo(.5);
    expect(at(config, 7)!.corners[2][0]).toBeCloseTo(.8);
    expect(at(config, 7)!.corners[2][1]).toBeCloseTo(.9);
  });

  it('缓动表覆盖三组幂曲线与正弦、两种阶跃；未知编号为线性', () => {
    expect(pgrBlockEase(0, .25)).toBe(.25);
    expect(pgrBlockEase(4, .25)).toBe(.0625);
    expect(pgrBlockEase(7, .25)).toBe(.015625);
    expect(pgrBlockEase(10, .25)).toBe(.00390625);
    expect(pgrBlockEase(13, .5)).toBe(0); expect(pgrBlockEase(14, .5)).toBe(1);
    expect(pgrBlockEase(999, .25)).toBe(.25);
    for (let id = 0; id < 13; id++) {
      expect(pgrBlockEase(id, -1)).toBeCloseTo(0);
      expect(pgrBlockEase(id, 2)).toBeCloseTo(1);
    }
    for (const id of [3, 6, 9, 12]) expect(pgrBlockEase(id, .5)).toBeCloseTo(.5);
  });

  it('区间查询包含长区域并支持反向跳转', () => {
    const early = parsed({ appearTime: 0, enableTime: 1, disableTime: 2, disappearTime: 3 });
    const later = parsed({ appearTime: 20, enableTime: 21, disableTime: 22, disappearTime: 23 });
    const long = parsed({ appearTime: 0, disappearTime: 50 });
    const query = indexPgrBlocks([early, later, long]);
    expect(new Set(query(21))).toEqual(new Set([later, long]));
    expect(new Set(query(1))).toEqual(new Set([early, long]));
    expect(query(51)).toEqual([]);
    expect(new Set(query(21))).toEqual(new Set([later, long]));
  });

  it('区域及其关键帧计入有限事件预算，异常帧也不能绕过预算', () => {
    expect(() => parsePgrBlocks([block({ moveEvents: Array(CHART_PREVIEW_MAX_EVENTS).fill(null) })]))
      .toThrow(ChartPreviewBudgetExceededError);
  });
});
