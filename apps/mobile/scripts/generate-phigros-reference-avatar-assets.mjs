import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const avatarDirectory = join(root, 'assets', 'phigros-b30-reference', 'avatar');
const output = join(root, 'src', 'features', 'phigros-best-image', 'phigros-reference-avatar-assets.generated.ts');
const names = readdirSync(avatarDirectory)
  .filter((name) => name.toLowerCase().endsWith('.png'))
  .map((name) => name.slice(0, -4))
  .sort((left, right) => left.localeCompare(right, 'zh-CN'));

const sourceLines = names.map((name) => {
  const assetPath = relative(dirname(output), join(avatarDirectory, `${name}.png`)).replaceAll('\\', '/');
  return `  ${JSON.stringify(name)}: require(${JSON.stringify(assetPath)}) as number,`;
});

const content = `/* 此文件由 scripts/generate-phigros-reference-avatar-assets.mjs 根据原项目头像目录生成。 */
export const PHIGROS_REFERENCE_AVATAR_SOURCES: Readonly<Record<string, number>> = {
${sourceLines.join('\n')}
};

export const PHIGROS_REFERENCE_AVATAR_KEYS = Object.freeze(Object.keys(PHIGROS_REFERENCE_AVATAR_SOURCES));
`;

writeFileSync(output, content, 'utf8');
