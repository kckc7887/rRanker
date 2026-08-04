import { describe, expect, it } from 'vitest';
import { fireworkCoveragePeakRadius } from '@/features/maimai-chart-preview/engine/renderers/fireworkLayout';

describe('fireworkCoveragePeakRadius', () => {
  it('保留圆心触发时原有的烟花峰值大小', () => {
    expect(fireworkCoveragePeakRadius(100, 100, 100, 100, 100)).toBeCloseTo(500 / 4.5);
  });

  it('偏心触发时覆盖到播放圆最远端', () => {
    expect(fireworkCoveragePeakRadius(100, 100, 100, 160, 100)).toBe(160);
    expect(fireworkCoveragePeakRadius(100, 100, 100, 130, 140)).toBe(150);
  });
});
