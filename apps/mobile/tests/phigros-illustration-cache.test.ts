import { describe, expect, it } from 'vitest';
import { partitionPhigrosIllustrationCache } from '@/features/phigros-best-image/phigros-illustration-cache';

describe('partitionPhigrosIllustrationCache', () => {
  it('复用已缓存曲绘，仅返回缺失 songId', () => {
    const cache = { a: 'data:a', b: null };
    expect(partitionPhigrosIllustrationCache(['a', 'b', 'c', 'a'], cache)).toEqual({
      next: { a: 'data:a', b: null, c: null },
      missing: ['c'],
    });
  });

  it('缓存全覆盖时 missing 为空', () => {
    expect(partitionPhigrosIllustrationCache(['x'], { x: 'data:x' })).toEqual({
      next: { x: 'data:x' },
      missing: [],
    });
  });
});
