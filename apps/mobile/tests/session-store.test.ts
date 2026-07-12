import type { ProviderSession } from '@/providers/contracts';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { FixtureProvider } from '@/providers/fixture-provider';
import { useSession } from '@/state/session-store';

const jwtSession: ProviderSession = { mode: 'jwt', value: 'fake-jwt-token', persistable: true };
const importSession: ProviderSession = { mode: 'import-token', value: 'fake-import-token', persistable: true };

describe('useSession store', () => {
  beforeEach(() => {
    useSession.setState({ session: null, provider: new FixtureProvider() });
  });

  it('starts with no session and a FixtureProvider', () => {
    const { session, provider } = useSession.getState();
    expect(session).toBeNull();
    expect(provider).toBeInstanceOf(FixtureProvider);
  });

  it('switches to DivingFishProvider after a jwt session is set', () => {
    useSession.getState().setSession(jwtSession);
    const { session, provider } = useSession.getState();
    expect(session).toEqual(jwtSession);
    expect(provider).toBeInstanceOf(DivingFishProvider);
  });

  it('switches to DivingFishProvider after an import-token session is set', () => {
    useSession.getState().setSession(importSession);
    const { session, provider } = useSession.getState();
    expect(session).toEqual(importSession);
    expect(provider).toBeInstanceOf(DivingFishProvider);
  });

  it('clears back to no session and a FixtureProvider', () => {
    useSession.getState().setSession(jwtSession);
    useSession.getState().clearSession();
    const { session, provider } = useSession.getState();
    expect(session).toBeNull();
    expect(provider).toBeInstanceOf(FixtureProvider);
  });
});
