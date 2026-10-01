import { describe, expect, it } from 'vitest';
import { lowerBoundBy, upperBoundBy } from '@/features/chart-preview-shared/webview-player/sorted-search';

describe('chart preview sorted search', () => {
  const items = [{ t: 1 }, { t: 2 }, { t: 2 }, { t: 5 }];
  const read = (item: { t: number }) => item.t;

  it.each([
    [0, 0, 0], [1, 0, 1], [2, 1, 3], [3, 3, 3], [5, 3, 4], [9, 4, 4],
  ])('目标 %s 的下界 %s 与上界 %s', (target, lower, upper) => {
    expect(lowerBoundBy(items, target, read)).toBe(lower);
    expect(upperBoundBy(items, target, read)).toBe(upper);
  });

  it('空序列返回 0', () => {
    expect(lowerBoundBy([], 1, read)).toBe(0);
    expect(upperBoundBy([], 1, read)).toBe(0);
  });

  it('只读取对数级数量的元素', () => {
    const big = Array.from({ length: 1 << 16 }, (_, index) => index);
    let reads = 0;
    expect(lowerBoundBy(big, 40000, (value) => { reads++; return value; })).toBe(40000);
    expect(reads).toBeLessThanOrEqual(17);
  });
});
