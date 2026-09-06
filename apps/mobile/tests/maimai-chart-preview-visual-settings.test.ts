import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSimaiBody } from '@/features/maimai-chart-preview/engine/core/parser/SimaiParser';
import { buildFrame, prepareChart } from '@/features/maimai-chart-preview/engine/renderers/frame';
import { DEFAULT_RENDERER_CONFIG, MainRenderer, mirrorHint } from '@/features/maimai-chart-preview/engine/renderers/MainRenderer';
import { ChartPreviewSkin } from '@/features/maimai-chart-preview/engine/renderers/skinAtlas';
import { EffectRenderer } from '@/features/maimai-chart-preview/engine/renderers/effects';
import { MAIMAI_CHART_PREVIEW_SKIN_ASSETS } from '@/features/maimai-chart-preview/maimai-chart-preview-skin-manifest.generated';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function canvasMock(size = 540) {
  const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), clip: vi.fn(), setTransform: vi.fn(),
    translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(), fillRect: vi.fn(), globalAlpha: 1, fillStyle: '' };
  const canvas = { getContext: () => ctx, width: size, height: size, clientWidth: size, style: {} } as unknown as HTMLCanvasElement;
  return { ctx, canvas };
}

describe('pink star resource selection', () => {
  it('replaces every ordinary head and moving star, preserving special variants and EX overlays', () => {
    const bodies = ['1-5[4:2]', '1-5[4:2]*-7[4:2]', '1x-5[4:2]', '1w5[4:2]',
      '1b-5[4:2]', '1m-5[4:2]', '1bx-5[4:2]*-7[4:2]', '1-5[4:2]/3-7[4:2]', '1-5b[4:2]', '1-5m[4:2]'];
    const seen = new Set<string>();
    for (const body of bodies) {
      const prepared = prepareChart(parseSimaiBody(`(120)${body},`));
      for (const time of [1850, 2000, 2250, 2750]) {
        const config = { ...DEFAULT_RENDERER_CONFIG, highlightExNotes: true };
        const normal = buildFrame(prepared, time, config);
        const pink = buildFrame(prepared, time, { ...config, pinkSlideStart: true });
        const expected = normal.map(c => {
          seen.add(c.path);
          const path = c.path === 'StarSkins/star.png' ? 'StarSkins/star_pink.png'
            : c.path === 'StarSkins/star_double.png' ? 'StarSkins/star_pink_double.png' : c.path;
          return { ...c, path };
        });
        expect(pink).toEqual(expected);
      }
    }
    for (const name of ['star', 'star_double', 'star_each', 'star_break', 'star_mine', 'star_break_double']) {
      expect(seen.has(`StarSkins/${name}.png`), name).toBe(true);
    }
  });

  it.each(['1x-5[4:2]', '1x-5[4:2]*-7[4:2]'])('keeps the original display size and EX alignment for %s', body => {
    vi.stubGlobal('devicePixelRatio', 1);
    vi.spyOn(EffectRenderer.prototype, 'prepare').mockImplementation(() => {});
    vi.stubGlobal('document', { createElement: () => canvasMock().canvas });
    const skin = new ChartPreviewSkin();
    vi.spyOn(skin, 'get').mockImplementation(path => {
      const asset = MAIMAI_CHART_PREVIEW_SKIN_ASSETS.find(a => a.path === path)!;
      return { naturalWidth: asset.width, naturalHeight: asset.height } as HTMLImageElement;
    });
    const { canvas, ctx } = canvasMock();
    const renderer = new MainRenderer(canvas, { skin });
    renderer.setJudgmentLineDesign('blind'); renderer.setHighlightExNotes(true);
    const chart = parseSimaiBody(`(120)${body},`);
    renderer.renderAtTime(chart, 1850);
    const original = ctx.drawImage.mock.calls.slice(-2).map(c => c.slice(1));
    ctx.drawImage.mockClear(); renderer.setPinkSlideStart(true); renderer.renderAtTime(chart, 1850);
    const pink = ctx.drawImage.mock.calls.slice(-2).map(c => c.slice(1));
    expect(pink).toEqual(original);
    expect(pink[0]).toEqual(pink[1]);
  });
});

