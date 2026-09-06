import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { AREA_LOOKUP, SLIDE_TABLE } from '@/features/simai-chart-preview/engine/core/geometry/slideTable.generated';
import { EFFECT_SCENES, EFFECT_SPRITES, HOLD_PARTICLES } from '@/features/simai-chart-preview/engine/renderers/effectSprites.generated';
import { recompressPng } from '../scripts/lib/recompress-png.mjs';

const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function chunks(bytes: Buffer) {
  const result: { type: string; data: Buffer; bytes: Buffer }[] = [];
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    expect(end).toBeLessThanOrEqual(bytes.length);
    const chunk = bytes.subarray(offset, end);
    let crc = 0xffffffff;
    for (const byte of chunk.subarray(4, -4)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    expect((crc ^ 0xffffffff) >>> 0).toBe(chunk.readUInt32BE(chunk.length - 4));
    result.push({ type: chunk.toString('ascii', 4, 8), data: chunk.subarray(8, -4), bytes: chunk });
    offset = end;
  }
  return result;
}

describe('generated maimai data equivalence', () => {
  it('preserves all ViewX geometry values and effect scene definitions', () => {
    expect(Object.keys(SLIDE_TABLE)).toHaveLength(568);
    expect(Object.keys(AREA_LOOKUP)).toHaveLength(176);
    expect(sha256(JSON.stringify(SLIDE_TABLE))).toBe('5dfedaa9af82e74681b01afd1702c5b46f33a89cfc772659b157eea08586c547');
    expect(sha256(JSON.stringify(AREA_LOOKUP))).toBe('7866abd2d7fcfb8b1b4289094807bfbc8b6fb675f8420bb5801462b114d31492');
    expect(sha256(JSON.stringify(EFFECT_SCENES))).toBe('4d5765d763af399b6f454dea0481d5735d69ff8d8a3bfcdc80dce3649d415528');
    expect(sha256(JSON.stringify(HOLD_PARTICLES))).toBe('70de13944b5c548bb5bbde66bc42da973f5f341a291e09fa284bc99b99a61bf9');
  });

  for (const [name, sprite] of Object.entries(EFFECT_SPRITES)) {
    it(`preserves PNG pixels, color chunks and source provenance for ${name}`, async () => {
      const source = readFileSync(resolve('scripts/maimai-reference/Effects/Sprites/Effect', name));
      const encoded = Buffer.from(sprite.data.split(',')[1], 'base64');
      expect(sprite.sourceSha256).toBe(sha256(source));
      expect(sprite.sha256).toBe(sha256(encoded));
      expect(encoded.equals(recompressPng(source))).toBe(true);
      expect(recompressPng(encoded).equals(encoded)).toBe(true);
      expect(encoded.length).toBeLessThan(source.length);
      const original = chunks(source), optimized = chunks(encoded);
      const nonIdat = (all: ReturnType<typeof chunks>) => all.filter(c => c.type !== 'IDAT').map(c => c.bytes);
      expect(nonIdat(optimized)).toEqual(nonIdat(original));
      const scanlines = (all: ReturnType<typeof chunks>) => inflateSync(Buffer.concat(all.filter(c => c.type === 'IDAT').map(c => c.data)));
      expect(scanlines(optimized).equals(scanlines(original))).toBe(true);
      const [a, b] = await Promise.all([source, encoded].map(bytes => sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
      expect(b.info).toEqual(a.info);
      expect(b.data.equals(a.data)).toBe(true);
      expect([b.info.width, b.info.height]).toEqual([sprite.width, sprite.height]);
    });
  }

  it('rejects broken PNG input rather than generating corrupt player assets', () => {
    const source = readFileSync(resolve('scripts/maimai-reference/Effects/Sprites/Effect/Circle.png'));
    expect(() => recompressPng(Buffer.from('invalid'))).toThrow('signature');
    expect(() => recompressPng(source.subarray(0, -1))).toThrow('Truncated');
    const corrupt = Buffer.from(source);
    corrupt[29] ^= 1;
    expect(() => recompressPng(corrupt)).toThrow('CRC');
  });
});
