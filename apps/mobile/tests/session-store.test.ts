import {
  createLocalMaimaiAccount,
  createMaxedMaimaiTestAccount,
  createTestBoundAccount,
  LOCAL_MAIMAI_ACCOUNT_ID,
  MAIMAI_TEST_ACCOUNT_ID,
  TEST_ACCOUNT_ID,
} from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { EmptyCatalogProvider, EmptyScoreProvider } from '@/providers/empty-provider';
import { LxnsCatalogProvider } from '@/providers/lxns-catalog-provider';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { LocalMaimaiScoreProvider } from '@/providers/local-score-provider';
import { MaxedMaimaiTestProvider } from '@/providers/maxed-maimai-test-provider';
import { restoreSession, useSession } from '@/state/session-store';

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: vi.fn(async () => undefined),
    getFirstAsync: vi.fn(async () => null),
    runAsync: vi.fn(async () => undefined),
  })),
}));

const jwtSession: ProviderSession = { mode: 'jwt', value: 'fake-jwt-token', persistable: true };
const tokenSessionA: ProviderSession = { mode: 'import-token', value: 'token-a', persistable: true };
const tokenSessionB: ProviderSession = { mode: 'import-token', value: 'token-b', persistable: true };
const lxnsSession: ProviderSession = {
  mode: 'lxns-oauth',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 600_000,
  persistable: true,
};

