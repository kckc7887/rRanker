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
  InteractionManager,
  type AppStateStatus,
} from 'react-native';
import {
  abortForegroundWork,
  beginForegroundWork,
  getAppLifecycleSnapshot,
  getForegroundAbortSignal,
  publishAppLifecycleSnapshot,
  waitForForeground,
  type AppLifecycleSnapshot,
} from '@/state/app-lifecycle-core';
export type { AppLifecyclePhase, AppLifecycleSnapshot } from '@/state/app-lifecycle-core';
export { getAppLifecycleSnapshot, getForegroundAbortSignal, waitForForeground };

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
  const [snapshot, setSnapshot] = useState<AppLifecycleSnapshot>(() => ({
    appState: initialState,
    phase: initialBackground ? 'background' : 'foreground-waiting',
    foregroundReady: false,
    foregroundGeneration: 0,
    memoryWarningGeneration: 0,
  }));
  const snapshotRef = useRef(snapshot);
  const readyTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);

  useEffect(() => {
    const update = (next: AppLifecycleSnapshot) => {
      snapshotRef.current = next;
      publishAppLifecycleSnapshot(next);
      setSnapshot(next);
    };
    const cancelReadyTask = () => {
      readyTaskRef.current?.cancel();
      readyTaskRef.current = null;
    };
    const enterWaiting = (appState: AppStateStatus | null | undefined) => {
      cancelReadyTask();
      abortForegroundWork();
      update({
        ...snapshotRef.current,
        appState,
        phase: appState === 'background' ? 'background' : 'foreground-waiting',
        foregroundReady: false,
      });
    };
    const scheduleReady = (appState: AppStateStatus | null | undefined) => {
      enterWaiting(appState);
      const expectedGeneration = snapshotRef.current.foregroundGeneration + 1;
      readyTaskRef.current = InteractionManager.runAfterInteractions(() => {
        readyTaskRef.current = null;
        if (snapshotRef.current.appState === 'background' || snapshotRef.current.appState === 'inactive') return;
        beginForegroundWork();
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
      if (appState === 'background' || appState === 'inactive') enterWaiting(appState);
      else scheduleReady(appState);
    };

    publishAppLifecycleSnapshot(snapshotRef.current);
    if (initialBackground) enterWaiting(initialState);
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
  }, [initialBackground, initialState]);

  const value = useMemo(() => snapshot, [snapshot]);
  return <AppLifecycleContext.Provider value={value}>{children}</AppLifecycleContext.Provider>;
}

export function useAppLifecycle(): AppLifecycleSnapshot {
  return useContext(AppLifecycleContext);
}
