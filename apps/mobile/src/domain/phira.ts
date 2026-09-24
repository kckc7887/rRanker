import { z } from 'zod';
import type { DataSource } from './models';

const nullableString = z.string().nullable().optional();
const finiteNumber = z.number().finite();

export const PhiraUserSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  avatar: nullableString,
  rks: finiteNumber.optional().default(0),
  bio: nullableString,
}).passthrough();

export const PhiraUserStatsSchema = z.object({
  numRecords: z.number().int().nonnegative().optional().default(0),
  avgAccuracy: finiteNumber.optional().default(0),
}).passthrough();

export const PhiraRecordSchema = z.object({
  id: z.number().int().positive(),
  player: z.number().int().positive().optional(),
  chart: z.number().int().positive(),
  score: z.number().int().nonnegative(),
  accuracy: finiteNumber,
  perfect: z.number().int().nonnegative().optional().default(0),
  good: z.number().int().nonnegative().optional().default(0),
  bad: z.number().int().nonnegative().optional().default(0),
  miss: z.number().int().nonnegative().optional().default(0),
  full_combo: z.boolean().optional(),
  fullCombo: z.boolean().optional(),
  best: z.boolean().optional().default(false),
  time: nullableString,
  created: nullableString,
}).passthrough().transform((record) => ({
  ...record,
  fullCombo: record.fullCombo ?? record.full_combo ?? false,
  created: record.created ?? record.time ?? null,
}));

export const PhiraChartSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  level: z.string().min(1),
  difficulty: finiteNumber,
  charter: z.string().optional().default(''),
  composer: z.string().optional().default(''),
  illustrator: nullableString,
  description: nullableString,
  ranked: z.boolean().optional().default(false),
  stable: z.boolean().optional().default(false),
  reviewed: z.boolean().optional(),
  illustration: nullableString,
  preview: nullableString,
  file: nullableString,
  uploader: z.number().int().positive(),
  tags: z.array(z.string()).optional().default([]),
  rating: finiteNumber.nullable().optional(),
  ratingCount: z.number().int().nonnegative().optional().default(0),
  created: nullableString,
  updated: nullableString,
  chartUpdated: nullableString,
}).passthrough();

export const PhiraPoolItemSchema = z.object({
  record: PhiraRecordSchema,
  chart: PhiraChartSchema,
  rks: finiteNumber,
}).passthrough();

export const PhiraPoolSchema = z.object({
  bestPool: z.array(PhiraPoolItemSchema).optional().default([]),
  recentPool: z.array(PhiraPoolItemSchema).optional().default([]),
  rks: finiteNumber.optional().default(0),
}).passthrough();

export const PhiraPoolSeedItemSchema = z.object({
  record: z.number().int().positive(), chart: z.number().int().positive(), rks: finiteNumber,
}).passthrough();
export const PhiraPoolResponseSchema = z.object({
  bestPool: z.array(PhiraPoolSeedItemSchema).optional().default([]),
  recentPool: z.array(PhiraPoolSeedItemSchema).optional().default([]),
  rks: finiteNumber.optional().default(0),
}).passthrough();

const pagedCharts = z.object({
  results: z.array(PhiraChartSchema).optional().default([]),
  count: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
  page: z.number().int().nonnegative().optional(),
  pageNum: z.number().int().positive().optional(),
}).passthrough();

/** 将数组和分页响应统一为分页对象。 */
export const PhiraChartPageSchema = z.union([pagedCharts, z.array(PhiraChartSchema)]).transform((value) =>
  Array.isArray(value) ? { results: value, total: value.length } : { ...value, total: value.total ?? value.count },
);
export const PhiraRecordListSchema = z.array(PhiraRecordSchema);
export const PhiraUserPageSchema = z.object({
  count: z.number().int().nonnegative().optional(), results: z.array(PhiraUserSchema).optional().default([]),
}).passthrough();

export type PhiraUser = z.infer<typeof PhiraUserSchema>;
export type PhiraUserStats = z.infer<typeof PhiraUserStatsSchema>;
export type PhiraRecord = z.infer<typeof PhiraRecordSchema>;
export type PhiraChart = z.infer<typeof PhiraChartSchema>;
export type PhiraPoolItem = z.infer<typeof PhiraPoolItemSchema>;
export type PhiraPool = z.infer<typeof PhiraPoolSchema>;
export type PhiraPoolResponse = z.infer<typeof PhiraPoolResponseSchema>;
export type PhiraChartPage = z.infer<typeof PhiraChartPageSchema>;

export type PhiraChartStatus = 'ranked' | 'special' | 'unstable';
export function phiraChartStatus(chart: Pick<PhiraChart, 'stable' | 'ranked'>): PhiraChartStatus {
  if (!chart.stable) return 'unstable';
  return chart.ranked ? 'ranked' : 'special';
}
export const PHIRA_STATUS_LABELS: Record<PhiraChartStatus, string> = {
  ranked: '上架', special: '特殊', unstable: '未上架',
};

export type PhiraNoteCounts = { click: number; hold: number; flick: number; drag: number };
export type PhiraQueriedBest = {
  chart: PhiraChart;
  record: PhiraRecord | null;
  poolRks: number | null;
  queriedAt: string;
};
export type PhiraPlayerSnapshot = {
  player: PhiraUser;
  stats: PhiraUserStats;
  pool: PhiraPool;
  recent: PhiraRecord[];
  /** Pool 与 Recent 中出现过的谱面去重补全结果。 */
  seedCharts: PhiraChart[];
  source: DataSource;
};
export type PhiraBestSnapshot = { items: Record<string, PhiraQueriedBest>; source: DataSource };
export type PhiraChartSnapshot = { chart: PhiraChart; source: DataSource };
export type PhiraNoteSnapshot = {
  chartUpdated: string | null;
  counts: PhiraNoteCounts | null;
  unavailableReason?: string;
  source: DataSource;
};

