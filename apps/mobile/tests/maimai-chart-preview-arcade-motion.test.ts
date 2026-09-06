import { describe, expect, it, vi } from 'vitest';
import { parseSimaiBody } from '@/features/simai-chart-preview/engine/core/parser/SimaiParser';
import { prepareChart, buildFrame, touchPoint } from '@/features/simai-chart-preview/engine/renderers/frame';
import { DEFAULT_RENDERER_CONFIG, MainRenderer, mirrorHint } from '@/features/simai-chart-preview/engine/renderers/MainRenderer';
import { ChartPreviewSkin } from '@/features/simai-chart-preview/engine/renderers/skinAtlas';
import { arcadeTapTravelSpeed } from '@/features/simai-chart-preview/engine/utils/arcadeMotion';

describe('deterministic ViewX frames', () => {
  it.each([[320, 1], [540, 2], [1080, 2]])('aligns all judgment styles with note positions at %ipx / DPR %i', (size, dpr) => {
    vi.stubGlobal('devicePixelRatio', dpr);
    try {
      const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), stroke: vi.fn(), fill: vi.fn(), drawImage: vi.fn(), lineWidth: 0 };
      const canvas = { getContext: () => ctx, width: 0, height: 0, clientWidth: size, style: {} } as unknown as HTMLCanvasElement;
      const sensor = { naturalWidth: 2048, naturalHeight: 2048 } as HTMLImageElement;
      const skin = new ChartPreviewSkin();
      vi.spyOn(skin, 'get').mockImplementation(path => path === 'sensor.webp' ? sensor : undefined);
      const renderer = new MainRenderer(canvas, { skin });
      renderer.resizeToSize(size);
      const unit = canvas.width / 10.8, center = canvas.width / 2;
      const chart = prepareChart(parseSimaiBody('(120)1/2/3/4/5/6/7/8,'));
      const notes = buildFrame(chart, 2000, DEFAULT_RENDERER_CONFIG).filter(c => c.path.startsWith('TapSkins/'));
      expect(notes).toHaveLength(8);
      renderer.setJudgmentLineDesign('noLine');
      renderer.renderJudgmentLine();
      expect(ctx.arc).toHaveBeenCalledTimes(8);
      notes.forEach(note => {
        const [x, y, radius] = ctx.arc.mock.calls.find(([x, y]) =>
          Math.hypot(x - center - note.x * unit, y - center + note.y * unit) < 0.001)!;
        expect(x).toBeCloseTo(center + note.x * unit);
        expect(y).toBeCloseTo(center - note.y * unit);
        expect(radius / unit * 100).toBeCloseTo(14.5);
      });
      const markers = [...ctx.arc.mock.calls];
      ctx.arc.mockClear();
      renderer.setJudgmentLineDesign('simple');
      renderer.renderJudgmentLine();
      expect(ctx.arc.mock.calls.slice(1)).toEqual(markers);
      expect(ctx.arc.mock.calls[0].slice(0, 2)).toEqual([center, center]);
      expect(ctx.arc.mock.calls[0][2]).toBeCloseTo(Math.hypot(notes[0].x, notes[0].y) * unit);
      expect(ctx.lineWidth / unit * 100).toBeCloseTo(6);
      const line = [...ctx.arc.mock.calls];
      ctx.arc.mockClear();
      renderer.setJudgmentLineDesign('sensor');
      renderer.renderJudgmentLine();
      expect(ctx.arc.mock.calls).toEqual(line);
      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      const [image, x, y, width, height] = ctx.drawImage.mock.calls[0];
      expect(image).toBe(sensor);
      expect(width).toBe(height);
      const measuredCenters = [[1026, 386], [1456, 565], [1635, 996.5], [1455.5, 1429], [1026, 1609.5], [595.5, 1429], [415.5, 996.5], [595, 565]];
      measuredCenters.forEach(([sx, sy], i) => {
        const point = touchPoint(`E${i + 1}`);
        expect(Math.hypot((x + sx * width / 2048 - center) / unit - point.x,
          (y + sy * height / 2048 - center) / unit + point.y)).toBeLessThan(0.015);
      });
      ctx.arc.mockClear(); ctx.drawImage.mockClear();
      renderer.setJudgmentLineDesign('blind'); renderer.renderJudgmentLine();
      expect(ctx.arc).not.toHaveBeenCalled(); expect(ctx.drawImage).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it('mirrors slide completion direction with the opposite sprite while preserving readable glyphs', () => {
    const p = prepareChart(parseSimaiBody('(120)1-5[4:1],'));
    const hint = buildFrame(p, 3100, DEFAULT_RENDERER_CONFIG).find(c => c.path.startsWith('SlideOKSkins/'))!;
    expect(hint).toBeDefined();
    const mirrored = mirrorHint(hint, -1, 1);
    expect(mirrored.path).not.toBe(hint.path);
    expect(mirrored.x).toBe(-hint.x);
    expect(mirrored.y).toBe(hint.y);
    expect(mirrorHint(mirrored, -1, 1)).toEqual(hint);
  });
  it('uses native hold geometry and the same EX transform from appearance through release', () => {
    const p = prepareChart(parseSimaiBody('(120)1hx[4:2],'));
    const config = { ...DEFAULT_RENDERER_CONFIG, highlightExNotes: true };
    const frames = [1300, 1450, 1750, 2000, 2500, 3000, 3001].map(t => buildFrame(p, t, config));
    expect(frames[0].some(c => c.path.startsWith('HoldSkins/'))).toBe(false);
    const hit = frames[3].find(c => c.path === 'HoldSkins/hold_on.png')!;
    expect(hit.exPath).toBe('HoldSkins/hold_ex.png');
    expect(Math.hypot(hit.x, hit.y)).toBeCloseTo((4.8 + 1.225) / 2);
    expect(hit.stretch).toBeCloseTo(4.8 - 1.225 - 0.58);
    expect(frames[6].some(c => c.path.startsWith('HoldSkins/'))).toBe(false);
    expect(buildFrame(p, 1750, config)).toEqual(frames[2]);
  });
  it('ends notes by real time even when negative SV moves them backwards', () => {
    const p = prepareChart(parseSimaiBody('(120){4}<SV*-1>1,2c,'));
    expect(buildFrame(p, 2001, DEFAULT_RENDERER_CONFIG).filter(c => c.order === 0 && c.layer === 3)).toEqual([]);
    const tap = buildFrame(p, 2400, DEFAULT_RENDERER_CONFIG).find(c => c.path === 'TapSkins/tap.png');
    expect(Math.hypot(tap!.x, tap!.y)).toBeCloseTo(4.8 - arcadeTapTravelSpeed(6) * 0.1);
  });
  it('gives Each links the reference zero-degree anchor at button 1', () => {
    const p = prepareChart(parseSimaiBody('(120)1/2,'));
    expect(buildFrame(p, 1900, DEFAULT_RENDERER_CONFIG).find(c => c.path.includes('EachLine1'))?.angle).toBe(0);
  });
  it('keeps touch-hold petals closed throughout the hold', () => {
    const p = prepareChart(parseSimaiBody('(120)Ch[4:2],'));
    const positions = (time: number) => buildFrame(p, time, DEFAULT_RENDERER_CONFIG).filter(c => /touchhold_\d/.test(c.path)).map(c => [c.path, c.x, c.y, c.angle]);
    expect(positions(2500)).toEqual(positions(2000));
    const mask = buildFrame(p, 2500, DEFAULT_RENDERER_CONFIG).find(c => c.cutoff !== undefined);
    expect(mask?.cutoff).toBe(0.5);
  });
});
