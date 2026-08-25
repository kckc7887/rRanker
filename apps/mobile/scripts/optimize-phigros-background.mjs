// Phigros B30 背景保持原始像素，以无损 WebP 降低安装包静态资源体积。
// 用法：node scripts/optimize-phigros-background.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptDir, '..');
const baseline = path.join(root, 'tests/fixtures/phigros-best-image/phigros.png');
const target = path.join(root, 'assets/phigros-b30-reference/otherimg/phigros.webp');

const before = fs.statSync(baseline).size;
const buffer = await sharp(baseline)
  .webp({ lossless: true, effort: 6 })
  .toBuffer();
fs.writeFileSync(target, buffer);
const after = buffer.length;
console.log(`phigros.webp：${before} -> ${after} 字节（节省 ${(((before - after) / before) * 100).toFixed(1)}%）`);
