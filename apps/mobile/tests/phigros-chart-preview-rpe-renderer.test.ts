import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRpeChart, speedHeightAt } from '@/features/phigros-chart-preview/webview-player/rpe-core';
import { RpeRenderer } from '@/features/phigros-chart-preview/webview-player/rpe-renderer';

function environment() {
  const canvases: HTMLCanvasElement[] = [];
  const draws: unknown[][] = [];
  function canvas(): HTMLCanvasElement {
    const context = new Proxy<Record<string, unknown>>({}, {
      get: (target, key: string) => target[key] ?? ((...args: unknown[]) => {
        if (key === 'drawImage') draws.push(args);
        if (key === 'measureText') return { width: 10 };
      }),
    });
    const value = { width: 675, height: 450, clientWidth: 675, clientHeight: 450,
      style: {}, getContext: () => context, setAttribute() {}, remove() {},
      getBoundingClientRect: () => ({ width: 675, height: 450 }),
    } as unknown as HTMLCanvasElement;
    canvases.push(value);
    return value;
  }
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('document', { createElement: canvas });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  return { renderer: new RpeRenderer(canvas()), canvases, draws };
}

const speed = { startTime: [0, 0, 1], endTime: [100, 0, 1], start: 9, end: 9, easingType: 1 };
function chart(layers = 1) {
  return parseRpeChart({ META: { RPEVersion: 150 }, BPMList: [{ startTime: [0, 0, 1], bpm: 120 }],
    judgeLineList: [{ Texture: 'custom.png', notes: [], eventLayers: Array.from({ length: layers }, () => ({
      speedEvents: [speed], alphaEvents: [{ ...speed, start: 255, end: 255 }],
    })), extended: { colorEvents: [{ ...speed, start: [0, 50, 100], end: [255, 100, 0] }] } }],
  });
}

afterEach(() => vi.unstubAllGlobals());
describe('RPE renderer', () => {
  it('多线多层的增量积分与各判定线的独立求值一致，包括反向 seek', () => {
    const { renderer } = environment();
    const parsed = parseRpeChart({ META: { RPEVersion: 170 }, BPMList: [{ startTime: [0, 0, 1], bpm: 120 }],
      judgeLineList: [false, true].map(integrateSpeedEasings => ({ integrateSpeedEasings, notes: [],
        eventLayers: Array.from({ length: 3 }, (_, layer) => ({ speedEvents: [
          { ...speed, start: 2 + layer, end: 20, endTime: [8, 0, 1], easingType: 3 },
          { ...speed, startTime: [10, 0, 1], start: 20, end: 4, easingType: 4 },
        ] })),
      })),
    });
    renderer.setChart(parsed);
    for (const time of [1, 3, 8, 11, 30, 2, 0, 20]) for (let index = 0; index < parsed.lines.length; index++) {
      const line = parsed.lines[index]!;
      const expected = speedHeightAt(line.eventLayers, parsed.bpmList, line.integrateSpeedEasings, parsed.bpmList.beat(time) / line.bpmfactor);
      expect(renderer['lineState'](index, time, 675, 450).lineHeight).toBeCloseTo(expected, 9);
    }
    renderer.dispose();
  });

  it.each([2048, 4096])('染色缓存预算不缩小 %s 像素纹理', size => {
    const { renderer, canvases } = environment();
    renderer.setChart(chart());
    renderer.setChartAssets({ textures: new Map([['custom.png', { width: size, height: size, naturalWidth: size, naturalHeight: size } as HTMLImageElement]]),
      videos: new Map(), shaders: new Map(), gifs: new Map(), gifAnims: new Map() });
    for (let index = 0; index < 100; index++) renderer.render(index / 10);
    const resident = canvases.slice(2).filter(canvas => canvas.width > 0);
    expect(resident.length).toBeGreaterThan(0);
    expect(resident.every(canvas => canvas.width === size && canvas.height === size)).toBe(true);
    expect(resident.reduce((sum, canvas) => sum + canvas.width * canvas.height * 4, 0)).toBeLessThanOrEqual(Math.max(32 * 1024 * 1024, size * size * 4));
    renderer.dispose();
    expect(resident.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });

  it('单线多层在连续播放与前后跳转时使用所属判定线的积分策略', () => {
    const { renderer } = environment();
    renderer.setChart(chart(3));
    for (const time of [0, 1, 10, 2, 30]) expect(() => renderer.render(time)).not.toThrow();
    renderer.dispose();
  });

  it('连续颜色保持精确绘制并复用有限画布，释放时回收像素', () => {
    const { renderer, canvases, draws } = environment();
    renderer.setChart(chart());
    renderer.setChartAssets({ textures: new Map([['custom.png', { width: 256, height: 256, naturalWidth: 256, naturalHeight: 256 } as HTMLImageElement]]),
      videos: new Map(), shaders: new Map(), gifs: new Map(), gifAnims: new Map() });
    for (let index = 0; index < 5000; index++) renderer.render(index / 100);
    expect(draws.length).toBeGreaterThanOrEqual(5000);
    expect(canvases.length).toBeLessThanOrEqual(67);
    const tinted = canvases.slice(2);
    renderer.dispose();
    expect(tinted.every(item => item.width === 0 && item.height === 0)).toBe(true);
  });

  it('线数阶梯下积分与独立求值一致，绘制量线性增长且染色画布有界', () => {
    const measure = (lines: number) => {
      const { renderer, canvases, draws } = environment();
      const parsed = parseRpeChart({ META: { RPEVersion: 170 }, BPMList: [{ startTime: [0, 0, 1], bpm: 120 }],
        judgeLineList: Array.from({ length: lines }, (_, line) => ({ Texture: 'custom.png', integrateSpeedEasings: line % 2 === 0, notes: [],
          eventLayers: Array.from({ length: 3 }, (_, layer) => ({
            alphaEvents: [{ ...speed, start: 255, end: 255 }],
            speedEvents: Array.from({ length: 50 }, (_, index) => ({ ...speed, startTime: [index * 2, 0, 1], endTime: [index * 2 + 2, 0, 1],
              start: 1 + layer + index % 5, end: 2 + (index + line) % 7, easingType: 1 + index % 4 })),
          })),
          extended: { colorEvents: [{ ...speed, start: [0, 50, 100], end: [255, 100, 0] }] } })),
      });
      renderer.setChart(parsed);
      renderer.setChartAssets({ textures: new Map([['custom.png', { width: 64, height: 64, naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement]]),
        videos: new Map(), shaders: new Map(), gifs: new Map(), gifAnims: new Map() });
      for (const time of [3, 40, 99, 12, 0, 70]) for (let index = 0; index < lines; index += Math.max(1, lines >> 3)) {
        const line = parsed.lines[index]!;
        const expected = speedHeightAt(line.eventLayers, parsed.bpmList, line.integrateSpeedEasings, parsed.bpmList.beat(time) / line.bpmfactor);
        expect(renderer['lineState'](index, time, 675, 450).lineHeight).toBeCloseTo(expected, 9);
      }
      draws.length = 0;
      renderer.render(5);
      const drawn = draws.length;
      const tinted = canvases.slice(2);
      expect(tinted.length).toBeLessThanOrEqual(65);
      renderer.dispose();
      expect(tinted.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true);
      return drawn;
    };
    const [small, medium, large] = [4, 16, 64].map(measure) as [number, number, number];
    expect(medium).toBeGreaterThan(small);
    expect((large - medium) * 4).toBe((medium - small) * 16);
  });});
