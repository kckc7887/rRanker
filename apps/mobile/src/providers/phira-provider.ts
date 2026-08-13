import { z } from 'zod';
import {
  PhiraChartPageSchema, PhiraChartSchema, PhiraPoolResponseSchema, PhiraRecordListSchema,
  PhiraUserPageSchema, PhiraUserSchema, PhiraUserStatsSchema, type PhiraChartStatus,
} from '@/domain/phira';
import { ProviderError } from './errors';

export const PHIRA_API_BASE = 'https://phira.5wyxi.com';
type FetchLike = typeof fetch;

function statusError(status: number): ProviderError {
  if (status === 404) return new ProviderError('no_data', 'Phira 未找到对应数据', false);
  if (status === 429) return new ProviderError('rate_limit', 'Phira 请求过于频繁，请稍后重试', true);
  if (status >= 500) return new ProviderError('network', 'Phira 社区服务暂时不可用', true);
  return new ProviderError('unknown', `Phira 返回 HTTP ${status}`, false);
}

export class PhiraProvider {
  constructor(private readonly fetcher: FetchLike = fetch, private readonly baseUrl = PHIRA_API_BASE) {}

  private async request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-store' }, signal: controller.signal,
      });
      if (!response.ok) throw statusError(response.status);
      return schema.parse(await response.json());
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        throw new ProviderError('upstream_schema', 'Phira 数据结构与已验证契约不一致', true, { cause: error });
      }
      if (error instanceof ProviderError) throw error;
      if (signal?.aborted) throw error;
      throw error instanceof Error && error.name === 'AbortError'
        ? new ProviderError('timeout', 'Phira 数据读取超时', true, { cause: error })
        : new ProviderError('network', '无法连接 Phira 社区服务', true, { cause: error });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  getUser(id: number, signal?: AbortSignal) { return this.request(`/user/${id}`, PhiraUserSchema, signal); }
  getUserStats(id: number, signal?: AbortSignal) { return this.request(`/user/${id}/stats`, PhiraUserStatsSchema, signal); }
  getPool(id: number, signal?: AbortSignal) { return this.request(`/record/get-pool/${id}`, PhiraPoolResponseSchema, signal); }
  getRecent(id: number, signal?: AbortSignal) { return this.request(`/record?player=${id}`, PhiraRecordListSchema, signal); }
  getChartBest(playerId: number, chartId: number, signal?: AbortSignal) {
    return this.request(`/record?player=${playerId}&chart=${chartId}`, PhiraRecordListSchema, signal);
  }
  getChart(id: number, signal?: AbortSignal) { return this.request(`/chart/${id}`, PhiraChartSchema, signal); }
  getChartsByIds(ids: readonly number[], signal?: AbortSignal) {
    return ids.length ? this.request(`/chart/multi-get?ids=${ids.join(',')}`, z.array(PhiraChartSchema), signal) : Promise.resolve([]);
  }
  getRecordsByIds(ids: readonly number[], signal?: AbortSignal) {
    return ids.length ? this.request(`/record/multi-get?ids=${ids.join(',')}`, PhiraRecordListSchema, signal) : Promise.resolve([]);
  }
  getUploader(id: number, signal?: AbortSignal) { return this.getUser(id, signal); }
  searchUsers(query: string, signal?: AbortSignal) {
    return this.request(`/user?search=${encodeURIComponent(query.trim())}&page=0&pageNum=30`, PhiraUserPageSchema, signal)
      .then((page) => page.results);
  }
  getCharts(input: { status: PhiraChartStatus; page: number; pageNum?: number; search?: string }, signal?: AbortSignal) {
    const type = input.status === 'ranked' ? 0 : input.status === 'special' ? 1 : 2;
    const params = new URLSearchParams({ type: String(type), page: String(input.page), pageNum: String(input.pageNum ?? 30) });
    if (input.search?.trim()) params.set('search', input.search.trim());
    return this.request(`/chart?${params}`, PhiraChartPageSchema, signal);
  }
  async downloadChart(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
    const response = await this.fetcher(url, { signal });
    if (!response.ok) throw statusError(response.status);
    return response.arrayBuffer();
  }
}

export const phiraProvider = new PhiraProvider();
