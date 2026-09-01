export type AppLifecyclePhase =
  | 'background'
  | 'inactive'
  | 'foreground-waiting'
  | 'foreground-ready';

export type AppLifecycleSnapshot = {
  appState: string | null | undefined;
  phase: AppLifecyclePhase;
  foregroundReady: boolean;
  foregroundGeneration: number;
  memoryWarningGeneration: number;
};

type ForegroundWaiter = {
  resolve: (snapshot: AppLifecycleSnapshot) => void;
  reject: (reason: Error) => void;
  signal?: AbortSignal;
  abortListener?: () => void;
};

const readyFallback: AppLifecycleSnapshot = {
  appState: 'active',
  phase: 'foreground-ready',
  foregroundReady: true,
  foregroundGeneration: 0,
  memoryWarningGeneration: 0,
};
const waiters = new Set<ForegroundWaiter>();
const abortedController = new AbortController();
abortedController.abort();
let currentSnapshot: AppLifecycleSnapshot = readyFallback;
let foregroundController: AbortController | null = new AbortController();

export function abortForegroundWork(): void {
  foregroundController?.abort();
  foregroundController = null;
}

export function beginForegroundWork(): void {
  foregroundController = new AbortController();
}

export function publishAppLifecycleSnapshot(snapshot: AppLifecycleSnapshot): void {
  currentSnapshot = snapshot;
  if (!snapshot.foregroundReady) return;
  for (const waiter of waiters) {
    if (waiter.signal && waiter.abortListener) {
      waiter.signal.removeEventListener('abort', waiter.abortListener);
    }
    waiter.resolve(snapshot);
  }
  waiters.clear();
}

export function getAppLifecycleSnapshot(): AppLifecycleSnapshot {
  return currentSnapshot;
}

export function getForegroundAbortSignal(): AbortSignal {
  return foregroundController?.signal ?? abortedController.signal;
}

export function waitForForeground(signal?: AbortSignal): Promise<AppLifecycleSnapshot> {
  if (signal?.aborted) return Promise.reject(new Error('foreground wait aborted'));
  if (currentSnapshot.foregroundReady) return Promise.resolve(currentSnapshot);
  return new Promise((resolve, reject) => {
    const waiter: ForegroundWaiter = { resolve, reject, signal };
    if (signal) {
      waiter.abortListener = () => {
        waiters.delete(waiter);
        reject(new Error('foreground wait aborted'));
      };
      signal.addEventListener('abort', waiter.abortListener, { once: true });
    }
    waiters.add(waiter);
  });
}
