// 生成 Ionicons 子集字体，就地覆盖 assets/fonts/Ionicons.ttf。
// 用法：node scripts/subset-ionicons.mjs
// 图标名来源：scripts/lib/scan-icon-names.mjs 扫描 app/ + src/ 全部字面量。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import { collectIoniconNames } from './lib/scan-icon-names.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptDir, '..');
const glyphmapPath = path.join(
  root,
  'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json',
);
const vendorFontPath = path.join(
  root,
  'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf',
);
const targetFontPath = path.join(root, 'assets/fonts/Ionicons.ttf');
const manifestPath = path.join(scriptDir, 'ionicons-subset.json');

const glyphmap = JSON.parse(fs.readFileSync(glyphmapPath, 'utf8'));
const scanned = collectIoniconNames(root);

const invalid = scanned.filter((name) => !(name in glyphmap));
if (invalid.length > 0) {
  throw new Error(`以下图标名不在 Ionicons glyphmap 中（拼写错误？）：${invalid.join(', ')}`);
}

// 手工兜底名单：即便当前源码未直接引用也保留，防止遗漏边角用法
const EXTRA_KEEP = [
  'add',
  'add-circle-outline',
  'arrow-back',
  'checkbox',
  'chevron-back',
  'chevron-down',
  'chevron-forward',
  'chevron-up',
  'close',
  'close-circle',
  'heart',
  'heart-outline',
  'home-outline',
  'lock-closed',
  'musical-notes-outline',
  'options-outline',
  'refresh',
  'search',
  'settings-outline',
  'square-outline',
  'stats-chart-outline',
  'trash-outline',
  'trophy-outline',
];

const names = [...new Set([...scanned, ...EXTRA_KEEP])].sort();
const codepoints = Object.fromEntries(names.map((name) => [name, glyphmap[name]]));
const text = names.map((name) => String.fromCodePoint(glyphmap[name])).join('');

const fullFont = fs.readFileSync(vendorFontPath);
const subsetBuffer = await subsetFont(fullFont, text, { preserveName: true });
fs.writeFileSync(targetFontPath, subsetBuffer);
fs.writeFileSync(manifestPath, JSON.stringify({ names, codepoints }, null, 2) + '\n');

console.log(
  `Ionicons 子集：${names.length} 个图标（扫描 ${scanned.length} + 兜底）` +
    `，字体 ${fullFont.length} -> ${subsetBuffer.length} 字节（${(subsetBuffer.length / 1024).toFixed(1)} KB）`,
);
