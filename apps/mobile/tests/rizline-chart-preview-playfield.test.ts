import { describe, expect, it } from 'vitest';
import { DESIGN_HEIGHT, DESIGN_WIDTH, FRAME_ASPECT, measurePlayfield } from '@/features/rizline-chart-preview/webview-player/renderer';

describe('Rizline 9:16 playfield', () => {
  it('fills 1080×1920 with no leftover field', () => {
    const metrics = measurePlayfield(DESIGN_WIDTH, DESIGN_HEIGHT);
    expect(metrics.fieldWidth).toBe(DESIGN_WIDTH);
    expect(metrics.frameHeight).toBe(DESIGN_HEIGHT);
    expect(metrics.noteScale).toBe(1);
    expect(metrics.judgeLineY).toBe(DESIGN_HEIGHT * 0.74);
    expect(metrics.centerX).toBe(DESIGN_WIDTH / 2);
  });

  it('letterboxes landscape canvases to 9:16 width', () => {
    const metrics = measurePlayfield(1920, 1080);
    expect(metrics.frameHeight).toBe(1080);
    expect(metrics.fieldWidth).toBe(1080 * FRAME_ASPECT);
    expect(metrics.noteScale).toBe(1080 / DESIGN_HEIGHT);
    expect(metrics.judgeLineY).toBe(1080 * 0.74);
  });

  it('letterboxes taller portrait canvases on the top and bottom', () => {
    const metrics = measurePlayfield(1080, 2400);
    expect(metrics.fieldWidth).toBe(1080);
    expect(metrics.frameHeight).toBe(1080 / FRAME_ASPECT);
    expect(metrics.noteScale).toBe(1);
  });
});
