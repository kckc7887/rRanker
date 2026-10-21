import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSimaiBody } from '@/features/simai-chart-preview/engine/core/parser/SimaiParser';
import { MainRenderer } from '@/features/simai-chart-preview/engine/renderers/MainRenderer';
import { ChartPreviewSkin } from '@/features/simai-chart-preview/engine/renderers/skinAtlas';
import { MAIMAI_CHART_PREVIEW_SKIN_ASSETS } from '@/features/simai-chart-preview/maimai-chart-preview-skin-manifest.generated';
import { EFFECT_SPRITES } from '@/features/simai-chart-preview/engine/renderers/effectSprites.generated';
import { parseJudgeHint } from '@/features/simai-chart-preview/engine/utils/judgeHint';

type Matrix = [number, number, number, number, number, number];
type Draw = { image: string; x: number; y: number; width: number; height: number; alpha: number; tint?: string };
type Source = { src?: string; label?: string; width?: number; height?: number; naturalWidth?: number; naturalHeight?: number; tint?: string };
const effects = new Map(Object.entries(EFFECT_SPRITES).map(([name, sprite]) => [sprite.data, 'ViewXEffects/' + name]));

function canvasMock(size = 540) {
  const draws: Draw[] = [];
  const circles: { x: number; y: number; radius: number; angle: number }[] = [];
  let matrix: Matrix = [1, 0, 0, 1, 0, 0], alpha = 1;
  const stack: { matrix: Matrix; alpha: number }[] = [];
  const multiply = ([a, b, c, d, e, f]: Matrix) => {
    const [u, v, w, x, y, z] = matrix;
    matrix = [u * a + w * b, v * a + x * b, u * c + w * d, v * c + x * d, u * e + w * f + y, v * e + x * f + z];
  };
  const target = { width: size, height: size, clientWidth: size, style: {}, label: 'canvas', tint: undefined as string | undefined, getContext: () => context };
  const context = {
    get globalAlpha() { return alpha; }, set globalAlpha(value: number) { alpha = value; },
    fillStyle: '', strokeStyle: '', lineWidth: 0, globalCompositeOperation: 'source-over',
    save() { stack.push({ matrix: [...matrix], alpha }); },
    restore() { const state = stack.pop()!; matrix = state.matrix; alpha = state.alpha; },
    setTransform(...value: Matrix) { matrix = value; },
    translate(x: number, y: number) { multiply([1, 0, 0, 1, x, y]); },
    scale(x: number, y: number) { multiply([x, 0, 0, y, 0, 0]); },
    rotate(r: number) { multiply([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]); },
    beginPath() {}, closePath() {}, moveTo() {}, clip() {}, fill() {}, stroke() {},
    fillRect() { if (context.globalCompositeOperation === 'multiply') target.tint = context.fillStyle; },
    arc(x: number, y: number, radius: number, start: number, end: number) {
      circles.push({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5], radius: radius * Math.hypot(matrix[0], matrix[1]), angle: end - start });
    },
    drawImage(image: Source, ...args: number[]) {
      const [x, y, width = image.naturalWidth ?? image.width ?? 100, height = image.naturalHeight ?? image.height ?? 100] = args.length === 8 ? args.slice(4) : args;
      const label = image.src ? effects.get(image.src) ?? image.src : image.label ?? 'canvas';
      target.label = label;
      draws.push({ image: label, x: matrix[0] * (x + width / 2) + matrix[2] * (y + height / 2) + matrix[4], y: matrix[1] * (x + width / 2) + matrix[3] * (y + height / 2) + matrix[5], width: Math.abs(width) * Math.hypot(matrix[0], matrix[1]), height: Math.abs(height) * Math.hypot(matrix[2], matrix[3]), alpha, tint: image.tint });
    },
    getImageData: () => ({ data: new Uint8ClampedArray(0) }),
    createImageData: () => ({ data: new Uint8ClampedArray(0) }),
    putImageData() {}, createRadialGradient: () => ({ addColorStop() {} }),
  };
  return { canvas: target as unknown as HTMLCanvasElement, context, draws, circles };
}

const surfaces: ReturnType<typeof canvasMock>[] = [];
beforeEach(() => {
  surfaces.length = 0;
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('document', { createElement: () => { const surface = canvasMock(); surfaces.push(surface); return surface.canvas; } });
  vi.stubGlobal('__MAIMAI_CHART_PREVIEW_SKINS__', Object.fromEntries([
    ...MAIMAI_CHART_PREVIEW_SKIN_ASSETS.map(asset => [asset.path, asset.path]), ['sensor.webp', 'sensor.webp'],
  ]));
  vi.stubGlobal('Image', class {
    complete = true; naturalWidth = 100; naturalHeight = 100; onload?: () => void; private value = '';
    get src() { return this.value; }
    set src(value: string) {
      this.value = value;
      const asset = MAIMAI_CHART_PREVIEW_SKIN_ASSETS.find(item => item.path === value);
      this.naturalWidth = asset?.width ?? 100; this.naturalHeight = asset?.height ?? 100;
      queueMicrotask(() => this.onload?.());
    }
  });
});
afterEach(() => vi.unstubAllGlobals());

