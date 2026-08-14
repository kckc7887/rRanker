import { describe, expect, it } from 'vitest';
import { dedupePhiraCharts, phiraCatalogNextPage } from '@/domain/phira-filters';
import type { PhiraChart, PhiraChartPage } from '@/domain/phira';

const chart = (id: number): PhiraChart => ({ id } as PhiraChart);
const page = (ids: number[], total?: number): PhiraChartPage => (
  { results: ids.map(chart), total } as PhiraChartPage
);

describe('phira catalog pagination（Phira /chart 分页契约）', () => {
  it('首页后跳过服务端重复的 page=1：0 → 2 → 3 → …', () => {
    const pages: PhiraChartPage[] = [page([1, 2], 10)];
    expect(phiraCatalogNextPage(pages, pages[0])).toBe(2);
    const afterSecond: PhiraChartPage[] = [page([1, 2], 10), page([3, 4], 10)];
    expect(phiraCatalogNextPage(afterSecond, afterSecond[1])).toBe(3);
  });

  it('累计数量达到 total 时停止翻页', () => {
    const pages: PhiraChartPage[] = [page([1, 2], 4), page([3, 4], 4)];
    expect(phiraCatalogNextPage(pages, pages[1])).toBeUndefined();
  });

  it('缺少 total 时按末页数量判断（满 30 继续，不足停止）', () => {
    const full: PhiraChartPage[] = [page(Array.from({ length: 30 }, (_, index) => index + 1))];
    expect(phiraCatalogNextPage(full, full[0])).toBe(2);
    const short: PhiraChartPage[] = [page([1, 2, 3])];
    expect(phiraCatalogNextPage(short, short[0])).toBeUndefined();
  });

  it('无末页时不再翻页', () => {
    expect(phiraCatalogNextPage([], undefined)).toBeUndefined();
  });
});

describe('phira catalog 跨页去重', () => {
  it('按 id 去重保序：跨页重复与相邻重复都只保留首个', () => {
    const values = [chart(3), chart(1), chart(3), chart(2), chart(1)];
    expect(dedupePhiraCharts(values).map((item) => item.id)).toEqual([3, 1, 2]);
  });

  it('无重复时原样保留', () => {
    const values = [chart(3), chart(1), chart(2)];
    expect(dedupePhiraCharts(values).map((item) => item.id)).toEqual([3, 1, 2]);
  });
});
