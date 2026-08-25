import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const baselinePath = resolve('tests/fixtures/phigros-best-image/phigros.png');
const bundledPath = resolve('assets/phigros-b30-reference/otherimg/phigros.webp');

describe('Phigros 成绩图打包背景', () => {
  it('无损 WebP 不超过 400 KiB 且解码像素与原图完全一致', async () => {
    const [baseline, bundled, bundledStat] = await Promise.all([
      sharp(baselinePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(bundledPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      stat(bundledPath),
    ]);

    expect(bundled.info).toEqual(baseline.info);
    expect(Buffer.compare(bundled.data, baseline.data)).toBe(0);
    expect(bundledStat.size).toBeLessThanOrEqual(400 * 1024);
  });
});
