import { describe, expect, it } from 'vitest';
import { constrainCrop, cropFromTransform, cropPixels, transformFromCrop } from '@/components/image-crop';

describe('头像裁剪区域', () => {
  it.each([{ width: 1200, height: 600 }, { width: 600, height: 1200 }, { width: 800, height: 800 }])('centers a square on $width × $height and restores the selected crop', size => {
    const crop = cropFromTransform(size, 300, { zoom: 1, x: 0, y: 0 });
    const pixels = cropPixels(size, crop);
    expect(pixels.width).toBe(Math.min(size.width, size.height)); expect(pixels.height).toBe(pixels.width);
    expect(pixels.originX + pixels.width / 2).toBe(size.width / 2);
    expect(pixels.originY + pixels.height / 2).toBe(size.height / 2);
    const selected = cropFromTransform(size, 300, { zoom: 2.5, x: 50, y: -35 });
    const restored = cropFromTransform(size, 420, transformFromCrop(size, 420, selected));
    expect(restored.x).toBeCloseTo(selected.x); expect(restored.y).toBeCloseTo(selected.y);
    expect(restored.width).toBeCloseTo(selected.width); expect(restored.height).toBeCloseTo(selected.height);
  });
  it('bounds dragging and zoom so the circle never exposes empty image space', () => {
    const size = { width: 1200, height: 600 };
    const t = constrainCrop(size, 300, { zoom: 9, x: 10000, y: -10000 });
    expect(t.zoom).toBe(4);
    const pixels = cropPixels(size, cropFromTransform(size, 300, t));
    expect(pixels).toEqual({ originX: 0, originY: 450, width: 150, height: 150 });
    expect(constrainCrop(size, 300, { zoom: 0.1, x: 0, y: 0 }).zoom).toBe(1);
  });
});
