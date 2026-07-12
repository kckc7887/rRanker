import type { ProviderSession } from '@/providers/contracts';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { FixtureCatalogProvider, FixtureProvider } from '@/providers/fixture-provider';
import { LxnsCatalogProvider } from '@/providers/lxns-catalog-provider';
import { restoreSession, useSession } from '@/state/session-store';

const jwtSession: ProviderSession = { mode: 'jwt', value: 'fake-jwt-token', persistable: true };
const importSession: ProviderSession = { mode: 'import-token', value: 'fake-import-token', persistable: true };

describe('useSession store', () => {
  beforeEach(() => {
    useSession.setState({
      session: null,
      scoreProvider: new FixtureProvider(),
      catalogProvider: new FixtureCatalogProvider(),
      restoreStatus: 'ready',
      restoreError: null,
    });
  });

  it('starts with no session and a FixtureProvider', () => {
    const { session, scoreProvider, catalogProvider } = useSession.getState();
    expect(session).toBeNull();
    expect(scoreProvider).toBeInstanceOf(FixtureProvider);
    expect(catalogProvider).toBeInstanceOf(FixtureCatalogProvider);
  });

  it('switches to DivingFishProvider after a jwt session is set', () => {
    useSession.getState().setSession(jwtSession);
    const { session, scoreProvider, catalogProvider } = useSession.getState();
    expect(session).toEqual(jwtSession);
    expect(scoreProvider).toBeInstanceOf(DivingFishProvider);
    expect(catalogProvider).toBeInstanceOf(LxnsCatalogProvider);
  });

  it('switches to DivingFishProvider after an import-token session is set', () => {
    useSession.getState().setSession(importSession);
    const { session, scoreProvider } = useSession.getState();
    expect(session).toEqual(importSession);
    expect(scoreProvider).toBeInstanceOf(DivingFishProvider);
  });

  it('clears back to no session and a FixtureProvider', () => {
    useSession.getState().setSession(jwtSession);
    useSession.getState().clearSession();
    const { session, scoreProvider } = useSession.getState();
    expect(session).toBeNull();
    expect(scoreProvider).toBeInstanceOf(FixtureProvider);
  });

  it('restores a persisted session before the app becomes ready', async () => {
    await restoreSession(async () => jwtSession);
    expect(useSession.getState()).toMatchObject({ session: jwtSession, restoreStatus: 'ready', restoreError: null });
    expect(useSession.getState().scoreProvider).toBeInstanceOf(DivingFishProvider);
  });

  it('falls back to fixture and exposes a restore error', async () => {
    await restoreSession(async () => { throw new Error('secure store unavailable'); });
    expect(useSession.getState()).toMatchObject({ session: null, restoreStatus: 'error' });
    expect(useSession.getState().restoreError).toContain('无法读取');
    expect(useSession.getState().scoreProvider).toBeInstanceOf(FixtureProvider);
  });
});
