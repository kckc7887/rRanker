import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRpeChart } from '@/features/phigros-chart-preview/webview-player/rpe-core';
import { RpeRenderer } from '@/features/phigros-chart-preview/webview-player/rpe-renderer';

function environment() {
  const calls = new Map<HTMLCanvasElement, unknown[][]>();
  function canvas(): HTMLCanvasElement {
    const draws: unknown[][] = [];
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
    calls.set(value, draws);
    return value;
  }
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('document', { createElement: canvas });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const stage = canvas();
  return { renderer: new RpeRenderer(stage), draws: calls.get(stage)! };
}

const speed = { startTime: [0, 0, 1], endTime: [100, 0, 1], start: 9, end: 9, easingType: 1 };
function chart() {
  return parseRpeChart({ META: { RPEVersion: 150 }, BPMList: [{ startTime: [0, 0, 1], bpm: 120 }],
    judgeLineList: [{ Texture: 'custom.png', notes: [], eventLayers: [{
      speedEvents: [speed], alphaEvents: [{ ...speed, start: 255, end: 255 }],
    }], extended: { colorEvents: [{ ...speed, start: [0, 50, 100], end: [255, 100, 0] }] } }],
  });
}

function image(size: number): HTMLImageElement {
  return { width: size, height: size, naturalWidth: size, naturalHeight: size } as HTMLImageElement;
}

afterEach(() => vi.unstubAllGlobals());
describe('RPE renderer', () => {
  it.each([2048, 4096])('染色后保留 %s 像素纹理并在释放时回收', size => {
    const { renderer, draws } = environment();
    renderer.setChart(chart());
    renderer.setChartAssets({ textures: new Map([['custom.png', image(size)]]),
      videos: new Map(), shaders: new Map(), gifs: new Map(), gifAnims: new Map() });
    renderer.render(0);
    const texture = draws.at(-1)?.[0] as HTMLCanvasElement;
    expect([texture.width, texture.height]).toEqual([size, size]);
    renderer.dispose();
    expect([texture.width, texture.height]).toEqual([0, 0]);
  });

  it('颜色插值在播放与反向跳转后仍正确绘制', () => {
    const { renderer, draws } = environment();
    renderer.setChart(chart());
    renderer.setChartAssets({ textures: new Map([['custom.png', image(256)]]),
      videos: new Map(), shaders: new Map(), gifs: new Map(), gifAnims: new Map() });
    for (const [time, color] of [[0, 'rgb(0,50,100)'], [25, 'rgb(127.5,75,50)'], [0, 'rgb(0,50,100)']] as const) {
      renderer.render(time);
      const texture = draws.at(-1)?.[0] as HTMLCanvasElement;
      expect(texture.getContext('2d')!.fillStyle).toBe(color);
    }
    renderer.dispose();
  });

  it('多层速度决定绘制位置，前后跳转不会留下旧位置', () => {
    const { renderer, draws } = environment();
    renderer.setChart(parseRpeChart({ META: { RPEVersion: 170 }, BPMList: [{ startTime: [0, 0, 1], bpm: 120 }],
      judgeLineList: [{ notes: [{ type: 1, startTime: [2, 0, 1], visibleTime: 2, positionX: 0, above: 1, speed: 1 }],
        eventLayers: [1, 1, 1].map(value => ({
          speedEvents: [{ ...speed, start: value, end: value }],
          alphaEvents: [{ ...speed, start: 85, end: 85 }],
        })),
      }],
    }));
    const tap = image(100);
    const notes = { tap, drag: tap, flick: tap, hold: tap };
    renderer.setNoteAssets({ normal: notes, multi: notes, fx: tap });
    /** 2 拍为 1 秒；三层速度合计 3，450px 高度下每秒移动 180px。 */
    for (const [time, distance] of [[0, 180], [0.5, 90], [0.75, 45], [0.25, 135]]) {
      renderer.render(time!);
      const drawn = draws.findLast(args => args[0] === tap)!;
      expect(Number(drawn[2]) + Number(drawn[4]) / 2).toBeCloseTo(distance!);
    }
    renderer.dispose();
  });
});
