import {
  LxnsCatalogProvider,
  MaxedMaimaiTestProvider,
  ProviderError,
  buildScoreSnapshot,
  type FetchLike,
  type ScoreSnapshot,
} from '@rranker/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DesktopSnapshotRepository,
  addDemoAccount,
  asCachedSnapshot,
  deleteDemoAccount,
  initializeDesktopState,
  type DesktopAccount,
} from '../data/database';

export type RuntimePhase = 'booting' | 'loading' | 'ready' | 'empty' | 'error';

export type AppRuntimeValue = {
  phase: RuntimePhase;
  account: DesktopAccount | null;
  snapshot: ScoreSnapshot | null;
  isRefreshing: boolean;
  error: ProviderError | Error | null;
  refresh(): Promise<void>;
  removeDemo(): Promise<void>;
  restoreDemo(): Promise<void>;
};

const missingProvider = async () => {
  throw new Error('AppRuntimeProvider is missing');
};

export const AppRuntimeContext = createContext<AppRuntimeValue>({
  phase: 'booting',
  account: null,
  snapshot: null,
  isRefreshing: false,
  error: null,
  refresh: missingProvider,
  removeDemo: missingProvider,
  restoreDemo: missingProvider,
});

const startupRefreshes = new Map<string, Promise<ScoreSnapshot>>();

function normalizeError(error: unknown): ProviderError | Error {
  return error instanceof Error ? error : new Error('发生了未知错误');
}

async function loadFreshDemoSnapshot(
  account: DesktopAccount,
  repository: DesktopSnapshotRepository,
): Promise<ScoreSnapshot> {
  const catalogProvider = new LxnsCatalogProvider(
    tauriFetch as unknown as FetchLike,
  );
  const scoreProvider = new MaxedMaimaiTestProvider(
    account.id,
    account.displayName,
  );
  const catalog = await catalogProvider.getDetailedCatalog();
  await repository.saveCatalog(catalog);
  const [player, records] = await Promise.all([
    scoreProvider.getPlayer(),
    scoreProvider.getRecordsFromCatalog(catalog),
  ]);
  const snapshot = buildScoreSnapshot(player, records, catalog);
  await repository.save(account.id, snapshot);
  return snapshot;
}

export function AppRuntimeProvider({ children }: { children: ReactNode }) {
  const repository = useMemo(() => new DesktopSnapshotRepository(), []);
  const [phase, setPhase] = useState<RuntimePhase>('booting');
  const [account, setAccount] = useState<DesktopAccount | null>(null);
  const [snapshot, setSnapshot] = useState<ScoreSnapshot | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<ProviderError | Error | null>(null);

  const applyRefresh = useCallback(
    async (target: DesktopAccount, startup: boolean) => {
      setIsRefreshing(true);
      setError(null);
      try {
        let promise: Promise<ScoreSnapshot>;
        if (startup) {
          promise =
            startupRefreshes.get(target.id) ??
            loadFreshDemoSnapshot(target, repository);
          startupRefreshes.set(target.id, promise);
        } else {
          promise = loadFreshDemoSnapshot(target, repository);
        }
        const fresh = await promise;
        setSnapshot(fresh);
        setPhase('ready');
      } catch (refreshError) {
        setError(normalizeError(refreshError));
        setPhase((current) => (current === 'ready' ? 'ready' : 'error'));
      } finally {
        setIsRefreshing(false);
      }
    },
    [repository],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const state = await initializeDesktopState();
        if (!active) return;
        setAccount(state.activeAccount);
        if (!state.activeAccount) {
          setPhase('empty');
          return;
        }
        const cached = await repository.getLatest(state.activeAccount.id);
        if (!active) return;
        if (cached) {
          setSnapshot(asCachedSnapshot(cached));
          setPhase('ready');
        } else {
          setPhase('loading');
        }
        void applyRefresh(state.activeAccount, true);
      } catch (initializationError) {
        if (!active) return;
        setError(normalizeError(initializationError));
        setPhase('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [applyRefresh, repository]);

  const refresh = useCallback(async () => {
    if (!account || isRefreshing) return;
    await applyRefresh(account, false);
  }, [account, applyRefresh, isRefreshing]);

  const removeDemo = useCallback(async () => {
    await deleteDemoAccount();
    setAccount(null);
    setSnapshot(null);
    setError(null);
    setPhase('empty');
  }, []);

  const restoreDemo = useCallback(async () => {
    const restored = await addDemoAccount();
    setAccount(restored);
    setError(null);
    const cached = await repository.getLatest(restored.id);
    if (cached) {
      setSnapshot(asCachedSnapshot(cached));
      setPhase('ready');
    } else {
      setSnapshot(null);
      setPhase('loading');
    }
    await applyRefresh(restored, false);
  }, [applyRefresh, repository]);

  const value = useMemo<AppRuntimeValue>(
    () => ({
      phase,
      account,
      snapshot,
      isRefreshing,
      error,
      refresh,
      removeDemo,
      restoreDemo,
    }),
    [
      account,
      error,
      isRefreshing,
      phase,
      refresh,
      removeDemo,
      restoreDemo,
      snapshot,
    ],
  );

  return (
    <AppRuntimeContext.Provider value={value}>
      {children}
    </AppRuntimeContext.Provider>
  );
}

export function useAppRuntime(): AppRuntimeValue {
  return useContext(AppRuntimeContext);
}
