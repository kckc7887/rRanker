import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { strict as assert } from 'node:assert';
import sharp from 'sharp';
import { recompressPng } from './lib/recompress-png.mjs';

const baselineSha = process.env.OPTIMIZATION_BASELINE_SHA ?? '246f0bbe57bb9a23ce21858c82c53b3066aad3d9';
const files = execFileSync('git', ['ls-files', '--', 'assets'], { encoding: 'utf8' }).trim().split('\n').filter((path) => path.endsWith('.png'));
const optimize = process.argv.includes('--optimize');
function chunks(bytes) {
  const result = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    result.push({ type: bytes.toString('ascii', offset + 4, offset + 8), data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += length + 12;
  }
  return result;
}
const report = [];
for (const path of files) {
  const original = execFileSync('git', ['show', `${baselineSha}:apps/mobile/${path}`], { maxBuffer: 64 * 1024 * 1024 });
  const current = readFileSync(path);
  const candidate = optimize ? recompressPng(current) : current;
  if (original.equals(candidate)) continue;
  // Validate every chunk's CRC, then independently compare scanlines, ancillary
  // bytes and decoded RGBA. No color-profile/XMP stripping or recompression.
  recompressPng(candidate);
  const before = chunks(original), after = chunks(candidate);
  const metadata = (list) => list.filter((chunk) => chunk.type !== 'IDAT');
  assert.deepEqual(metadata(after), metadata(before), `${path}: ancillary/color metadata changed`);
  const scanlines = (list) => inflateSync(Buffer.concat(list.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data)));
  assert(scanlines(after).equals(scanlines(before)), `${path}: filtered scanlines changed`);
  const pixels = await Promise.all([original, candidate].map((bytes) => sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  assert.deepEqual(pixels[1].info, pixels[0].info, `${path}: geometry/channels changed`);
  assert(pixels[1].data.equals(pixels[0].data), `${path}: decoded pixels/alpha changed`);
  assert(candidate.length <= original.length, `${path}: resource grew`);
  if (optimize && !current.equals(candidate)) writeFileSync(path, candidate);
  report.push({ path, beforeBytes: original.length, afterBytes: candidate.length, savedBytes: original.length - candidate.length });
}
mkdirSync('build', { recursive: true });
writeFileSync('build/optimization-lossless-assets.json', JSON.stringify({ baselineSha, files: report }, null, 2) + '\n');
console.log(`Verified ${report.length} changed PNGs: ${report.reduce((sum, row) => sum + row.savedBytes, 0)} bytes saved, identical pixels/alpha and all non-IDAT chunks.`);
