// 生成 ariblk 子集字体，就地覆盖 assets/rating/ariblk.ttf。
// 用途：舞萌成绩图游戏风格 DX Rating 五位数字（build-maimai-best-image-html.ts 的
// `String(rating).padStart(5, '0')`），字符集仅数字。
// 用法：node scripts/subset-ariblk.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptDir, '..');
const fontPath = path.join(root, 'assets/rating/ariblk.ttf');
const manifestPath = path.join(scriptDir, 'ariblk-subset.json');

// 0-9 为实际渲染字符；空格、加号、句点、逗号、负号作为零成本兜底
const CHARSET = '0123456789 +.,-';

const fullFont = fs.readFileSync(fontPath);
const subsetBuffer = await subsetFont(fullFont, CHARSET, { preserveName: true });
fs.writeFileSync(fontPath, subsetBuffer);
fs.writeFileSync(manifestPath, JSON.stringify({ charset: CHARSET.split('').sort().join('') }, null, 2) + '\n');

console.log(`ariblk 子集：字体 ${fullFont.length} -> ${subsetBuffer.length} 字节（${(subsetBuffer.length / 1024).toFixed(1)} KB）`);
