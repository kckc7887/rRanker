import type { PhiraChart } from '@/domain/phira';

export type ChartPreviewNavigationRequest =
  | {
      game: 'phigros';
      songId: string;
      levelIndex: number;
      title: string;
    }
  | {
      game: 'phira';
      chart: PhiraChart;
    };

export type ChartPreviewNavigationHref = {
  pathname: '/songs/phigros-chart-preview';
  params: { requestId: string };
};

type Handoff = {
  request: ChartPreviewNavigationRequest;
  createdAt: number;
};

const MAX_HANDOFFS = 32;
const HANDOFF_TTL_MS = 10 * 60_000;
const handoffs = new Map<string, Handoff>();
let requestSequence = 0;

function pruneHandoffs(now: number): void {
  for (const [requestId, handoff] of handoffs) {
    if (now - handoff.createdAt > HANDOFF_TTL_MS) handoffs.delete(requestId);
  }
  while (handoffs.size >= MAX_HANDOFFS) {
    const oldest = handoffs.keys().next().value as string | undefined;
    if (!oldest) break;
    handoffs.delete(oldest);
  }
}

/**
 * 详情页到谱面确认页的进程内交接。
 *
 * 路由只携带短 ASCII requestId，歌曲 ID、标题和 Phira 谱面元数据不再经过
 * Expo Router 查询串；目标页再从同一公共交接表读取完整请求。
 */
export function stageChartPreviewNavigation(
  request: ChartPreviewNavigationRequest,
): ChartPreviewNavigationHref {
  const now = Date.now();
  pruneHandoffs(now);
  requestSequence = (requestSequence + 1) % Number.MAX_SAFE_INTEGER;
  const requestId = `cp-${now.toString(36)}-${requestSequence.toString(36)}`;
  handoffs.set(requestId, { request, createdAt: now });
  return {
    pathname: '/songs/phigros-chart-preview',
    params: { requestId },
  };
}

export function resolveChartPreviewNavigation(
  requestId: string | undefined,
): ChartPreviewNavigationRequest | null {
  if (!requestId) return null;
  const handoff = handoffs.get(requestId);
  if (!handoff) return null;
  if (Date.now() - handoff.createdAt > HANDOFF_TTL_MS) {
    handoffs.delete(requestId);
    return null;
  }
  return handoff.request;
}

export function discardChartPreviewNavigation(requestId: string): void {
  handoffs.delete(requestId);
}
