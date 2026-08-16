import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('ariblk 子集守卫', () => {
  it('成绩图 Rating 数字构造仍是五位数字且字符集覆盖 0-9', () => {
    const htmlBuilder = readFileSync(
      path.join(projectRoot, 'src/features/best-image/build-best-image-html.ts'),
      'utf8',
    );
    // .rating-digits 的文本来源必须保持为纯数字（padStart 五位）
    expect(htmlBuilder).toMatch(/String\([^)]*\)\.padStart\(5,\s*['"]0['"]\)/);
    const manifest = JSON.parse(readFileSync(path.join(projectRoot, 'scripts/ariblk-subset.json'), 'utf8')) as {
      charset: string;
    };
    for (const digit of '0123456789') {
      expect(manifest.charset.includes(digit), `子集缺少数字 ${digit}`).toBe(true);
    }
  });

  it('ariblk.ttf 为子集体积', () => {
    const fontBytes = readFileSync(path.join(projectRoot, 'assets/rating/ariblk.ttf')).length;
    expect(fontBytes, 'assets/rating/ariblk.ttf 疑似被全量字体覆盖，请重跑 scripts/subset-ariblk.mjs').toBeLessThan(48 * 1024);
  });
});
