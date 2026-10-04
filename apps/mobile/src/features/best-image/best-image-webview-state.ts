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

export function isBestImageWebViewTerminal(phase: BestImageWebViewPhase): boolean {
  return TERMINAL_PHASES.has(phase);
}

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
