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

const TERMINAL_PHASES: ReadonlySet<BestImageWebViewPhase> = new Set([
  'ready',
  'error',
  'crashed',
  'terminated',
  'timeout',
]);

/** 完成或失败后忽略迟到事件，避免页面状态倒退。 */
export function isBestImageWebViewTerminal(phase: BestImageWebViewPhase): boolean {
  return TERMINAL_PHASES.has(phase);
}

/** 设置页面状态；未提供版本时保留当前值。 */
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

/** 终态不会被渲染中状态覆盖。 */
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
