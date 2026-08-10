import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const avatarDirectory = join(root, 'assets', 'phigros-b30-reference', 'avatar');
const output = join(root, 'src', 'features', 'phigros-best-image', 'phigros-reference-avatar-assets.generated.ts');
// macOS APFS 会把半浊音等组合字符规范化为 NFD，Metro 按 NFC 路径解析会导致 EAS 构建失败；
// 因此这些文件在磁盘上使用 ASCII 名称，仅在展示 key 上保留原始字符。
const AVATAR_KEY_OVERRIDES = new Map([
  ['MopeMope1', 'もぺもぺ1'],
  ['MopeMope2', 'もぺもぺ2'],
]);
const names = readdirSync(avatarDirectory)
  .filter((name) => name.toLowerCase().endsWith('.png'))
  .map((name) => name.slice(0, -4))
  .sort((left, right) => (AVATAR_KEY_OVERRIDES.get(left) ?? left).localeCompare(AVATAR_KEY_OVERRIDES.get(right) ?? right, 'zh-CN'));

const sourceLines = names.map((name) => {
  const displayKey = AVATAR_KEY_OVERRIDES.get(name) ?? name;
  const assetPath = relative(dirname(output), join(avatarDirectory, `${name}.png`)).replaceAll('\\', '/');
  return `  ${JSON.stringify(displayKey)}: require(${JSON.stringify(assetPath)}) as number,`;
});

const content = `/* 此文件由 scripts/generate-phigros-reference-avatar-assets.mjs 根据原项目头像目录生成。 */
export const PHIGROS_REFERENCE_AVATAR_SOURCES: Readonly<Record<string, number>> = {
${sourceLines.join('\n')}
};

export const PHIGROS_REFERENCE_AVATAR_KEYS = Object.freeze(Object.keys(PHIGROS_REFERENCE_AVATAR_SOURCES));
`;

writeFileSync(output, content, 'utf8');
