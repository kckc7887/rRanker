import { useEffect, type Dispatch, type SetStateAction } from 'react';

export type BestImageWebViewPhase =
  | 'loading'
  | 'loaded'
  | 'rendering'
  | 'ready'
  | 'timeout'
  | 'error'
  | 'crashed'
  | 'terminated';

export type BestImageWebViewState = { phase: BestImageWebViewPhase; version: string | null };

/** 各成绩图片板块共用的 WebView 渲染状态文案（与各板块原文案逐字一致）。 */
export const BEST_IMAGE_WEBVIEW_PHASE_LABELS: Record<BestImageWebViewPhase, string> = {
  loading: '正在加载',
  loaded: '页面已载入，等待渲染',
  rendering: '正在渲染',
  ready: '渲染就绪',
  timeout: '响应超时',
  error: '加载失败',
  crashed: '渲染进程崩溃',
  terminated: '渲染进程已终止',
};

const TERMINAL_PHASES: ReadonlySet<BestImageWebViewPhase> = new Set([
  'ready',
  'error',
  'crashed',
  'terminated',
  'timeout',
]);

/** 终态判定：到达后不再被后续渲染事件覆盖（ready/error/crashed/terminated/timeout）。 */
export function isBestImageWebViewTerminal(phase: BestImageWebViewPhase): boolean {
  return TERMINAL_PHASES.has(phase);
}

/** 设置某页 WebView 状态；version 缺省时沿用上一状态的值（与原各板块实现一致）。 */
export function updateBestImageWebViewState(
  setStates: Dispatch<SetStateAction<Record<string, BestImageWebViewState>>>,
  pageId: string,
  phase: BestImageWebViewPhase,
  version?: string | null,
): void {
  setStates((current) => ({
    ...current,
    [pageId]: {
      phase,
      version: version === undefined ? current[pageId]?.version ?? null : version,
    },
  }));
}

/** 渲染中状态：终态时保持原阶段不覆盖（舞萌板块的既有保护语义）。 */
export function updateBestImageWebViewRenderingState(
  setStates: Dispatch<SetStateAction<Record<string, BestImageWebViewState>>>,
  pageId: string,
  version?: string | null,
): void {
  setStates((current) => {
    const state = current[pageId];
    const terminal = state ? isBestImageWebViewTerminal(state.phase) : false;
    return {
      ...current,
      [pageId]: {
        phase: terminal && state ? state.phase : 'rendering',
        version: version === undefined ? state?.version ?? null : version,
      },
    };
  });
}

/** 页面加载完成：仍处于 loading 时才置为 loaded（各板块共用的 WebView onLoadEnd 语义）。 */
export function markBestImageWebViewLoaded(
  setStates: Dispatch<SetStateAction<Record<string, BestImageWebViewState>>>,
  pageId: string,
): void {
  setStates((current) => (
    current[pageId] && current[pageId]!.phase !== 'loading'
      ? current
      : { ...current, [pageId]: { phase: 'loaded', version: current[pageId]?.version ?? null } }
  ));
}

/**
 * 渲染超时：页面就绪前长时间无响应则置为 timeout（舞萌板块的既有 12 秒保护）。
 * enabled 对应「WebView 页面源已就绪」；phase 为当前页阶段。
 */
export function useBestImageWebViewTimeout(
  enabled: boolean,
  pageId: string,
  phase: BestImageWebViewPhase | undefined,
  setStates: Dispatch<SetStateAction<Record<string, BestImageWebViewState>>>,
  timeoutMs = 12_000,
): void {
  useEffect(() => {
    if (!enabled || !phase || isBestImageWebViewTerminal(phase)) return;
    const timeout = setTimeout(() => {
      setStates((current) => {
        const state = current[pageId];
        if (state && isBestImageWebViewTerminal(state.phase)) return current;
        return { ...current, [pageId]: { phase: 'timeout', version: state?.version ?? null } };
      });
    }, timeoutMs);
    return () => clearTimeout(timeout);
  }, [enabled, pageId, phase, setStates, timeoutMs]);
}
