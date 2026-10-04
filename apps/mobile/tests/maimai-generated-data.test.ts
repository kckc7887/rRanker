import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { EFFECT_SPRITES } from '@/features/simai-chart-preview/engine/renderers/effectSprites.generated';
import { recompressPng } from '../scripts/lib/recompress-png.mjs';

describe('maimai effect sprite pixels', () => {
  for (const [name, sprite] of Object.entries(EFFECT_SPRITES)) {
    it('preserves decoded pixels for ' + name, async () => {
      const source = readFileSync(resolve('scripts/maimai-reference/Effects/Sprites/Effect', name));
      const encoded = Buffer.from(sprite.data.split(',')[1], 'base64');
      const [original, generated] = await Promise.all([source, encoded].map(bytes =>
        sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
      expect(generated.info).toEqual(original.info);
      expect(generated.data.equals(original.data)).toBe(true);
      expect([generated.info.width, generated.info.height]).toEqual([sprite.width, sprite.height]);
    });
  }

  it('recompresses a PNG without changing pixels', async () => {
    const source = readFileSync(resolve('scripts/maimai-reference/Effects/Sprites/Effect/Circle.png'));
    const compressed = recompressPng(source);
    const [original, optimized] = await Promise.all([source, compressed].map(bytes =>
      sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
    expect(optimized.info).toEqual(original.info);
    expect(optimized.data.equals(original.data)).toBe(true);
  });

  it('rejects malformed PNG input', () => {
    const source = readFileSync(resolve('scripts/maimai-reference/Effects/Sprites/Effect/Circle.png'));
    expect(() => recompressPng(Buffer.from('invalid'))).toThrow('signature');
    expect(() => recompressPng(source.subarray(0, -1))).toThrow('Truncated');
    const corrupt = Buffer.from(source);
    corrupt[29] ^= 1;
    expect(() => recompressPng(corrupt)).toThrow('CRC');
  });
});
