import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { PhiraChartSchema } from '@/domain/phira';
import { buildPhiraChartPreviewInput } from '@/features/phira-chart-preview/chart-preview-input';
import { parseRpeChart } from '@/features/phigros-chart-preview/webview-player/rpe-core';
import { RpeRenderer } from '@/features/phigros-chart-preview/webview-player/rpe-renderer';

function environment(gl?: WebGLRenderingContext) {
  const calls = new Map<HTMLCanvasElement, unknown[][]>();
  function canvas(): HTMLCanvasElement {
    const draws: unknown[][] = [];
    const context = new Proxy<Record<string, unknown>>({}, {
      get: (target, key: string) => target[key] ?? ((...args: unknown[]) => {
        if (key === 'drawImage') draws.push(args);
        if (key === 'measureText') return { width: 10 };
      }),
    });
    const value = { width: 300, height: 150, clientWidth: 675, clientHeight: 450,
      style: {}, getContext: (kind: string) => kind === 'webgl' ? gl ?? null : context, setAttribute() {}, remove() {},
      getBoundingClientRect: () => ({ width: 675, height: 450 }),
    } as unknown as HTMLCanvasElement;
    calls.set(value, draws);
    return value;
  }
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('document', { createElement: canvas });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const stage = canvas();
  return { renderer: new RpeRenderer(stage), stage, draws: calls.get(stage)! };
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
  it('视频遵循暂停、倍速、区间定位并在异步定位后重绘', async () => {
    class Video extends EventTarget {
      duration = 10;
      currentTime = 0;
      playbackRate = 1;
      videoWidth = 320;
      videoHeight = 180;
      paused = true;
      play() { this.paused = false; return Promise.resolve(); }
      pause() { this.paused = true; }
    }
    const video = new Video();
    const { renderer, draws } = environment();
    const data = parseRpeChart({ META: { RPEVersion: 150 }, BPMList: [{ startTime: [0, 0, 1], bpm: 120 }], judgeLineList: [] },
      { extraJson: JSON.stringify({ videos: [{ path: 'clip.mp4', time: [4, 0, 1] }] }) });
    renderer.setChart(data);
    renderer.setChartAssets({ textures: new Map(), videos: new Map([['clip.mp4', video as unknown as HTMLVideoElement]]),
      shaders: new Map(), gifs: new Map(), gifAnims: new Map() });
    renderer.render(3);
    expect(video.currentTime).toBe(1);
    expect(video.paused).toBe(true);
    draws.length = 0;
    video.dispatchEvent(new Event('seeked'));
    expect(draws.some(args => args[0] === video)).toBe(true);
    renderer.render(4, true, 2);
    expect([video.currentTime, video.playbackRate, video.paused]).toEqual([2, 2, false]);
    await Promise.resolve();
    renderer.render(4.1, false, 0.5);
    expect(video.currentTime).toBeCloseTo(2.1);
    expect(video.paused).toBe(true);
    renderer.render(5, true, 0.5);
    expect(video.playbackRate).toBe(0.5);
    renderer.render(0, true);
    expect(video.paused).toBe(true);
    renderer.render(12, true);
    expect(video.paused).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    renderer.render(3, true);
    renderer.dispose();
    await Promise.resolve();
    expect(video.paused).toBe(true);
    draws.length = 0;
    video.dispatchEvent(new Event('seeked'));
    expect(draws).toEqual([]);
  });

  it.each(['glsl', 'fs'])('谱包的 %s 着色器在缓存复用及画布缩放后仍采到各自图片', async extension => {
    type Texture = { source?: unknown };
    const bindings = new Map<number, Texture | null>();
    const samplers = new Map<string, number>();
    const sampled: Record<string, unknown>[] = [];
    let active = 0;
    const gl = new Proxy({
      TEXTURE0: 0,
      activeTexture(unit: number) { active = unit; },
      createTexture: () => ({}),
      bindTexture(_target: number, texture: Texture) { bindings.set(active, texture); },
      texImage2D(...args: unknown[]) { bindings.get(active)!.source = args.at(-1); },
      getUniformLocation: (_program: unknown, name: string) => name,
      uniform1i(name: string, unit: number) { samplers.set(name, unit); },
      drawArrays() { sampled.push(Object.fromEntries([...samplers].map(([name, unit]) => [name, bindings.get(unit)?.source]))); },
      createShader: () => ({}), createProgram: () => ({}),
      getShaderParameter: () => true, getProgramParameter: () => true,
      getExtension: () => null,
    }, { get: (target, key) => Reflect.get(target, key) ?? (() => {}) }) as unknown as WebGLRenderingContext;
    const { renderer, stage } = environment(gl);
    const a = image(32), b = image(64);
    const shaderPath = `effects/mix.${extension}`;
    const zip = new JSZip();
    zip.file('info.yml', 'chart: chart.json\nmusic: song.mp3\nformat: rpe');
    zip.file('chart.json', JSON.stringify({ META: { RPEVersion: 150 }, BPMList: [{ startTime: [0, 0, 1], bpm: 120 }], judgeLineList: [] }));
    zip.file('song.mp3', new Uint8Array([1]));
    zip.file(shaderPath, 'precision mediump float; varying vec2 uv; uniform sampler2D first; uniform sampler2D second; void main() { gl_FragColor = (texture2D(first, uv) + texture2D(second, uv)) * 0.5; }');
    zip.file('extra.json', JSON.stringify({ effects: [0, 1].map(() => ({ shader: `/${shaderPath}`, start: [0, 0, 1], end: [20, 0, 1], vars: { first: 'a.png', second: 'b.png' } })) }));
    const bytes = await zip.generateAsync({ type: 'arraybuffer' });
    const prepared = await buildPhiraChartPreviewInput({ chartId: 1, chart: PhiraChartSchema.parse({
      id: 1, name: 'Sample', level: 'IN Lv.1', difficulty: 1, uploader: 1, file: 'https://phira.example/chart.zip',
    }) }, {}, new AbortController().signal, {
      downloadChart: async () => bytes,
      stageMusic: async () => ({ uri: 'file:///song.mp3', base64: 'AQ==' }),
      stageRpeBundle: async () => ({ basePath: 'file:///rpe/' }),
    });
    renderer.setChart(parseRpeChart(JSON.parse(prepared.config.chartText!), prepared.config.rpeAssets!));
    renderer.setChartAssets({ textures: new Map([['a.png', a], ['b.png', b]]), videos: new Map(),
      shaders: new Map(Object.entries(prepared.config.rpeAssets!.shaders)), gifs: new Map(), gifAnims: new Map() });
    renderer.render(1);
    renderer.render(2);
    stage.getBoundingClientRect = () => ({ width: 800, height: 450 }) as DOMRect;
    renderer.resize();
    renderer.render(3);
    expect(sampled.length).toBeGreaterThan(0);
    for (const draw of sampled) {
      expect(draw.first).toBe(a);
      expect(draw.second).toBe(b);
    }
    renderer.dispose();
  });
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
