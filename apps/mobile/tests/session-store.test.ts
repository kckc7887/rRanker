import {
  createLocalMaimaiAccount,
  createTestBoundAccount,
  LOCAL_MAIMAI_ACCOUNT_ID,
  TEST_ACCOUNT_ID,
} from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { EmptyCatalogProvider, EmptyScoreProvider } from '@/providers/empty-provider';
import { FixtureCatalogProvider, FixtureProvider } from '@/providers/fixture-provider';
import { LxnsCatalogProvider } from '@/providers/lxns-catalog-provider';
import { restoreSession, useSession } from '@/state/session-store';

const jwtSession: ProviderSession = { mode: 'jwt', value: 'fake-jwt-token', persistable: true };

describe('useSession store', () => {
  beforeEach(() => {
    useSession.setState({
      sessionsByGame: {},
      boundAccounts: [createLocalMaimaiAccount('测试玩家', 0), createTestBoundAccount()],
      activeAccountId: LOCAL_MAIMAI_ACCOUNT_ID,
      session: null,
      activeGameId: 'maimai',
      activeProviderId: 'diving-fish',
      scoreProvider: new FixtureProvider(),
      catalogProvider: new FixtureCatalogProvider(),
      restoreStatus: 'ready',
      restoreError: null,
    });
  });

  it('keeps only bound accounts and always includes the empty test account', () => {
    const { boundAccounts } = useSession.getState();
    expect(boundAccounts.map((account) => account.id)).toContain(LOCAL_MAIMAI_ACCOUNT_ID);
    expect(boundAccounts.map((account) => account.id)).toContain(TEST_ACCOUNT_ID);
  });

  it('binds a maimai account with display name and DX rating meta', () => {
    useSession.getState().setSession(jwtSession, {
      displayName: '尘言',
      rating: 15000,
      playerId: 'p1',
      providerId: 'diving-fish',
    });
    const state = useSession.getState();
    expect(state.session).toEqual(jwtSession);
    expect(state.scoreProvider).toBeInstanceOf(DivingFishProvider);
    expect(state.catalogProvider).toBeInstanceOf(LxnsCatalogProvider);
    const maimai = state.boundAccounts.find((account) => account.gameId === 'maimai');
    expect(maimai?.displayName).toBe('尘言');
    expect(maimai?.scoreLabel).toBe('DX RATING');
    expect(maimai?.scoreDisplay).toBe('15000');
    expect(maimai?.providerTitle).toBe('水鱼查分器');
    expect(state.boundAccounts.some((account) => account.id === TEST_ACCOUNT_ID)).toBe(true);
  });

  it('switches to the empty test account', () => {
    useSession.getState().selectBoundAccount(TEST_ACCOUNT_ID);
    const state = useSession.getState();
    expect(state.activeAccountId).toBe(TEST_ACCOUNT_ID);
    expect(state.activeGameId).toBe('test');
    expect(state.scoreProvider).toBeInstanceOf(EmptyScoreProvider);
    expect(state.catalogProvider).toBeInstanceOf(EmptyCatalogProvider);
  });

  it('clears the remote bind and restores local preview plus test account', () => {
    useSession.getState().setSession(jwtSession, { displayName: '尘言', rating: 1 });
    useSession.getState().clearSession();
    const state = useSession.getState();
    expect(state.session).toBeNull();
    expect(state.scoreProvider).toBeInstanceOf(FixtureProvider);
    expect(state.boundAccounts.some((account) => account.id === LOCAL_MAIMAI_ACCOUNT_ID)).toBe(true);
    expect(state.boundAccounts.some((account) => account.id === TEST_ACCOUNT_ID)).toBe(true);
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
