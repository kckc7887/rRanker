import { create } from 'zustand';
import type { CatalogProvider, ProviderSession, ScoreProvider } from '@/providers/contracts';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { FixtureCatalogProvider, FixtureProvider } from '@/providers/fixture-provider';
import { LxnsCatalogProvider } from '@/providers/lxns-catalog-provider';

export type SessionRestoreStatus = 'restoring' | 'ready' | 'error';

interface SessionState {
  session: ProviderSession | null;
  scoreProvider: ScoreProvider;
  catalogProvider: CatalogProvider;
  restoreStatus: SessionRestoreStatus;
  restoreError: string | null;
  setSession: (session: ProviderSession) => void;
  clearSession: () => void;
  finishRestore: (session: ProviderSession | null) => void;
  failRestore: (message: string) => void;
}

export const useSession = create<SessionState>((set) => ({
  session: null,
  scoreProvider: new FixtureProvider(),
  catalogProvider: new FixtureCatalogProvider(),
  restoreStatus: 'restoring',
  restoreError: null,
  setSession: (session) =>
    set({
      session,
      scoreProvider: new DivingFishProvider(session),
      catalogProvider: new LxnsCatalogProvider(),
      restoreStatus: 'ready',
      restoreError: null,
    }),
  clearSession: () =>
    set({
      session: null,
      scoreProvider: new FixtureProvider(),
      catalogProvider: new FixtureCatalogProvider(),
      restoreStatus: 'ready',
      restoreError: null,
    }),
  finishRestore: (session) => set(session ? {
    session,
    scoreProvider: new DivingFishProvider(session),
    catalogProvider: new LxnsCatalogProvider(),
    restoreStatus: 'ready',
    restoreError: null,
  } : {
    session: null,
    scoreProvider: new FixtureProvider(),
    catalogProvider: new FixtureCatalogProvider(),
    restoreStatus: 'ready',
    restoreError: null,
  }),
  failRestore: (message) => set({
    session: null,
    scoreProvider: new FixtureProvider(),
    catalogProvider: new FixtureCatalogProvider(),
    restoreStatus: 'error',
    restoreError: message,
  }),
}));

export async function restoreSession(load: () => Promise<ProviderSession | null>): Promise<void> {
  try {
    useSession.getState().finishRestore(await load());
  } catch {
    useSession.getState().failRestore('无法读取本机登录状态，当前使用脱敏测试数据');
  }
}