export const PHIRA_PLAYER_SCHEMA_VERSION = 1;
export const PHIRA_BEST_SCHEMA_VERSION = 1;
export const PHIRA_CHART_SCHEMA_VERSION = 1;
export const PHIRA_NOTE_SCHEMA_VERSION = 1;
export const PHIRA_PAGE_SCHEMA_VERSION = 1;
export const phiraPlayerCacheKey = (playerId: number) => `phira:player:${playerId}`;
export const phiraBestCacheKey = (playerId: number) => `phira:bests:${playerId}`;
export const phiraChartCacheKey = (chartId: number) => `phira:chart:${chartId}`;
export const phiraNoteCacheKey = (chartId: number) => `phira:notes:${chartId}`;
export const phiraPageCacheKey = (status: PhiraChartStatus, page: number, search = '') =>
  `phira:charts:${status}:${page}:${encodeURIComponent(search.trim())}`;

export function formatPhiraAccuracy(value: number): string {
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percent.toFixed(2)}%`;
}

/** OpenAPI 返回 0–1 的投票均值；客户端按游戏内五分制展示。 */
export function formatPhiraRating(value: number | null | undefined): string {
  return value == null ? '—' : `${(value * 5).toFixed(2)} / 5`;
}

export function phiraGrade(record: Pick<PhiraRecord, 'score' | 'fullCombo'>): string {
  if (record.score >= 1_000_000) return 'Phi';
  if (record.fullCombo) return 'FC';
  if (record.score >= 960_000) return 'V';
  if (record.score >= 920_000) return 'S';
  if (record.score >= 880_000) return 'A';
  if (record.score >= 820_000) return 'B';
  if (record.score >= 700_000) return 'C';
  return 'F';
}

/** 筛选结果为空时自动翻页的扫描预算：耗尽后暂停自动翻页，避免空结果无限扫描。 */
export const PHIRA_CATALOG_PAGE_SCAN_BUDGET = 8;

/**
 * Phira 曲库分页判别状态：初次加载/初次失败是与 ready 互不混淆的终态；
 * ready 恒带 items（可以为空数组），并独立描述后页情况，
 * 因此「预算暂停 / 后页失败 / 尚未搜完」不会再被压成同一个布尔组合。
 */
export type PhiraCatalogPageState<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | {
    status: 'ready';
    /** 已加载并筛选后的条目；可以为空数组。 */
    items: readonly T[];
    /** 上游还有后页。 */
    hasNextPage: boolean;
    /** 结果为空且仍在扫描后页（预算内自动翻页，或正在请求后页）。 */
    scanning: boolean;
    /** 结果为空且有后页，但扫描预算已耗尽：需要用户显式继续。 */
    paused: boolean;
    /** 上一次后页请求失败；已加载结果保持不变。 */
    nextPageFailed: boolean;
    /** 后页已耗尽：当前 items 就是全部结果，空数组表示确认没有匹配。 */
    exhausted: boolean;
  };

export function phiraCatalogPageState<T>(input: {
  items: readonly T[];
  pageCount: number;
  hasNextPage: boolean;
  isLoading: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  scanBudget?: number;
}): PhiraCatalogPageState<T> {
  const { items, pageCount, hasNextPage, isFetchingNextPage, isFetchNextPageError } = input;
  const scanBudget = input.scanBudget ?? PHIRA_CATALOG_PAGE_SCAN_BUDGET;
  if (input.isLoading && pageCount === 0) return { status: 'loading' };
  if (input.isError && pageCount === 0) return { status: 'error' };
  const empty = items.length === 0;
  const nextPageFailed = hasNextPage && isFetchNextPageError;
  return {
    status: 'ready',
    items,
    hasNextPage,
    scanning: empty && hasNextPage && !nextPageFailed && (isFetchingNextPage || pageCount < scanBudget),
    paused: empty && hasNextPage && !nextPageFailed && !isFetchingNextPage && pageCount >= scanBudget,
    nextPageFailed,
    exhausted: !hasNextPage,
  };
}

/** 共享列表壳（CatalogListPage）渲染输入：由判别状态派生，保证不存在「无加载、无错误、无空态、无 data」的组合。 */
export type PhiraCatalogListView<T> = {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  data: readonly T[] | undefined;
  /** 空态原因：exhausted=后页耗尽确认无结果；scanBudget=预算耗尽但仍有后页，不等于全库无结果。 */
  emptyReason?: 'exhausted' | 'scanBudget';
};

export function phiraCatalogListView<T>(state: PhiraCatalogPageState<T>): PhiraCatalogListView<T> {
  if (state.status === 'loading') return { isLoading: true, isError: false, isEmpty: false, data: undefined };
  if (state.status === 'error') return { isLoading: false, isError: true, isEmpty: false, data: undefined };
  if (state.paused) {
    return { isLoading: false, isError: false, isEmpty: true, data: undefined, emptyReason: 'scanBudget' };
  }
  if (state.exhausted && state.items.length === 0) {
    return { isLoading: false, isError: false, isEmpty: true, data: undefined, emptyReason: 'exhausted' };
  }
  return { isLoading: false, isError: false, isEmpty: false, data: state.items };
}
