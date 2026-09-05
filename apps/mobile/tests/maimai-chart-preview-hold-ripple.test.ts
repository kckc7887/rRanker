import { describe, expect, it } from 'vitest';
import { parseSimaiBody } from '@/features/maimai-chart-preview/engine/core/parser/SimaiParser';
import { prepareChart, buildFrame } from '@/features/maimai-chart-preview/engine/renderers/frame';
import { DEFAULT_RENDERER_CONFIG } from '@/features/maimai-chart-preview/engine/renderers/MainRenderer';
import { holdParticleState } from '@/features/maimai-chart-preview/engine/renderers/effects';

describe('ViewX hold effect emission (10/s, 0.3s lifetime)', () => {
  it('samples the prefab size and seven-key alpha gradient', () => {
    expect(holdParticleState(0)).toMatchObject({ size: 0.44897956, alpha: 0.007843138 });
    expect(holdParticleState(300 * 32894 / 65535).alpha).toBeCloseTo(1);
    expect(holdParticleState(300).alpha).toBe(0);
  });
  for (const token of ['1h', 'Ch']) it(`${token} reconstructs particles on seek, and drains at the end`, () => {
    const prepared = prepareChart(parseSimaiBody(`(120)${token}[4:2],`));
    const particles = (time: number) => buildFrame(prepared, time, DEFAULT_RENDERER_CONFIG).filter(c => c.effect?.kind === 'hold').map(c => c.effect!.ageMs);
    expect(particles(1999)).toEqual([]);
    expect(particles(2000)).toEqual([0]);
    expect(particles(2250)).toEqual([250, 150, 50]);
    expect(particles(3150)).toEqual([250, 150]);
    expect(particles(3300)).toEqual([]);
    expect(particles(2250)).toEqual([250, 150, 50]);
    expect(buildFrame(prepared, 2250, { ...DEFAULT_RENDERER_CONFIG, showHitEffect: false }).some(c => c.effect)).toBe(false);
  });
});
