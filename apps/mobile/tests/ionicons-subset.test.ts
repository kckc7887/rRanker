import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectIoniconNames } from '../scripts/lib/scan-icon-names.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const glyphmapPath = path.join(
  projectRoot,
  'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json',
);
const manifestPath = path.join(projectRoot, 'scripts/ionicons-subset.json');
const fontPath = path.join(projectRoot, 'assets/fonts/Ionicons.ttf');

describe('Ionicons 子集守卫', () => {
  it('源码全部图标名都在子集清单内（新增图标需重跑 scripts/subset-ionicons.mjs）', () => {
    const scanned = collectIoniconNames(projectRoot);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { names: string[] };
    const missing = scanned.filter((name) => !manifest.names.includes(name));
    expect(missing, `以下图标不在子集内，运行 node scripts/subset-ionicons.mjs 后重试：${missing.join(', ')}`).toEqual([]);
  });

  it('子集清单全部名称存在于 glyphmap 且字体为子集体积', () => {
    const glyphmap = JSON.parse(readFileSync(glyphmapPath, 'utf8')) as Record<string, number>;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { names: string[] };
    for (const name of manifest.names) {
      expect(name in glyphmap, `子集清单中的 ${name} 不在 glyphmap`).toBe(true);
    }
    const fontBytes = readFileSync(fontPath).length;
    expect(fontBytes, 'assets/fonts/Ionicons.ttf 疑似被全量字体覆盖，请重跑 scripts/subset-ionicons.mjs').toBeLessThan(64 * 1024);
  });
});
