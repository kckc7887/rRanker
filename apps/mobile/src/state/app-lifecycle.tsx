import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  type AppStateStatus,
} from 'react-native';
import {
  abortForegroundWork,
  beginForegroundWork,
  ensureForegroundWork,
  getAppLifecycleSnapshot,
  getForegroundAbortSignal,
  publishAppLifecycleSnapshot,
  waitForForeground,
  type AppLifecycleSnapshot,
} from '@/state/app-lifecycle-core';
export type { AppLifecyclePhase, AppLifecycleSnapshot } from '@/state/app-lifecycle-core';
export { getAppLifecycleSnapshot, getForegroundAbortSignal, waitForForeground };

export function scheduleIdleTask(task: () => void): () => void {
  let cancelled = false;
  const run = () => { if (!cancelled) task(); };
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(run, { timeout: 1000 });
    return () => { cancelled = true; cancelIdleCallback(handle); };
  }
  const handle = setTimeout(run, 0);
  return () => { cancelled = true; clearTimeout(handle); };
}

const readyFallback: AppLifecycleSnapshot = {
  appState: 'active',
  phase: 'foreground-ready',
  foregroundReady: true,
  foregroundGeneration: 0,
  memoryWarningGeneration: 0,
};
const AppLifecycleContext = createContext<AppLifecycleSnapshot>(readyFallback);

export function AppLifecycleProvider({ children }: { children: ReactNode }) {
  const initialStateRef = useRef(AppState.currentState);
  const initialState = initialStateRef.current;
  const initialBackground = initialState === 'background';
  const initialInactive = initialState === 'inactive';
  const [snapshot, setSnapshot] = useState<AppLifecycleSnapshot>(() => ({
    appState: initialState,
    phase: initialBackground ? 'background' : initialInactive ? 'inactive' : 'foreground-waiting',
    foregroundReady: false,
    foregroundGeneration: 0,
    memoryWarningGeneration: 0,
  }));
  const snapshotRef = useRef(snapshot);
  const readyTaskRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let readyGeneration = 0;
    const update = (next: AppLifecycleSnapshot) => {
      snapshotRef.current = next;
      publishAppLifecycleSnapshot(next);
      setSnapshot(next);
    };
    const cancelReadyTask = () => {
      readyGeneration += 1;
      readyTaskRef.current?.();
      readyTaskRef.current = null;
    };
    const enterInactive = (appState: AppStateStatus | null | undefined) => {
      cancelReadyTask();
      update({
        ...snapshotRef.current,
        appState,
        phase: 'inactive',
        foregroundReady: false,
      });
    };
    const enterBackground = (appState: AppStateStatus | null | undefined) => {
      cancelReadyTask();
      abortForegroundWork();
      update({
        ...snapshotRef.current,
        appState,
        phase: 'background',
        foregroundReady: false,
      });
    };
    const scheduleReady = (appState: AppStateStatus | null | undefined) => {
      if (snapshotRef.current.phase === 'foreground-ready' && snapshotRef.current.appState === appState) {
        return;
      }
      const previous = snapshotRef.current;
      const startsForegroundGeneration = getForegroundAbortSignal().aborted
        || previous.foregroundGeneration === 0;
      cancelReadyTask();
      update({
        ...previous,
        appState,
        phase: 'foreground-waiting',
        foregroundReady: false,
      });
      const expectedGeneration = previous.foregroundGeneration + (startsForegroundGeneration ? 1 : 0);
      const scheduledGeneration = readyGeneration;
      readyTaskRef.current = scheduleIdleTask(() => {
        if (scheduledGeneration !== readyGeneration) return;
        readyGeneration += 1;
        readyTaskRef.current = null;
        if (snapshotRef.current.appState === 'background' || snapshotRef.current.appState === 'inactive') return;
        if (startsForegroundGeneration) beginForegroundWork();
        else ensureForegroundWork();
        update({
          ...snapshotRef.current,
          appState,
          phase: 'foreground-ready',
          foregroundReady: true,
          foregroundGeneration: expectedGeneration,
        });
      });
    };
    const applyState = (appState: AppStateStatus) => {
      if (appState === 'background') enterBackground(appState);
      else if (appState === 'inactive') enterInactive(appState);
      else scheduleReady(appState);
    };

    publishAppLifecycleSnapshot(snapshotRef.current);
    if (initialBackground) enterBackground(initialState);
    else if (initialInactive) enterInactive(initialState);
    else scheduleReady(initialState);

    const changeSubscription = AppState.addEventListener('change', applyState);
    const memorySubscription = AppState.addEventListener('memoryWarning', () => {
      update({
        ...snapshotRef.current,
        memoryWarningGeneration: snapshotRef.current.memoryWarningGeneration + 1,
      });
    });
    return () => {
      changeSubscription.remove();
      memorySubscription.remove();
      cancelReadyTask();
      abortForegroundWork();
    };
  }, [initialBackground, initialInactive, initialState]);

  const value = useMemo(() => snapshot, [snapshot]);
  return <AppLifecycleContext.Provider value={value}>{children}</AppLifecycleContext.Provider>;
}

export function useAppLifecycle(): AppLifecycleSnapshot {
  return useContext(AppLifecycleContext);
}