async function player() {
  const output = canvasMock(), skin = new ChartPreviewSkin();
  await skin.load();
  const renderer = new MainRenderer(output.canvas, { skin });
  renderer.setJudgmentLineDesign('blind');
  const render = (body: string, time: number) => {
    output.draws.length = 0; output.circles.length = 0;
    renderer.renderAtTime(parseSimaiBody('(120)' + body + ','), time);
    return output.draws.filter(draw => draw.alpha > 0);
  };
  return { ...output, renderer, render };
}

describe('舞萌播放器画面', () => {
  it('粉色星星替换普通单双星，保留绝赞与地雷，显示大小不变', async () => {
    const p = await player();
    for (const [body, normal, pink] of [
      ['1x-5[4:2]', 'star', 'star_pink'], ['1x-5[4:2]*-7[4:2]', 'star_double', 'star_pink_double'],
      ['1b-5[4:2]', 'star_break', 'star_break'], ['1m-5[4:2]', 'star_mine', 'star_mine'],
    ]) {
      p.renderer.setPinkSlideStart(false);
      const before = p.render(body, 1850).find(draw => draw.image === 'StarSkins/' + normal + '.png')!;
      p.renderer.setPinkSlideStart(true);
      const after = p.render(body, 1850).find(draw => draw.image === 'StarSkins/' + pink + '.png')!;
      expect(before).toBeDefined(); expect(after).toBeDefined();
      expect(after.width).toBeCloseTo(before.width); expect(after.height).toBeCloseTo(before.height);
    }
    expect(p.render('1-5[4:2]', 2750).some(draw => draw.image === 'StarSkins/star_pink.png')).toBe(true);
  });

  it.each(['1CK5[4:1]', '1B1B3K3[4:2]', '1-5[4:1]-8[4:2]', '2p6[4:1]q3[4:2]'])('自定义与连接星星 %s 绘制轨迹并推进', async (body) => {
    const p = await player();
    const start = p.render(body, 2550).find(draw => draw.image === 'StarSkins/star.png');
    const next = p.render(body, 2650).find(draw => draw.image === 'StarSkins/star.png');
    expect(start).toBeDefined(); expect(next).toBeDefined();
    expect(Math.hypot(next!.x - start!.x, next!.y - start!.y)).toBeGreaterThan(0);
  });

  it('判定文字设置改变实际绘制，镜像后文字保持可见', async () => {
    const p = await player();
    for (const mode of ['distinguish', 'unified', 'hidden'] as const) {
      p.renderer.setJudgeHint(mode);
      const images = p.render('1b', 2050).map(draw => draw.image).filter(image => image.startsWith('JudgeTextSkins/'));
      expect(images).toEqual(mode === 'hidden' ? [] : [mode === 'unified' ? 'JudgeTextSkins/judge_text_perfect.png' : 'JudgeTextSkins/judge_text_cPerfect_break.png']);
    }
    p.renderer.setJudgeHint('unified');
    const original = p.render('1-5[4:1]', 3020).find(draw => draw.image.startsWith('SlideOKSkins/'))!;
    p.renderer.setMirrorMode('horizontal');
    const mirrored = p.render('1-5[4:1]', 3020).find(draw => draw.image.startsWith('SlideOKSkins/'))!;
    expect(original).toBeDefined(); expect(mirrored).toBeDefined();
    expect(original.image).toMatch(/_p\.png$/); expect(mirrored.image).toMatch(/_p\.png$/);
    expect(mirrored.x).toBeCloseTo(540 - original.x); expect(mirrored.y).toBeCloseTo(original.y);
    expect(mirrored.width).toBeCloseTo(original.width);
    p.renderer.setJudgeHint('hidden');
    expect(p.render('1-5[4:1]', 3020).some(draw => draw.image.startsWith('SlideOKSkins/'))).toBe(false);
  });

  it('长条在出现和结束边界可见，回退恢复画面；负速不会延长已判定音符', async () => {
    const p = await player();
    const holds = (time: number) => p.render('1hx[4:2]', time).filter(draw => draw.image.startsWith('HoldSkins/'));
    expect(holds(1300)).toEqual([]);
    const before = holds(1750); expect(before.length).toBeGreaterThan(0);
    expect(holds(2000).some(draw => draw.image === 'HoldSkins/hold_on.png')).toBe(true);
    expect(holds(3001)).toEqual([]);
    const restored = holds(1750);
    expect(restored.map(({ x, y }) => [x, y])).toEqual(before.map(({ x, y }) => [x, y]));
    expect(p.render('{4}<SV*-1>1,2c', 2001).some(draw => draw.image === 'TapSkins/tap.png')).toBe(true);
    expect(p.render('{4}<SV*-1>1', 2001).some(draw => draw.image === 'TapSkins/tap.png')).toBe(false);
  });

  it('Touch Hold 保持花瓣位置并推进遮罩，长条粒子会结束且可关闭', async () => {
    const p = await player();
    const petals = (time: number) => p.render('Ch[4:2]', time).filter(draw => /touchhold_\d/.test(draw.image)).map(({ x, y }) => [x, y]);
    const start = petals(2000); expect(start.length).toBeGreaterThan(0);
    expect(petals(2500)).toEqual(start);
    expect(p.circles.some(circle => Math.abs(circle.angle - Math.PI) < 0.001)).toBe(true);
    for (const token of ['1h', '1hb', 'Ch', 'Chb']) {
      const particles = (time: number) => p.render(token + '[4:2]', time).filter(draw => draw.image === 'ViewXEffects/Circle.png');
      expect(particles(1999)).toEqual([]); expect(particles(2250).length).toBeGreaterThan(0);
      expect(particles(3150).length).toBeGreaterThan(0); expect(particles(3300)).toEqual([]);
      expect(new Set(particles(2250).map(draw => draw.tint))).toEqual(new Set(['#fff55d']));
      p.renderer.setShowHitEffect(false); expect(particles(2250)).toEqual([]); p.renderer.setShowHitEffect(true);
    }
  });

  it('烟花在触摸长条结束后出现，普通打击特效与烟花开关独立', async () => {
    const p = await player(); p.renderer.setShowHitEffect(false);
    const petals = p.render('A1hf[4:1]', 2250).filter(draw => /touchhold_\d/u.test(draw.image));
    expect(petals.length).toBeGreaterThan(0);
    const center = { x: petals.reduce((sum, draw) => sum + draw.x, 0) / petals.length,
      y: petals.reduce((sum, draw) => sum + draw.y, 0) / petals.length };
    const firework = (time: number) => p.render('A1hf[4:1]', time).filter(draw => draw.image === 'canvas');
    expect(firework(2499)).toEqual([]);
    const visible = firework(2800); expect(visible.length).toBeGreaterThan(0);
    expect(visible[0].x).toBeCloseTo(center.x); expect(visible[0].y).toBeCloseTo(center.y);
    p.renderer.setShowFireworks(false); expect(firework(2800)).toEqual([]);
  });

  it.each([['1', 'Hex_Perfect.png'], ['1b', 'Star_Perfect.png'], ['C', 'TouchEffectCircle.png']])('打击 %s 绘制对应特效', async (body, sprite) => {
    const p = await player();
    const images = p.render(body, 2100).filter(draw => draw.image.startsWith('ViewXEffects/')).map(draw => draw.image);
    expect(new Set(images)).toEqual(new Set(['ViewXEffects/' + sprite]));
  });

  it.each([[1600, 900], [900, 1600], [800, 800]])('图片和视频在 %s×%s 保持居中且不拉伸', async (width, height) => {
    const p = await player();
    const video = { readyState: 2, videoWidth: width, videoHeight: height, src: 'video' } as unknown as HTMLVideoElement;
    p.renderer.setBackgroundVideo(video); p.renderer.clear();
    const draw = p.draws.find(item => item.image === 'video')!;
    expect(draw.x).toBeCloseTo(270); expect(draw.y).toBeCloseTo(270);
    expect(draw.width / draw.height).toBeCloseTo(width / height);
    expect(Math.max(draw.width, draw.height)).toBeCloseTo(540);
    expect(p.circles.some(circle => circle.radius === 270)).toBe(true);
    p.renderer.setBackgroundVideo(null);
    p.renderer.setBackgroundImage({ complete: true, naturalWidth: width, naturalHeight: height, src: 'image' } as HTMLImageElement);
    p.renderer.clear(); expect(p.draws.some(item => item.image === 'image')).toBe(true);
    const image = surfaces.flatMap(surface => surface.draws).find(item => item.image === 'image')!;
    expect(image.x).toBeCloseTo(270); expect(image.y).toBeCloseTo(270);
    expect(image.width / image.height).toBeCloseTo(width / height);
    expect(Math.max(image.width, image.height)).toBeCloseTo(540);
  });

  it('判定线的标记围绕画面中心，关闭后不绘制', async () => {
    const p = await player();
    p.renderer.setJudgmentLineDesign('simple'); p.renderer.renderJudgmentLine();
    const markers = p.circles.filter(circle => circle.radius < 20);
    expect(markers.length).toBeGreaterThan(0);
    for (const marker of markers) expect(Math.hypot(marker.x - 270, marker.y - 270)).toBeCloseTo(240);
    p.renderer.setJudgmentLineDesign('sensor'); p.renderer.renderJudgmentLine();
    expect(p.draws.some(draw => draw.image === 'sensor.webp')).toBe(true);
    p.draws.length = 0; p.circles.length = 0;
    p.renderer.setJudgmentLineDesign('blind'); p.renderer.renderJudgmentLine();
    expect(p.draws).toEqual([]); expect(p.circles).toEqual([]);
  });

  it('缺失或非法判定设置恢复默认，当前设置可读取', () => {
    expect(parseJudgeHint(undefined)).toBe('distinguish');
    expect(parseJudgeHint('invalid')).toBe('distinguish');
    expect(parseJudgeHint('unified')).toBe('unified'); expect(parseJudgeHint('hidden')).toBe('hidden');
  });
});
