// Phigros B30 参考图背景降分辨率：宽超过 2160（最高导出档）时 Lanczos 降到 2160 宽并重编码 PNG。
// 用法：node scripts/optimize-phigros-background.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptDir, '..');
const target = path.join(root, 'assets/phigros-b30-reference/otherimg/phigros.png');
const MAX_WIDTH = 2160;

const meta = await sharp(target).metadata();
if (!meta.width || meta.width <= MAX_WIDTH) {
  console.log(`phigros.png 当前 ${meta.width}x${meta.height}，不超过 ${MAX_WIDTH}，跳过`);
  process.exit(0);
}

const before = fs.statSync(target).size;
const buffer = await sharp(target)
  .resize({ width: MAX_WIDTH, kernel: 'lanczos3' })
  .png({ compressionLevel: 9, palette: false })
  .toBuffer();
fs.writeFileSync(target, buffer);
const after = buffer.length;
console.log(
  `phigros.png：${meta.width}x${meta.height} -> ${MAX_WIDTH}x${Math.round((meta.height * MAX_WIDTH) / meta.width)}` +
    `，${before} -> ${after} 字节（节省 ${(((before - after) / before) * 100).toFixed(1)}%）`,
);
