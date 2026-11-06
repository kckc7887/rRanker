import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePgrBlocks } from '@/features/phigros-chart-preview/webview-player/pgr-blocks';
import { parsePgrChart } from '@/features/phigros-chart-preview/webview-player/pgr-core';
import { PgrRenderer } from '@/features/phigros-chart-preview/webview-player/renderer';

function environment(compile = true) {
  const alive = new Set<object>();
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  const constants = new Map<string, number>();
  const loseContext = vi.fn();
  const gl = new Proxy({}, { get(_target, key: string) {
    if (key === 'drawingBufferWidth') return 800;
    if (key === 'drawingBufferHeight') return 600;
    if (/^[A-Z_0-9]+$/.test(key)) {
      if (!constants.has(key)) constants.set(key, constants.size + 1);
      return constants.get(key);
    }
    return calls[key] ??= vi.fn((...args: unknown[]) => {
      if (key.startsWith('create')) { const value = {}; alive.add(value); return value; }
      if (key.startsWith('delete')) alive.delete(args[0] as object);
      if (key === 'getExtension') return args[0] === 'EXT_blend_minmax' ? { MAX_EXT: 32776 } : { loseContext };
      if (key === 'getContextAttributes') return { stencil: true };
      if (key === 'getShaderParameter') return compile;
      if (key === 'getProgramParameter') return true;
      if (key === 'getParameter') return args[0] === gl.MAX_VIEWPORT_DIMS ? [8192, 8192] : 8192;
      if (key === 'checkFramebufferStatus') return gl.FRAMEBUFFER_COMPLETE;
      if (key === 'getAttribLocation') return args[1] === 'position' ? 0 : 1;
      if (key === 'isContextLost') return false;
    });
  } }) as WebGLRenderingContext;
  const offscreen = { width: 0, height: 0, getContext: () => gl };
  const createElement = vi.fn(() => offscreen);
  vi.stubGlobal('document', { createElement });
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const canvas = { width: 800, height: 600, clientWidth: 800, style: {}, addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ width: 800, height: 600 }), getContext: () => gl } as unknown as HTMLCanvasElement;
  return { gl, calls, alive, loseContext, canvas, createElement };
}
const regions = (count = 1) => parsePgrBlocks(Array.from({ length: count }, (_, i) => ({
  bottomLeftPercentage: { x: .2, y: .2 }, topRightPercentage: { x: .8, y: .8 },
  appearTime: i * 10, enableTime: i * 10, disableTime: i * 10 + 5, disappearTime: i * 10 + 6,
})));
afterEach(() => vi.unstubAllGlobals());
const emptyChart = () => parsePgrChart({ formatVersion: 3, judgeLineList: [{ bpm: 120,
  speedEvents: [{ startTime: 0, endTime: 32, value: 1 }] }] });

describe('PGR block GPU lifecycle', () => {
  it('普通谱面绘制后释放 GPU 资源', () => {
    const env = environment();
    const renderer = new PgrRenderer(env.canvas);
    renderer.setChart(emptyChart());
    renderer.render(1);
    expect(env.calls.drawArrays).toHaveBeenCalled();
    renderer.dispose();
    expect(env.alive.size).toBe(0);
  });

  it('跳转到区域后仍可绘制，离开区域归还特效附件', () => {
    const env = environment(), renderer = new PgrRenderer(env.canvas);
    renderer.setChart({ ...emptyChart(), blocks: regions(3) });
    renderer.render(-1);
    const idle = env.alive.size;
    for (const time of [1, 21, 11, 1]) {
      renderer.render(time);
      expect(env.alive.size).toBeGreaterThan(idle);
    }
    for (let time = 30; time < 31; time += 0.1) renderer.render(time);
    expect(env.alive.size).toBe(idle);
    renderer.dispose();
    expect(env.alive.size).toBe(0);
  });

  it('重复出帧复用区域显存，关闭特效后回收', () => {
    const env = environment(), renderer = new PgrRenderer(env.canvas);
    renderer.setChart({ ...emptyChart(), blocks: regions() });
    renderer.render(1);
    const active = env.alive.size;
    renderer.render(2);
    expect(env.alive.size).toBe(active);
    renderer.setSettings({ showBlockArea: false });
    for (let time = 2; time < 3; time += 0.1) renderer.render(time);
    expect(env.alive.size).toBeLessThan(active);
    renderer.dispose();
    expect(env.alive.size).toBe(0);
  });

  it('切换谱面释放上一个区域渲染器', () => {
    const env = environment();
    const renderer = new PgrRenderer(env.canvas);
    const chart = emptyChart();
    const ordinary = env.alive.size;
    renderer.setChart({ ...chart, blocks: regions() });
    expect(env.alive.size).toBeGreaterThan(0);
    renderer.setChart(chart);
    expect(env.alive.size).toBe(ordinary);
    renderer.dispose();
  });
});
