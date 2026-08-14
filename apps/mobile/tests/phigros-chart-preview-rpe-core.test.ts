import { describe, expect, it } from 'vitest';
import {
  BpmList,
  buildGifAnim,
  easing,
  getEventValue,
  getIntegral,
  parseInfoYml,
  parseRpeChart,
  speedHeightAt,
  type RpeEvent,
  type RpeEventLayer,
} from '@/features/phigros-chart-preview/webview-player/rpe-core';
import { RPE_PRESET_SHADERS } from '@/features/phigros-chart-preview/webview-player/rpe-preset-shaders';

// 与 demo/phira-rpe-chart-preview/tests/rpe-core.test.mjs 同语义的移植测试：
// 缓动表顺序、速度积分、事件插值、音符归一化、父子线、extra.json/info.yml 解析。

function line(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Texture: 'line.png',
    eventLayers: [{
      moveXEvents: [{ startTime: [0, 0, 1], endTime: [4, 0, 1], start: 0, end: 675, easingType: 1 }],
      moveYEvents: [{ startTime: [0, 0, 1], endTime: [4, 0, 1], start: 0, end: 450, easingType: 1 }],
      rotateEvents: [{ startTime: [0, 0, 1], endTime: [4, 0, 1], start: 0, end: 90, easingType: 1 }],
      alphaEvents: [{ startTime: [0, 0, 1], endTime: [4, 0, 1], start: 0, end: 255, easingType: 1 }],
      speedEvents: [{ startTime: [0, 0, 1], endTime: [8, 0, 1], start: 9, end: 9, easingType: 1 }],
    }],
    notes: [],
    ...overrides,
  };
}

function note(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 1, above: 1, startTime: [0, 0, 1], endTime: [0, 0, 1],
    positionX: 0, yOffset: 0, alpha: 255, size: 1, speed: 1, isFake: 0, visibleTime: 0,
    ...overrides,
  };
}

const bpm120 = () => new BpmList([[0, 120]]);

function event(overrides: Partial<RpeEvent>): RpeEvent {
  return {
    startBeat: 0, endBeat: 4, start: 10, end: 20,
    easingType: 1, easingLeft: 0, easingRight: 1, bezier: 0, bezierPoints: [0, 0, 1, 1],
    ...overrides,
  };
}

function layer(speedEvents: RpeEvent[]): RpeEventLayer {
  return {
    speedEvents,
    moveXEvents: [],
    moveYEvents: [],
    rotateEvents: [],
    alphaEvents: [],
  };
}

