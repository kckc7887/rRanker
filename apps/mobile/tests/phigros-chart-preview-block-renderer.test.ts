import { afterEach, describe, expect, it, vi } from 'vitest';
import { PgrBlockRenderer } from '@/features/phigros-chart-preview/webview-player/pgr-block-renderer';
import { parsePgrBlocks } from '@/features/phigros-chart-preview/webview-player/pgr-blocks';
import { parsePgrChart } from '@/features/phigros-chart-preview/webview-player/pgr-core';
import { PgrRenderer } from '@/features/phigros-chart-preview/webview-player/renderer';

function environment(compile = true) {
  const alive = new Set<object>();
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  const constants = new Map<string, number>();
  const loseContext = vi.fn();
  const gl = new Proxy({}, { get(_target, key: string) {
    if (/^[A-Z_0-9]+$/.test(key)) {
      if (!constants.has(key)) constants.set(key, constants.size + 1);
      return constants.get(key);
    }
    return calls[key] ??= vi.fn((...args: unknown[]) => {
      if (key.startsWith('create')) { const value = {}; alive.add(value); return value; }
      if (key.startsWith('delete')) alive.delete(args[0] as object);
      if (key === 'getExtension') return args[0] === 'EXT_blend_minmax' ? { MAX_EXT: 32776 } : { loseContext };
      if (key === 'getShaderParameter') return compile;
      if (key === 'getProgramParameter') return true;
      if (key === 'getParameter') return 8192;
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
  const canvas = { width: 800, height: 600, getBoundingClientRect: () => ({ width: 800, height: 600 }),
    getContext: () => context } as unknown as HTMLCanvasElement;
  const context = new Proxy({ canvas }, { get(target, key: string) {
    return key === 'canvas' ? target.canvas : vi.fn();
  } }) as CanvasRenderingContext2D;
  return { gl, calls, alive, loseContext, offscreen, context, canvas, createElement };
}
const regions = (count = 1) => parsePgrBlocks(Array.from({ length: count }, (_, i) => ({
  bottomLeftPercentage: { x: .2, y: .2 }, topRightPercentage: { x: .8, y: .8 },
  appearTime: i * 10, enableTime: i * 10, disableTime: i * 10 + 5, disappearTime: i * 10 + 6,
})));
afterEach(() => vi.unstubAllGlobals());
const emptyChart = () => parsePgrChart({ formatVersion: 3, judgeLineList: [{ bpm: 120,
  speedEvents: [{ startTime: 0, endTime: 32, value: 1 }] }] });

describe('PGR block GPU lifecycle', () => {
  it('无区域的旧谱不创建 WebGL 上下文', () => {
    const env = environment();
    const renderer = new PgrRenderer(env.canvas);
    renderer.setChart(emptyChart());
    renderer.render(1);
    expect(env.createElement).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it('只提交当前候选，跳转不累积几何，空时间不运行 GPU', () => {
    const env = environment();
    const renderer = new PgrBlockRenderer(regions(3000));
    for (const time of [1, 20001, 21, 1]) {
      renderer.draw(env.context, time, 800, 600, 800, 600);
      expect(renderer.lastCandidateCount).toBe(1);
      expect(renderer.lastDrawnCount).toBe(1);
    }
    expect(env.calls.drawArrays).toHaveBeenCalledTimes(12);
    const uploads = env.calls.bufferData!.mock.calls.filter(args => args[2] === env.gl.DYNAMIC_DRAW);
    expect(uploads[0]![1]).toEqual(uploads[3]![1]);
    renderer.draw(env.context, -1, 800, 600, 800, 600);
    expect(env.calls.drawArrays).toHaveBeenCalledTimes(12);
    renderer.dispose();
  });

  it('画布调整受像素预算限制，纹理和程序复用，释放幂等', () => {
    const env = environment();
    const renderer = new PgrBlockRenderer(regions());
    const allocations = env.alive.size;
    for (let i = 0; i < 5; i++) renderer.draw(env.context, 1, 2048, 1024, 4096, 2048);
    expect(env.offscreen.width * env.offscreen.height).toBeLessThanOrEqual(1_050_000);
    expect(env.alive.size).toBe(allocations);
    renderer.dispose(); renderer.dispose();
    expect(env.alive.size).toBe(0);
    expect(env.loseContext).toHaveBeenCalledTimes(1);
    expect(env.offscreen.width + env.offscreen.height).toBe(0);
    const draws = env.calls.drawArrays!.mock.calls.length;
    renderer.draw(env.context, 1, 800, 600, 800, 600);
    expect(env.calls.drawArrays).toHaveBeenCalledTimes(draws);
  });

  it('编译失败也释放已分配的程序、着色器与纹理', () => {
    const env = environment(false);
    expect(() => new PgrBlockRenderer(regions())).toThrow('编译失败');
    expect(env.alive.size).toBe(0);
    expect(env.loseContext).toHaveBeenCalledTimes(1);
  });

  it('上下文丢失和纹理尺寸超限明确失败，不展示不完整区域', () => {
    const env = environment();
    const renderer = new PgrBlockRenderer(regions());
    expect(() => renderer.draw(env.context, 1, 9000, 600, 9000, 600)).toThrow('尺寸');
    env.calls.isContextLost!.mockReturnValue(true);
    expect(() => renderer.draw(env.context, 1, 800, 600, 800, 600)).toThrow('已丢失');
    renderer.dispose();
  });

  it('切换谱面释放上一个区域渲染器', () => {
    const env = environment();
    const renderer = new PgrRenderer(env.canvas);
    const chart = emptyChart();
    renderer.setChart({ ...chart, blocks: regions() });
    expect(env.alive.size).toBeGreaterThan(0);
    renderer.setChart(chart);
    expect(env.alive.size).toBe(0);
    renderer.dispose();
  });
});
