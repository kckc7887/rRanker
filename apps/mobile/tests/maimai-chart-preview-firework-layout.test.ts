import { describe, expect, it } from 'vitest';
import { effectCurve } from '@/features/maimai-chart-preview/engine/renderers/effects';
import { parseSimaiBody } from '@/features/maimai-chart-preview/engine/core/parser/SimaiParser';
import { prepareChart, buildFrame, touchPoint } from '@/features/maimai-chart-preview/engine/renderers/frame';
import { DEFAULT_RENDERER_CONFIG } from '@/features/maimai-chart-preview/engine/renderers/MainRenderer';

describe('ViewX firework timing', () => {
  it('uses the original animation keys including the initial delay', () => {
    expect(effectCurve('firework', 'Firework', 'scale.x', 0.1)).toBe(0);
    expect(effectCurve('firework', 'Firework', 'scale.x', 0.23333333)).toBe(1.25);
    expect(effectCurve('firework', 'Firework', 'scale.x', 1.3333334)).toBe(5);
  });
  it('originates at the touched sensor on hold release and respects its own toggle', () => {
    const p = prepareChart(parseSimaiBody('(120)A1hf[4:1],'));
    const config = { ...DEFAULT_RENDERER_CONFIG, showHitEffect: false };
    expect(buildFrame(p, 2499, config).some(c => c.effect?.kind === 'firework')).toBe(false);
    const effect = buildFrame(p, 2600, config).find(c => c.effect?.kind === 'firework');
    expect(effect).toMatchObject({ ...touchPoint('A1'), effect: { ageMs: 100 } });
    expect(buildFrame(p, 2600, { ...config, showFireworks: false }).some(c => c.effect)).toBe(false);
  });
});
