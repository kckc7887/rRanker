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

/** 路由仅携带短标识，避免大型谱面数据进入查询串。 */
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