describe('useSession store', () => {
  beforeEach(() => {
    useSession.setState({
      sessionsByAccountId: {},
      boundAccounts: [
        createLocalMaimaiAccount('本地玩家', 0),
        createMaxedMaimaiTestAccount(),
        createTestBoundAccount(),
      ],
      activeAccountId: LOCAL_MAIMAI_ACCOUNT_ID,
      session: null,
      activeGameId: 'maimai',
      activeProviderId: 'local',
      scoreProvider: new LocalMaimaiScoreProvider({
        initialize: vi.fn(async () => undefined),
        getLatest: vi.fn(async () => null),
        save: vi.fn(async () => undefined),
        clear: vi.fn(async () => undefined),
      }),
      catalogProvider: new LxnsCatalogProvider(),
      restoreStatus: 'ready',
      restoreError: null,
    });
  });

  it('always includes local, maxed maimai test and empty test accounts', () => {
    const { boundAccounts } = useSession.getState();
    expect(boundAccounts.map((account) => account.id)).toContain(LOCAL_MAIMAI_ACCOUNT_ID);
    expect(boundAccounts.map((account) => account.id)).toContain(MAIMAI_TEST_ACCOUNT_ID);
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
    const maimai = state.boundAccounts.find((account) => account.id === state.activeAccountId);
    expect(maimai?.displayName).toBe('尘言');
    expect(maimai?.scoreLabel).toBe('DX RATING');
    expect(maimai?.scoreDisplay).toBe('15000');
    expect(maimai?.providerTitle).toBe('水鱼查分器');
    expect(state.boundAccounts.some((account) => account.id === TEST_ACCOUNT_ID)).toBe(true);
  });

  it('binds an lxns oauth account onto LxnsScoreProvider', () => {
    useSession.getState().setSession(lxnsSession, {
      displayName: '落雪玩家',
      rating: 12000,
      playerId: '123456789000000',
      providerId: 'lxns',
    });
    const state = useSession.getState();
    expect(state.session).toEqual(lxnsSession);
    expect(state.activeProviderId).toBe('lxns');
    expect(state.scoreProvider).toBeInstanceOf(LxnsScoreProvider);
    expect(state.catalogProvider).toBeInstanceOf(LxnsCatalogProvider);
    expect(state.activeAccountId).toBe('maimai:lxns:123456789000000');
    expect(state.boundAccounts.find((account) => account.id === state.activeAccountId)?.providerTitle)
      .toBe('落雪查分器');
  });

  it('keeps multiple diving-fish accounts instead of replacing the previous one', () => {
    useSession.getState().setSession(tokenSessionA, {
      displayName: '账号甲',
      rating: 14000,
      playerId: 'a1',
      providerId: 'diving-fish',
    });
    useSession.getState().setSession(tokenSessionB, {
      displayName: '账号乙',
      rating: 15000,
      playerId: 'b2',
      providerId: 'diving-fish',
    });
    const state = useSession.getState();
    const maimaiIds = state.boundAccounts
      .filter((account) => account.gameId === 'maimai')
      .map((account) => account.id);
    expect(maimaiIds).toEqual(expect.arrayContaining([
      'maimai:diving-fish:a1',
      'maimai:diving-fish:b2',
    ]));
    expect(maimaiIds).toEqual(expect.arrayContaining([
      LOCAL_MAIMAI_ACCOUNT_ID,
      MAIMAI_TEST_ACCOUNT_ID,
    ]));
    expect(state.session).toEqual(tokenSessionB);
    expect(state.sessionsByAccountId['maimai:diving-fish:a1']).toEqual(tokenSessionA);
    expect(state.sessionsByAccountId['maimai:diving-fish:b2']).toEqual(tokenSessionB);

    useSession.getState().selectBoundAccount('maimai:diving-fish:a1');
    expect(useSession.getState().session).toEqual(tokenSessionA);
    expect(useSession.getState().activeAccountId).toBe('maimai:diving-fish:a1');
  });

  it('switches to the empty test account', () => {
    useSession.getState().selectBoundAccount(TEST_ACCOUNT_ID);
    const state = useSession.getState();
    expect(state.activeAccountId).toBe(TEST_ACCOUNT_ID);
    expect(state.activeGameId).toBe('test');
    expect(state.scoreProvider).toBeInstanceOf(EmptyScoreProvider);
    expect(state.catalogProvider).toBeInstanceOf(EmptyCatalogProvider);
  });

  it('switches to the generated maxed maimai test account', () => {
    useSession.getState().selectBoundAccount(MAIMAI_TEST_ACCOUNT_ID);
    const state = useSession.getState();
    expect(state.activeAccountId).toBe(MAIMAI_TEST_ACCOUNT_ID);
    expect(state.activeGameId).toBe('maimai');
    expect(state.activeProviderId).toBe('maimai-test');
    expect(state.scoreProvider).toBeInstanceOf(MaxedMaimaiTestProvider);
    expect(state.catalogProvider).toBeInstanceOf(LxnsCatalogProvider);
  });

  it('keeps multiple local players and rebuilds the active provider after renaming', async () => {
    const extra = createLocalMaimaiAccount('第二位玩家', 12345, 'maimai:local:second');
    useSession.getState().upsertBoundAccount(extra);
    useSession.getState().selectBoundAccount(extra.id);
    useSession.getState().renameLocalAccount(extra.id, '已改名玩家');

    const state = useSession.getState();
    expect(state.boundAccounts.filter((account) => account.providerId === 'local')).toHaveLength(2);
    expect(state.activeAccountId).toBe(extra.id);
    await expect(state.scoreProvider.getPlayer()).resolves.toMatchObject({
      id: extra.id,
      displayName: '已改名玩家',
    });
  });

  it('removes only the selected extra local player and keeps the default one', () => {
    const extraA = createLocalMaimaiAccount('本地 A', 10000, 'maimai:local:a');
    const extraB = createLocalMaimaiAccount('本地 B', 11000, 'maimai:local:b');
    useSession.getState().upsertBoundAccount(extraA);
    useSession.getState().upsertBoundAccount(extraB);
    useSession.getState().removeBoundAccount(extraA.id);

    const localIds = useSession.getState().boundAccounts
      .filter((account) => account.providerId === 'local')
      .map((account) => account.id);
    expect(localIds).toEqual([LOCAL_MAIMAI_ACCOUNT_ID, extraB.id]);
  });

  it('clears remote binds and restores all built-in accounts', () => {
    useSession.getState().setSession(jwtSession, { displayName: '尘言', rating: 1 });
    useSession.getState().clearSession();
    const state = useSession.getState();
    expect(state.session).toBeNull();
    expect(state.scoreProvider).toBeInstanceOf(LocalMaimaiScoreProvider);
    expect(state.boundAccounts.some((account) => account.id === LOCAL_MAIMAI_ACCOUNT_ID)).toBe(true);
    expect(state.boundAccounts.some((account) => account.id === MAIMAI_TEST_ACCOUNT_ID)).toBe(true);
    expect(state.boundAccounts.some((account) => account.id === TEST_ACCOUNT_ID)).toBe(true);
  });

  it('removes one bound account without wiping the other', () => {
    useSession.getState().setSession(tokenSessionA, {
      displayName: '账号甲',
      rating: 14000,
      playerId: 'a1',
      providerId: 'diving-fish',
    });
    useSession.getState().setSession(tokenSessionB, {
      displayName: '账号乙',
      rating: 15000,
      playerId: 'b2',
      providerId: 'diving-fish',
    });
    useSession.getState().removeBoundAccount('maimai:diving-fish:b2');
    const state = useSession.getState();
    expect(state.sessionsByAccountId['maimai:diving-fish:a1']).toEqual(tokenSessionA);
    expect(state.sessionsByAccountId['maimai:diving-fish:b2']).toBeUndefined();
    expect(state.activeAccountId).toBe('maimai:diving-fish:a1');
    expect(state.session).toEqual(tokenSessionA);
  });

  it('restores a persisted session before the app becomes ready', async () => {
    await restoreSession(async () => jwtSession);
    expect(useSession.getState()).toMatchObject({ session: jwtSession, restoreStatus: 'ready', restoreError: null });
    expect(useSession.getState().scoreProvider).toBeInstanceOf(DivingFishProvider);
  });

  it('restores a multi-account vault', async () => {
    await restoreSession(async () => ({
      version: 2 as const,
      activeAccountId: 'maimai:diving-fish:a1',
      accounts: [
        {
          id: 'maimai:diving-fish:a1',
          gameId: 'maimai' as const,
          providerId: 'diving-fish' as const,
          displayName: '账号甲',
          scoreDisplay: '14000',
          session: tokenSessionA,
        },
        {
          id: 'maimai:diving-fish:b2',
          gameId: 'maimai' as const,
          providerId: 'diving-fish' as const,
          displayName: '账号乙',
          scoreDisplay: '15000',
          session: tokenSessionB,
        },
      ],
    }));
    const state = useSession.getState();
    expect(state.activeAccountId).toBe('maimai:diving-fish:a1');
    expect(state.session).toEqual(tokenSessionA);
    expect(state.boundAccounts.map((account) => account.displayName)).toEqual(
      expect.arrayContaining(['账号甲', '账号乙']),
    );
  });

  it('restores a built-in account as the active account', async () => {
    await restoreSession(async () => ({
      version: 2 as const,
      activeAccountId: MAIMAI_TEST_ACCOUNT_ID,
      accounts: [],
    }));
    const state = useSession.getState();
    expect(state.activeAccountId).toBe(MAIMAI_TEST_ACCOUNT_ID);
    expect(state.session).toBeNull();
    expect(state.scoreProvider).toBeInstanceOf(MaxedMaimaiTestProvider);
  });

  it('restores an additional local player as the active account', async () => {
    const extra = createLocalMaimaiAccount('离线二号', 13579, 'maimai:local:offline-2');
    await restoreSession(
      async () => ({ version: 2 as const, activeAccountId: extra.id, accounts: [] }),
      async () => [createLocalMaimaiAccount('默认玩家', 0), extra],
    );

    const state = useSession.getState();
    expect(state.activeAccountId).toBe(extra.id);
    expect(state.activeProviderId).toBe('local');
    expect(state.boundAccounts).toEqual(expect.arrayContaining([extra]));
    await expect(state.scoreProvider.getPlayer()).resolves.toMatchObject({
      id: extra.id,
      displayName: '离线二号',
    });
  });

  it('falls back to local data and exposes a restore error', async () => {
    await restoreSession(async () => { throw new Error('secure store unavailable'); });
    expect(useSession.getState()).toMatchObject({ session: null, restoreStatus: 'error' });
    expect(useSession.getState().restoreError).toContain('无法读取');
    expect(useSession.getState().scoreProvider).toBeInstanceOf(LocalMaimaiScoreProvider);
  });
});
