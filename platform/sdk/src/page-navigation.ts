import type { pluginHref } from './navigation';

type PageHref = ReturnType<typeof pluginHref>;
type Handoff = { payload: unknown; createdAt: number };
const handoffs = new Map<string, Handoff>();
const HANDOFF_TTL_MS = 10 * 60_000;
let requestSequence = 0;

export const PLUGIN_PAGE_NAVIGATION_CHECK_DELAY_MS = 600;

/** 大型页面载荷仅在内存交接，路由携带短标识。 */
export function stagePluginPage(href: PageHref, payload: unknown): PageHref {
  const now = Date.now();
  for (const [id, handoff] of handoffs) {
    if (now - handoff.createdAt > HANDOFF_TTL_MS) handoffs.delete(id);
  }
  while (handoffs.size >= 32) {
    const oldest = handoffs.keys().next().value;
    if (oldest === undefined) break;
    handoffs.delete(oldest);
  }
  requestSequence = (requestSequence + 1) % Number.MAX_SAFE_INTEGER;
  const requestId = `page-${now.toString(36)}-${requestSequence.toString(36)}`;
  handoffs.set(requestId, { payload, createdAt: now });
  return { ...href, params: { ...href.params, requestId } };
}

export function resolvePluginPagePayload(requestId: string | undefined): unknown {
  if (!requestId) return null;
  const handoff = handoffs.get(requestId);
  if (!handoff) return null;
  if (Date.now() - handoff.createdAt > HANDOFF_TTL_MS) {
    handoffs.delete(requestId);
    return null;
  }
  return handoff.payload;
}

export function discardPluginPagePayload(requestId: string): void {
  handoffs.delete(requestId);
}

export function openPluginPage(href: PageHref | null, options: {
  payload?: unknown;
  push: (href: PageHref) => void;
  topRouteName: () => string | undefined;
  onFail: (message: string) => void;
}): () => void {
  let staged: PageHref | null = null;
  try {
    if (!href) throw new Error('工具未启用');
    staged = options.payload === undefined ? href : stagePluginPage(href, options.payload);
    options.push(staged);
  } catch {
    if (staged?.params.requestId) discardPluginPagePayload(staged.params.requestId);
    options.onFail('无法打开页面，请重试。');
    return () => undefined;
  }
  const timer = setTimeout(() => {
    if (options.topRouteName() === 'detail') options.onFail('页面跳转未生效，请重试');
  }, PLUGIN_PAGE_NAVIGATION_CHECK_DELAY_MS);
  return () => clearTimeout(timer);
}
