import { describe, expect, it } from 'vitest';
import { dedupePhiraCharts, phiraCatalogNextPage } from '@/domain/phira-filters';
import {
  PHIRA_CATALOG_PAGE_SCAN_BUDGET,
  phiraCatalogListView,
  phiraCatalogPageState,
  type PhiraCatalogPageState,
  type PhiraChart,
  type PhiraChartPage,
} from '@/domain/phira';

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

type PageInput = Parameters<typeof phiraCatalogPageState<number>>[0];
const pageInput = (patch: Partial<PageInput> = {}): PageInput => ({
  items: [], pageCount: 1, hasNextPage: true,
  isLoading: false, isError: false, isFetchingNextPage: false, isFetchNextPageError: false,
  ...patch,
});
const readyState = (patch: Partial<PageInput> = {}): Extract<PhiraCatalogPageState<number>, { status: 'ready' }> => {
  const state = phiraCatalogPageState(pageInput(patch));
  if (state.status !== 'ready') throw new Error(`期望 ready，实际 ${state.status}`);
  return state;
};

describe('phira catalog 分页判别状态', () => {
  it('初次加载与初次失败是独立终态，不与 ready 混淆', () => {
    expect(phiraCatalogPageState(pageInput({ pageCount: 0, isLoading: true }))).toEqual({ status: 'loading' });
    expect(phiraCatalogPageState(pageInput({ pageCount: 0, isError: true }))).toEqual({ status: 'error' });
  });

  it('ready 恒带 items（可为空数组），并各自独立描述后页情况', () => {
    expect(readyState({ pageCount: 1 })).toEqual({
      status: 'ready', items: [], hasNextPage: true,
      scanning: true, paused: false, nextPageFailed: false, exhausted: false,
    });
    expect(readyState({ pageCount: 1, isFetchingNextPage: true })).toMatchObject({ scanning: true, paused: false });
    expect(readyState({ pageCount: PHIRA_CATALOG_PAGE_SCAN_BUDGET }))
      .toMatchObject({ items: [], scanning: false, paused: true, nextPageFailed: false, exhausted: false });
    expect(readyState({ pageCount: 2, isFetchNextPageError: true }))
      .toMatchObject({ scanning: false, paused: false, nextPageFailed: true });
    expect(readyState({ hasNextPage: false }))
      .toMatchObject({ scanning: false, paused: false, nextPageFailed: false, exhausted: true });
  });

  it('预算耗尽但仍有后页时是暂停而不是已耗尽，也不是全库无结果', () => {
    const paused = readyState({ pageCount: PHIRA_CATALOG_PAGE_SCAN_BUDGET });
    expect(paused.items).toEqual([]);
    expect(paused.hasNextPage).toBe(true);
    expect(paused.exhausted).toBe(false);
  });

  it('预算耗尽后用户显式继续时回到扫描中，停手后重新暂停', () => {
    expect(readyState({ pageCount: PHIRA_CATALOG_PAGE_SCAN_BUDGET + 1, isFetchingNextPage: true }))
      .toMatchObject({ scanning: true, paused: false });
    expect(readyState({ pageCount: PHIRA_CATALOG_PAGE_SCAN_BUDGET + 1 }))
      .toMatchObject({ scanning: false, paused: true });
  });

  it('后页失败时保留已加载 items，并在有结果时不再自动扫描', () => {
    expect(readyState({ items: [1, 2], pageCount: 3, isFetchNextPageError: true }))
      .toMatchObject({ items: [1, 2], nextPageFailed: true, scanning: false, exhausted: false });
    expect(readyState({ items: [1], pageCount: 1 }))
      .toMatchObject({ items: [1], scanning: false, paused: false, exhausted: false });
  });

  it('已有结果但后页失败仍保留结果', () => {
    expect(readyState({ items: [7], pageCount: 2, isFetchNextPageError: true }).items).toEqual([7]);
  });
});

describe('phira catalog 列表渲染映射', () => {
  it('任何状态下都不会落到「无加载、无错误、无空态、无 data」的永久 spinner 组合', () => {
    const states: PhiraCatalogPageState<number>[] = [
      phiraCatalogPageState(pageInput({ pageCount: 0, isLoading: true })),
      phiraCatalogPageState(pageInput({ pageCount: 0, isError: true })),
      phiraCatalogPageState(pageInput()),
      phiraCatalogPageState(pageInput({ pageCount: PHIRA_CATALOG_PAGE_SCAN_BUDGET })),
      phiraCatalogPageState(pageInput({ isFetchNextPageError: true })),
      phiraCatalogPageState(pageInput({ hasNextPage: false })),
      phiraCatalogPageState(pageInput({ items: [1, 2] })),
      phiraCatalogPageState(pageInput({ items: [1, 2], isFetchNextPageError: true })),
    ];
    for (const state of states) {
      const view = phiraCatalogListView(state);
      expect(view.isLoading || view.isError || view.isEmpty || view.data !== undefined).toBe(true);
    }
  });

  it('预算暂停标记为可继续的空态，已耗尽标记为已确认无结果', () => {
    expect(phiraCatalogListView(phiraCatalogPageState(pageInput({ pageCount: PHIRA_CATALOG_PAGE_SCAN_BUDGET }))))
      .toEqual({ isLoading: false, isError: false, isEmpty: true, data: undefined, emptyReason: 'scanBudget' });
    expect(phiraCatalogListView(phiraCatalogPageState(pageInput({ hasNextPage: false }))))
      .toEqual({ isLoading: false, isError: false, isEmpty: true, data: undefined, emptyReason: 'exhausted' });
  });

  it('扫描中与后页失败时把（可能为空的）items 交给列表，由页脚表达继续/重试', () => {
    expect(phiraCatalogListView(phiraCatalogPageState(pageInput())))
      .toEqual({ isLoading: false, isError: false, isEmpty: false, data: [] });
    expect(phiraCatalogListView(phiraCatalogPageState(pageInput({ isFetchNextPageError: true }))))
      .toEqual({ isLoading: false, isError: false, isEmpty: false, data: [] });
    expect(phiraCatalogListView(phiraCatalogPageState(pageInput({ items: [1, 2] }))).data).toEqual([1, 2]);
  });
});
