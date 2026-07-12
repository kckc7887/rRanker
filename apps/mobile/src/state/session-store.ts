import { create } from 'zustand';
import type { ProviderSession, ScoreProvider } from '@/providers/contracts';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { FixtureProvider } from '@/providers/fixture-provider';

interface SessionState {
  session: ProviderSession | null;
  provider: ScoreProvider;
  setSession: (session: ProviderSession) => void;
  clearSession: () => void;
}

export const useSession = create<SessionState>((set) => ({
  session: null,
  provider: new FixtureProvider(),
  setSession: (session) =>
    set({ session, provider: new DivingFishProvider(session) }),
  clearSession: () =>
    set({ session: null, provider: new FixtureProvider() }),
}));
