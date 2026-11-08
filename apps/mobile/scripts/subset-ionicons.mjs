/** 生成当前使用的图标字体：node scripts/subset-ionicons.mjs。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import subsetFont from 'subset-font';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptDir, '..');
const require = createRequire(import.meta.url);
const iconsRoot = path.dirname(require.resolve('@expo/vector-icons/package.json'));
const glyphmapPath = path.join(
  iconsRoot,
  'build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json',
);
const vendorFontPath = path.join(
  iconsRoot,
  'build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf',
);
const targetFontPath = path.join(root, 'assets/fonts/Ionicons.ttf');

const glyphmap = JSON.parse(fs.readFileSync(glyphmapPath, 'utf8'));
const used = new Set();
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.[jt]sx?$/.test(entry.name)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const [, name] of source.matchAll(/['"`]([a-z0-9-]+)['"`]/g)) {
        if (name in glyphmap) used.add(name);
      }
    }
  }
}
for (const directory of ['app', 'src', '../../platform/sdk/src', '../../plugins']) scan(path.join(root, directory));
const names = [...used].sort();
const text = names.map((name) => String.fromCodePoint(glyphmap[name])).join('');

const fullFont = fs.readFileSync(vendorFontPath);
const subsetBuffer = await subsetFont(fullFont, text, { preserveName: true });
fs.writeFileSync(targetFontPath, subsetBuffer);

console.log(
  `Ionicons 子集：${names.length} 个图标` +
    `，字体 ${fullFont.length} -> ${subsetBuffer.length} 字节（${(subsetBuffer.length / 1024).toFixed(1)} KB）`,
);
