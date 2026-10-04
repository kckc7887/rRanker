/** 舞萌成绩图的 Rating 数字字体：node scripts/subset-ariblk.mjs。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptDir, '..');
const fontPath = path.join(root, 'assets/rating/ariblk.ttf');

const CHARSET = '0123456789';

const fullFont = fs.readFileSync(fontPath);
const subsetBuffer = await subsetFont(fullFont, CHARSET, { preserveName: true });
fs.writeFileSync(fontPath, subsetBuffer);

console.log(`ariblk 子集：字体 ${fullFont.length} -> ${subsetBuffer.length} 字节（${(subsetBuffer.length / 1024).toFixed(1)} KB）`);