describe('rpe core（demo 语义移植）', () => {
  it('BPMList：拍数与多 BPM 段时间/拍互转', () => {
    const b = new BpmList([[0, 120], [4, 60]]);
    expect(Math.abs(b.timeSec(4) - 2)).toBeLessThan(1e-9);
    expect(Math.abs(b.timeSec(8) - 6)).toBeLessThan(1e-9);
    expect(Math.abs(b.beat(6) - 8)).toBeLessThan(1e-9);
    expect(Math.abs(b.beat(1) - 2)).toBeLessThan(1e-9);
  });

  it('缓动表以 player-main 顺序：2=SineIn、3=SineOut、4=QuadOut、5=QuadIn、26=BounceOut', () => {
    expect(Math.abs(easing(1, undefined, 0.5) - 0.5)).toBeLessThan(1e-9);
    expect(Math.abs(easing(2, undefined, 0.5) - Math.sin(Math.PI / 4))).toBeLessThan(1e-9);
    expect(Math.abs(easing(3, undefined, 0.5) - (1 - Math.cos(Math.PI / 4)))).toBeLessThan(1e-9);
    expect(Math.abs(easing(4, undefined, 0.5) - 0.75)).toBeLessThan(1e-9);
    expect(Math.abs(easing(5, undefined, 0.5) - 0.25)).toBeLessThan(1e-9);
    // 截取区间：quadOut 在 [0.5,1] 上归一化，x=0.5 → 0.75
    expect(Math.abs(easing(4, undefined, 0.5, 0.5, 1) - 0.75)).toBeLessThan(1e-9);
    // bezier 线性等价
    expect(Math.abs(easing(1, [0, 0, 1, 1], 0.3) - 0.3)).toBeLessThan(1e-9);
  });

  it('事件值：区间内线性、区间外钳制为 start/end', () => {
    const bpm = bpm120();
    expect(getEventValue(event({}), 0, bpm)).toBe(10);
    expect(Math.abs((getEventValue(event({}), 2, bpm) as number) - 15)).toBeLessThan(1e-9);
    expect(getEventValue(event({}), 4, bpm)).toBe(20);
    expect(getEventValue(event({}), 8, bpm)).toBe(20);
    expect(getEventValue(event({}), -2, bpm)).toBe(10);
  });

  it('速度积分：恒定速度梯形、事件间恒定 end 速度延伸', () => {
    const bpm = bpm120();
    const layers = [layer([
      event({ start: 9, end: 9 }),
      event({ startBeat: 8, endBeat: 12, start: 18, end: 18 }),
    ])];
    // 0..4 拍 = 0..2s，速度 9 → 高度 18；事件后恒定 9 延伸：6 拍(3s) → 18+9=27
    expect(Math.abs(speedHeightAt(layers, bpm, false, 4) - 18)).toBeLessThan(1e-6);
    expect(Math.abs(speedHeightAt(layers, bpm, false, 6) - 27)).toBeLessThan(1e-6);
    // 10 拍(5s)：A 积分 18 + A 后延伸 18 + B 内积分 18 = 54
    expect(Math.abs(speedHeightAt(layers, bpm, false, 10) - 54)).toBeLessThan(1e-6);
  });

  it('速度积分：quadOut 事件与 player-main getIntegral 公式一致', () => {
    const bpm = bpm120();
    const ev = event({ start: 0, end: 18, easingType: 4 });
    // 参考公式（!integrateEasings）：k=(end-start)/(f'(1)-f'(0))，b=start-k·f'(0)，× lengthSec/Δbeats
    const f = (x: number) => 1 - (1 - x) * (1 - x);
    const df0 = (f(1e-12) - f(0)) / 1e-12;
    const df1 = (f(1) - f(1 - 1e-12)) / 1e-12;
    const k = 18 / (df1 - df0);
    const b = 0 - k * df0;
    const x = 0.5;
    const expected = (k * f(x) + b * x) * (2 / 4); // lengthSec=2s, Δbeats=4
    expect(Math.abs(getIntegral(ev, bpm, false, 2) - expected)).toBeLessThan(1e-6);
  });

  it('RPE 音符归一化：类型映射、时间、高度、yOffset×speed、fake/above', () => {
    const chart = parseRpeChart({
      META: { RPEVersion: 160, offset: 125 },
      BPMList: [{ bpm: 120, startTime: [0, 0, 1] }],
      judgeLineList: [line({ notes: [
        note({ type: 1, startTime: [2, 0, 1] }),
        note({ type: 2, startTime: [3, 0, 1], endTime: [6, 0, 1] }),
        note({ type: 3, startTime: [4, 0, 1] }),
        note({ type: 4, startTime: [5, 0, 1] }),
        note({ type: 1, above: 0, startTime: [2, 0, 1] }),
        note({ type: 1, isFake: 1, startTime: [7, 0, 1] }),
        note({ type: 1, positionX: -675, startTime: [8, 0, 1] }),
        note({ type: 1, yOffset: 100, speed: 2, startTime: [9, 0, 1] }),
      ] })],
    });
    expect(chart.offset).toBeCloseTo(0.125, 9);
    const notes = chart.lines[0]!.notes; // 已按 hitTime 排序
    expect(notes.map((n) => n.kind)).toEqual(['tap', 'tap', 'hold', 'flick', 'drag', 'tap', 'tap', 'tap']);
    expect(notes[1]!.above).toBe(false);
    expect(notes[5]!.isFake).toBe(true);
    expect(notes[6]!.positionX).toBe(-675);
    expect(notes[7]!.yOffset).toBe(200); // 100 × speed 2
    const hold = notes[2]!;
    expect(hold.endHitTime).toBeGreaterThan(hold.hitTime);
    expect(hold.tailHeight).toBeGreaterThanOrEqual(hold.headHeight);
    expect(chart.stats.kindCounts).toEqual({ tap: 4, drag: 1, hold: 1, flick: 1 });
  });

  it('判定线属性与 incline/父子线（循环父级报错）', () => {
    const chart = parseRpeChart({
      META: { RPEVersion: 160, offset: 0 },
      BPMList: [{ bpm: 120, startTime: [0, 0, 1] }],
      judgeLineList: [
        line({
          extended: { inclineEvents: [{ startTime: [0, 0, 1], endTime: [4, 0, 1], start: 0, end: 45, easingType: 1 }] },
          zOrder: 5,
          isCover: 0,
          bpmfactor: 2,
        }),
        line({ father: 0, rotateWithFather: true }),
      ],
    });
    expect(chart.lines[1]!.parent).toBe(0);
    expect(chart.lines[1]!.rotWithParent).toBe(true);
    expect(chart.lines[0]!.zIndex).toBe(5);
    expect(chart.lines[0]!.isCover).toBe(0);
    expect(chart.lines[0]!.bpmfactor).toBe(2);
    expect(chart.lines[0]!.inclineEvents.length).toBeGreaterThan(0);
    expect(() => parseRpeChart({
      META: { RPEVersion: 160, offset: 0 },
      BPMList: [{ bpm: 120, startTime: [0, 0, 1] }],
      judgeLineList: [line({ father: 1 }), line({ father: 0 })],
    })).toThrow(/循环/);
  });

  it('多押提示：同刻多音符标记 multipleHint', () => {
    const chart = parseRpeChart({
      META: { RPEVersion: 160, offset: 0 },
      BPMList: [{ bpm: 120, startTime: [0, 0, 1] }],
      judgeLineList: [
        line({ notes: [note({ startTime: [2, 0, 1] })] }),
        line({ notes: [note({ startTime: [2, 0, 1] })] }),
      ],
    });
    expect(chart.lines[0]!.notes[0]!.multipleHint).toBe(true);
    expect(chart.lines[1]!.notes[0]!.multipleHint).toBe(true);
  });

  it('extras 解析：视频/特效/事件值数组插值/文本事件/extra.bpm 覆盖', () => {
    const chart = parseRpeChart({
      META: { RPEVersion: 160, offset: 0, background: 'bg.jpg' },
      BPMList: [{ bpm: 120, startTime: [0, 0, 1] }],
      judgeLineList: [line({
        Texture: 'Tap.png',
        attachUI: 4,
        extended: {
          inclineEvents: [],
          scaleXEvents: [{ startTime: [0, 0, 1], endTime: [4, 0, 1], start: 1, end: 2, easingType: 1 }],
          textEvents: [{ startTime: [0, 0, 1], endTime: [4, 0, 1], start: 'hello', end: 'world', easingType: 1 }],
          colorEvents: [{ startTime: [0, 0, 1], endTime: [4, 0, 1], start: [255, 0, 0], end: [0, 255, 0], easingType: 1 }],
          gifEvents: [{ startTime: [0, 0, 1], endTime: [4, 0, 1], start: 0, end: 1, easingType: 1 }],
          paintEvents: [{ startTime: [0, 0, 1], endTime: [4, 0, 1], start: -1, end: 128, easingType: 1 }],
        },
        alphaControl: [{ x: 0, easing: 1, alpha: 1 }, { x: 100, easing: 1, alpha: 0 }],
        posControl: [{ x: 0, easing: 1, pos: 1 }, { x: 100, easing: 1, pos: 0.5 }],
        sizeControl: [{ x: 0, easing: 1, size: 1 }],
        yControl: [{ x: 0, easing: 1, y: 1 }],
        notes: [note({ tint: [255, 0, 0], tintHitEffects: [0, 255, 0], judgeArea: 0.5 })],
      })],
    }, {
      infoYml: 'backgroundDim: 0.6\naspectRatio: 1.7777778\nlineLength: 6.0\nforceAspectRatio: true\nholdPartialCover: true\nnoteUniformScale: true\nuseAttachUiFix: true\nname: Test Song\nlevel: IN Lv.16\n',
      extraJson: JSON.stringify({
        bpm: [{ time: [0, 0, 1], bpm: 240 }],
        videos: [{ path: 'v.mp4', time: [2, 0, 1], scale: 'cropCenter', alpha: 0.8, dim: [{ startTime: [0, 0, 1], endTime: [4, 0, 1], start: 0, end: 0.5, easingType: 1 }] }],
        effects: [{ shader: '/cam.glsl', start: [2, 0, 1], end: [6, 0, 1], global: true, line: 0, order: 0, vars: { offset: [{ startTime: [2, 0, 1], endTime: [4, 0, 1], start: [0, 0], end: [1, -1], easingType: 1 }], zoom: 1.5 } }],
      }),
    });
    expect(chart.background).toBe('bg.jpg');
    expect(chart.info.backgroundDim).toBe(0.6);
    expect(chart.info.forceAspectRatio).toBe(true);
    expect(chart.info.holdPartialCover).toBe(true);
    expect(chart.info.noteUniformScale).toBe(true);
    expect(chart.info.useAttachUiFix).toBe(true);
    expect(chart.info.name).toBe('Test Song');
    const line0 = chart.lines[0]!;
    expect(line0.texture).toBe('Tap.png');
    expect(line0.attachUI).toBe(4);
    expect(line0.colorEvents[0]!.start).toEqual([255, 0, 0]);
    expect(line0.gifEvents.length).toBe(1);
    expect(line0.paintEvents[0]!.end).toBe(128);
    expect(line0.alphaControl.map((c) => c.value)).toEqual([1, 0]);
    const note0 = line0.notes[0]!;
    expect(note0.tint).toEqual([255, 0, 0]);
    expect(note0.tintHitEffects).toEqual([0, 255, 0]);
    expect(note0.judgeArea).toBe(0.5);
    // extra.bpm 覆盖 BPMList：240bpm 下 4 拍 = 1s
    expect(chart.bpmList.timeSec(4)).toBe(1);
    expect(chart.extras.videos.length).toBe(1);
    const video = chart.extras.videos[0]!;
    expect(video.path).toBe('v.mp4');
    expect(video.alpha).toBe(0.8);
    expect(video.startTimeSec).toBe(0.5); // 2 拍 @240bpm = 0.5s
    const bpm = chart.bpmList;
    // 视频 dim 事件：数值插值
    const dimEvents = video.dim as RpeEvent[];
    expect(getEventValue(dimEvents[0]!, 0, bpm)).toBe(0);
    expect(getEventValue(dimEvents[0]!, 2, bpm)).toBe(0.25);
    expect(getEventValue(dimEvents[0]!, 4, bpm)).toBe(0.5);
    expect(chart.extras.effects.length).toBe(1);
    const effect = chart.extras.effects[0]!;
    expect(effect.shader).toBe('cam.glsl'); // 去掉前导 /
    const offsetEvents = effect.vars['offset'] as RpeEvent[];
    expect(getEventValue(offsetEvents[0]!, 3, bpm)).toEqual([0.5, -0.5]);
    expect(effect.vars['zoom']).toBe(1.5);
    // 文本事件值不做插值
    expect(getEventValue(line0.textEvents[0]!, 3, bpm)).toBe('hello');
    // 比例事件默认 1
    expect(getEventValue(line0.scaleXEvents[0]!, 0, bpm)).toBe(1);
  });

  it('info.yml 解析：缺失键与布尔键缺省', () => {
    expect(parseInfoYml(null)).toEqual({});
    expect(parseInfoYml('backgroundDim: 0.6\nforceAspectRatio: true\nname: 测试\n')).toEqual({
      backgroundDim: 0.6,
      forceAspectRatio: true,
      name: '测试',
    });
    expect(parseInfoYml('holdPartialCover: false\nuseAttachUiFix: false')).toEqual({
      holdPartialCover: false,
      useAttachUiFix: false,
    });
  });

  it('gif 判定线进度键帧：无效时长回退单键帧，其余按循环填充', () => {
    const bpm = bpm120();
    // totalMs 无效时仅回退起始键帧
    expect(buildGifAnim([], 0, bpm)).toEqual([{ t: 0, v: 0, easingType: 1, easingLeft: 0, easingRight: 1, bezier: 0, bezierPoints: [0, 0, 1, 1] }]);
    // 无事件也按循环填充到 2s 之外：首键帧 0/0，且包含 v=1 的循环跳变
    const empty = buildGifAnim([], 100, bpm);
    expect(empty[0]).toEqual({ t: 0, v: 0, easingType: 1, easingLeft: 0, easingRight: 1, bezier: 0, bezierPoints: [0, 0, 1, 1] });
    expect(empty.some((kf) => kf.v === 1)).toBe(true);
    // 事件在 [0,2] 拍（0..1s）生成 start/end 键帧：v 从 0 到 1
    const kfs = buildGifAnim([{
      startBeat: 0, endBeat: 2, start: 0, end: 1,
      easingType: 1, easingLeft: 0, easingRight: 1, bezier: 0, bezierPoints: [0, 0, 1, 1],
    }], 100, bpm);
    expect(kfs[0]!.t).toBe(0);
    expect(kfs.some((kf) => kf.v === 1)).toBe(true);
    expect(kfs.every((kf, index) => index === 0 || kfs[index - 1]!.t <= kf.t)).toBe(true);
  });

  it('prpr 内置特效预设内嵌齐全（10 个预设名 + 非空 GLSL 源）', () => {
    expect(Object.keys(RPE_PRESET_SHADERS).sort()).toEqual([
      'chromatic', 'circleBlur', 'fisheye', 'glitch', 'grayscale',
      'noise', 'pixel', 'radialBlur', 'shockwave', 'vignette',
    ]);
    for (const [name, source] of Object.entries(RPE_PRESET_SHADERS)) {
      expect(source, name).toContain('void main()');
      expect(source, name).toContain('screenTexture');
    }
  });
});