describe('slide completion text', () => {
  it('uses JUST for all six directions, including Break, and preserves hidden/distinguish/mirroring', () => {
    const directions = new Set<string>();
    for (let start = 1; start <= 8; start++) for (const type of ['-', 'p', 'q', 'w', '<', '>']) for (const suffix of ['', 'b']) {
      const end = (start + 3) % 8 + 1;
      const prepared = prepareChart(parseSimaiBody(`(120)${start}${type}${end}[4:1]${suffix},`));
      const hints = (judgeHint: 'unified' | 'distinguish' | 'hidden', time = 3020) => buildFrame(prepared, time,
        { ...DEFAULT_RENDERER_CONFIG, judgeHint }).filter(c => c.path.startsWith('SlideOKSkins/'));
      const hint = hints('unified')[0];
      expect(hint).toBeDefined(); expect(hint.path).toMatch(/_p\.png$/);
      expect(MAIMAI_CHART_PREVIEW_SKIN_ASSETS.some(a => a.path === hint.path)).toBe(true);
      directions.add(hint.path);
      expect(hints('hidden')).toEqual([]);
      expect(hints('distinguish')[0].path).not.toMatch(/_p\.png$/);
      expect(hints('unified', 3070)[0].path).toBe(hint.path);
      expect(mirrorHint(mirrorHint(hint, -1, 1), -1, 1)).toEqual(hint);
    }
    expect(directions.size).toBe(6);
  });
});

describe('background containment', () => {
  it.each([[1600, 900], [900, 1600], [800, 800]])('shares image/video centering and circular clipping for %sx%s', (width, height) => {
    vi.stubGlobal('devicePixelRatio', 1);
    const cached: ReturnType<typeof canvasMock>[] = [];
    vi.stubGlobal('document', { createElement: () => { const c = canvasMock(); cached.push(c); return c.canvas; } });
    const { canvas, ctx } = canvasMock();
    const renderer = new MainRenderer(canvas);
    const image = { complete: true, naturalWidth: width, naturalHeight: height } as HTMLImageElement;
    const video = { readyState: 2, videoWidth: width, videoHeight: height } as HTMLVideoElement;
    renderer.setBackgroundImage(image);
    for (const size of [540, 320, 1080]) {
      renderer.resizeToSize(size); renderer.setBackgroundVideo(null); renderer.clear();
      const c = cached.at(-1)!;
      const scale = Math.min(size / width, size / height);
      const rectangle = [(size - width * scale) / 2, (size - height * scale) / 2, width * scale, height * scale];
      expect(c.ctx.drawImage).toHaveBeenCalledWith(image, ...rectangle);
      expect(c.ctx.arc).toHaveBeenCalledWith(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      expect(c.ctx.clip).toHaveBeenCalledOnce();
      const count = cached.length; renderer.clear(); expect(cached.length).toBe(count);
      ctx.drawImage.mockClear(); renderer.setBackgroundVideo(video); renderer.clear();
      expect(ctx.drawImage).toHaveBeenCalledWith(video, ...rectangle);
      expect(ctx.arc).toHaveBeenLastCalledWith(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      expect(ctx.save.mock.calls.length).toBe(ctx.restore.mock.calls.length);
    }
  });
});

describe('hit effect appearance', () => {
  it('removes star layers while retaining tap hexagons and the Touch circle', () => {
    vi.stubGlobal('document', { createElement: () => canvasMock().canvas });
    for (const [kind, isBreak, expected] of [['tap', false, 'Hex_Perfect.png'], ['tap', true, null], ['touch', false, 'TouchEffectCircle.png']] as const) {
      const skin = new ChartPreviewSkin();
      const get = vi.spyOn(skin, 'get').mockReturnValue({ naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement);
      const { ctx } = canvasMock();
      new EffectRenderer(skin).draw(ctx as unknown as CanvasRenderingContext2D, kind, 100, isBreak, 2100);
      expect(get.mock.calls.map(c => c[0])).toEqual(expected ? [`ViewXEffects/${expected}`] : []);
      expect(ctx.drawImage.mock.calls.length).toBe(expected === 'Hex_Perfect.png' ? 4 : expected ? 1 : 0);
    }
  });

  it('uses Each gold for ordinary and Break hold particles', () => {
    const cached: ReturnType<typeof canvasMock>[] = [];
    vi.stubGlobal('document', { createElement: () => { const c = canvasMock(); cached.push(c); return c.canvas; } });
    const skin = new ChartPreviewSkin();
    vi.spyOn(skin, 'get').mockReturnValue({ naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement);
    const effect = new EffectRenderer(skin);
    for (const isBreak of [false, true]) {
      const { ctx } = canvasMock();
      effect.draw(ctx as unknown as CanvasRenderingContext2D, 'hold', 150, isBreak, 2150);
      expect(ctx.drawImage).toHaveBeenCalledOnce();
      expect(cached.at(-1)!.ctx.fillStyle).toBe('#fff55d');
    }
    expect(cached).toHaveLength(1);
  });
});
