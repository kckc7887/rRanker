import { describe, expect, it } from 'vitest';
import { parseSimaiBody } from '@/features/maimai-chart-preview/engine/core/parser/SimaiParser';
import { prepareChart, buildFrame } from '@/features/maimai-chart-preview/engine/renderers/frame';
import { DEFAULT_RENDERER_CONFIG, mirrorHint } from '@/features/maimai-chart-preview/engine/renderers/MainRenderer';
import { arcadeTapTravelSpeed } from '@/features/maimai-chart-preview/engine/utils/arcadeMotion';

describe('deterministic ViewX frames', () => {
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
