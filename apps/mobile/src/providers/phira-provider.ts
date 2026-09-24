import { z } from 'zod';
import {
  PhiraChartPageSchema, PhiraChartSchema, PhiraPoolResponseSchema, PhiraRecordListSchema,
  PhiraUserPageSchema, PhiraUserSchema, PhiraUserStatsSchema, type PhiraChartStatus,
} from '@/domain/phira';
import type { RuntimeRequestScenario } from '@/domain/runtime-log';
import { providerErrorFromStatus, type ProviderError, type ProviderStatusTexts } from './errors';
import { requestJson } from './http-json';

export const PHIRA_API_BASE = 'https://phira.5wyxi.com';
type FetchLike = typeof fetch;

const PHIRA_STATUS_TEXTS: ProviderStatusTexts = {
  noData: 'Phira 未找到对应数据',
  rateLimit: 'Phira 请求过于频繁，请稍后重试',
  server: 'Phira 社区服务暂时不可用',
  fallback: { message: (status) => `Phira 返回 HTTP ${status}` },
};

function statusError(status: number): ProviderError {
  return providerErrorFromStatus(status, PHIRA_STATUS_TEXTS);
}

export class PhiraProvider {
  constructor(private readonly fetcher: FetchLike = fetch, private readonly baseUrl = PHIRA_API_BASE) {}

  private request<T>(
    path: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
    diagnosticScenario?: RuntimeRequestScenario,
  ): Promise<T> {
    return requestJson({
      baseUrl: this.baseUrl,
      path,
      schema,
      fetcher: this.fetcher,
      signal,
      label: 'Phira',
      timeoutMs: 12_000,
      retries: 1,
      diagnosticScenario,
      error: statusError,
      messages: {
        schema: 'Phira 数据结构与已验证契约不一致',
        timeout: 'Phira 数据读取超时',
        network: '无法连接 Phira 社区服务',
      },
    });
  }

  getUser(id: number, signal?: AbortSignal) {
    return this.request(`/user/${id}`, PhiraUserSchema, signal, 'player-profile');
  }
  getUserStats(id: number, signal?: AbortSignal) {
    return this.request(`/user/${id}/stats`, PhiraUserStatsSchema, signal, 'player-profile');
  }
  getPool(id: number, signal?: AbortSignal) {
    return this.request(`/record/get-pool/${id}`, PhiraPoolResponseSchema, signal, 'scores');
  }
  getRecent(id: number, signal?: AbortSignal) {
    return this.request(`/record?player=${id}`, PhiraRecordListSchema, signal, 'scores');
  }
  getChartBest(playerId: number, chartId: number, signal?: AbortSignal) {
    return this.request(`/record?player=${playerId}&chart=${chartId}`, PhiraRecordListSchema, signal, 'scores');
  }
  getChart(id: number, signal?: AbortSignal) {
    return this.request(`/chart/${id}`, PhiraChartSchema, signal, 'chart-detail');
  }
  getChartsByIds(ids: readonly number[], signal?: AbortSignal) {
    return ids.length
      ? this.request(`/chart/multi-get?ids=${ids.join(',')}`, z.array(PhiraChartSchema), signal, 'chart-search')
      : Promise.resolve([]);
  }
  getRecordsByIds(ids: readonly number[], signal?: AbortSignal) {
    return ids.length
      ? this.request(`/record/multi-get?ids=${ids.join(',')}`, PhiraRecordListSchema, signal, 'scores')
      : Promise.resolve([]);
  }
  getUploader(id: number, signal?: AbortSignal) { return this.getUser(id, signal); }
  searchUsers(query: string, signal?: AbortSignal) {
    return this.request(
      `/user?search=${encodeURIComponent(query.trim())}&page=0&pageNum=30`,
      PhiraUserPageSchema,
      signal,
      'player-search',
    ).then((page) => page.results);
  }
  getCharts(input: { status: PhiraChartStatus; page: number; pageNum?: number; search?: string }, signal?: AbortSignal) {
    const type = input.status === 'ranked' ? 0 : input.status === 'special' ? 1 : 2;
    const params = new URLSearchParams({ type: String(type), page: String(input.page), pageNum: String(input.pageNum ?? 30) });
    if (input.search?.trim()) params.set('search', input.search.trim());
    return this.request(`/chart?${params}`, PhiraChartPageSchema, signal, 'chart-search');
  }
  async downloadChart(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
    if (signal?.aborted) throw signal.reason ?? new Error('操作已取消');
    const response = await this.fetcher(url, { signal });
    if (!response.ok) throw statusError(response.status);
    return response.arrayBuffer();
  }
}

export const phiraProvider = new PhiraProvider();
