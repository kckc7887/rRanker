import {
  CHUNITHM_TEST_ACCOUNT_ID,
  CHUNITHM_TEMP_ACCOUNT_ID,
  PHIGROS_TEST_ACCOUNT_ID,
  createMaxedChunithmTestAccount,
  createChunithmTempAccount,
  createLocalMaimaiAccount,
  createMaxedMaimaiTestAccount,
  createMaxedMuseDashTestAccount,
  createMaxedPhigrosTestAccount,
  createMuseDashBoundAccount,
  createPhiraBoundAccount,
  createTestBoundAccount,
  createTufBoundAccount,
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
import { MaxedPhigrosTestProvider } from '@/providers/maxed-phigros-test-provider';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import {
  applyLxnsTokenRotation,
  restoreSession,
  UNBOUND_ACCOUNT_ID,
  useSession,
} from '@/state/session-store';

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

  it('does not re-inject deleted local or demo accounts', () => {
    useSession.getState().removeBoundAccount(LOCAL_MAIMAI_ACCOUNT_ID);
    useSession.getState().removeBoundAccount(MAIMAI_TEST_ACCOUNT_ID);
    const { boundAccounts } = useSession.getState();
    expect(boundAccounts.map((account) => account.id)).not.toContain(LOCAL_MAIMAI_ACCOUNT_ID);
    expect(boundAccounts.map((account) => account.id)).not.toContain(MAIMAI_TEST_ACCOUNT_ID);
    expect(boundAccounts.map((account) => account.id)).toContain(TEST_ACCOUNT_ID);
  });

  it('enters unbound empty state when all accounts are removed', () => {
    useSession.getState().removeBoundAccount(LOCAL_MAIMAI_ACCOUNT_ID);
    useSession.getState().removeBoundAccount(MAIMAI_TEST_ACCOUNT_ID);
    useSession.getState().removeBoundAccount(TEST_ACCOUNT_ID);
    const state = useSession.getState();
    expect(state.boundAccounts).toEqual([]);
    expect(state.activeAccountId).toBe(UNBOUND_ACCOUNT_ID);
    expect(state.activeProviderId).toBeNull();
    expect(state.scoreProvider).toBeInstanceOf(EmptyScoreProvider);
    expect(state.catalogProvider).toBeInstanceOf(EmptyCatalogProvider);
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

  it('switches to the no-score Chunithm temporary account', () => {
    useSession.getState().upsertBoundAccount(createChunithmTempAccount());
    useSession.getState().selectBoundAccount(CHUNITHM_TEMP_ACCOUNT_ID);
    const state = useSession.getState();
    expect(state.activeAccountId).toBe(CHUNITHM_TEMP_ACCOUNT_ID);
    expect(state.activeGameId).toBe('chunithm');
    expect(state.activeProviderId).toBe('chunithm-temp');
    expect(state.scoreProvider).toBeInstanceOf(EmptyScoreProvider);
    expect(state.catalogProvider).toBeInstanceOf(EmptyCatalogProvider);
    expect(state.session).toBeNull();
  });

  it('switches to the generated maxed maimai demo account', () => {
    useSession.getState().selectBoundAccount(MAIMAI_TEST_ACCOUNT_ID);
    const state = useSession.getState();
    expect(state.activeAccountId).toBe(MAIMAI_TEST_ACCOUNT_ID);
    expect(state.activeGameId).toBe('maimai');
    expect(state.activeProviderId).toBe('maimai-test');
    expect(state.scoreProvider).toBeInstanceOf(MaxedMaimaiTestProvider);
    expect(state.catalogProvider).toBeInstanceOf(LxnsCatalogProvider);
  });

  it('switches to the generated maxed Chunithm demo account', () => {
    useSession.getState().upsertBoundAccount(createMaxedChunithmTestAccount());
    useSession.getState().selectBoundAccount(CHUNITHM_TEST_ACCOUNT_ID);
    const state = useSession.getState();
    expect(state.activeAccountId).toBe(CHUNITHM_TEST_ACCOUNT_ID);
    expect(state.activeGameId).toBe('chunithm');
    expect(state.activeProviderId).toBe('chunithm-test');
    expect(state.scoreProvider).toBeInstanceOf(EmptyScoreProvider);
    expect(state.catalogProvider).toBeInstanceOf(EmptyCatalogProvider);
    expect(state.session).toBeNull();
  });

  it('switches to the generated maxed Phigros demo account', () => {
    useSession.getState().upsertBoundAccount(createMaxedPhigrosTestAccount());
    useSession.getState().selectBoundAccount(PHIGROS_TEST_ACCOUNT_ID);
    const state = useSession.getState();
    expect(state.activeAccountId).toBe(PHIGROS_TEST_ACCOUNT_ID);
    expect(state.activeGameId).toBe('phigros');
    expect(state.activeProviderId).toBe('phigros-test');
    expect(state.scoreProvider).toBeInstanceOf(MaxedPhigrosTestProvider);
    expect(state.catalogProvider).toBeInstanceOf(PhigrosCatalogProvider);
    expect(state.session).toBeNull();
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

  it('can remove the default local player and keep other locals', () => {
    const extraA = createLocalMaimaiAccount('本地 A', 10000, 'maimai:local:a');
    const extraB = createLocalMaimaiAccount('本地 B', 11000, 'maimai:local:b');
    useSession.getState().upsertBoundAccount(extraA);
    useSession.getState().upsertBoundAccount(extraB);
    useSession.getState().removeBoundAccount(LOCAL_MAIMAI_ACCOUNT_ID);

    const localIds = useSession.getState().boundAccounts
      .filter((account) => account.providerId === 'local')
      .map((account) => account.id);
    expect(localIds).toEqual([extraA.id, extraB.id]);
  });

  it('clears remote binds and keeps remaining local/demo accounts', () => {
    useSession.getState().upsertBoundAccount(createChunithmTempAccount());
    useSession.getState().upsertBoundAccount(createMaxedChunithmTestAccount());
    useSession.getState().upsertBoundAccount(createMaxedPhigrosTestAccount());
    useSession.getState().setSession(jwtSession, { displayName: '尘言', rating: 1 });
    useSession.getState().clearSession();
    const state = useSession.getState();
    expect(state.session).toBeNull();
    expect(state.scoreProvider).toBeInstanceOf(LocalMaimaiScoreProvider);
    expect(state.boundAccounts.some((account) => account.id === LOCAL_MAIMAI_ACCOUNT_ID)).toBe(true);
    expect(state.boundAccounts.some((account) => account.id === MAIMAI_TEST_ACCOUNT_ID)).toBe(true);
    expect(state.boundAccounts.some((account) => account.id === CHUNITHM_TEMP_ACCOUNT_ID)).toBe(true);
    expect(state.boundAccounts.some((account) => account.id === CHUNITHM_TEST_ACCOUNT_ID)).toBe(true);
    expect(state.boundAccounts.some((account) => account.id === PHIGROS_TEST_ACCOUNT_ID)).toBe(true);
    expect(state.boundAccounts.some((account) => account.providerId === 'diving-fish')).toBe(false);
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

  it('restores Phigros RKS precision and challenge metadata from v3 vault', () => {
    const session = { mode: 'phi-session', sessionToken: 'phi-token', playerId: 'phi-player', persistable: true } as const;
    useSession.getState().finishRestore({
      version: 3,
      activeAccountId: 'phigros:phi-taptap:phi-player',
      credentials: [{
        id: 'credential:phi',
        providerId: 'phi-taptap',
        session,
      }],
      accounts: [{
        id: 'phigros:phi-taptap:phi-player', gameId: 'phigros', providerId: 'phi-taptap',
        credentialId: 'credential:phi',
        displayName: 'phi-player', scoreDisplay: '15.4321', challengeModeRank: 523,
      }],
    });
    expect(useSession.getState().boundAccounts[0]).toMatchObject({
      scoreDisplay: '15.4321', challengeModeRank: 523,
    });
  });

  it('restores a multi-account vault', async () => {
    await restoreSession(async () => ({
      version: 3 as const,
      activeAccountId: 'maimai:diving-fish:a1',
      credentials: [
        { id: 'credential:a1', providerId: 'diving-fish' as const, session: tokenSessionA },
        { id: 'credential:b2', providerId: 'diving-fish' as const, session: tokenSessionB },
      ],
      accounts: [
        {
          id: 'maimai:diving-fish:a1',
          gameId: 'maimai' as const,
          providerId: 'diving-fish' as const,
          credentialId: 'credential:a1',
          displayName: '账号甲',
          scoreDisplay: '14000',
        },
        {
          id: 'maimai:diving-fish:b2',
          gameId: 'maimai' as const,
          providerId: 'diving-fish' as const,
          credentialId: 'credential:b2',
          displayName: '账号乙',
          scoreDisplay: '15000',
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

  it('propagates an LXNS token rotation to every account sharing the credential', async () => {
    const lxnsSession = {
      mode: 'lxns-oauth',
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      expiresAt: Date.now() + 60_000,
      persistable: true,
    } as const;
    useSession.getState().finishRestore({
      version: 3,
      activeAccountId: 'chunithm:lxns:2',
      credentials: [{ id: 'lxns:shared', providerId: 'lxns', session: lxnsSession }],
      accounts: [
        {
          id: 'maimai:lxns:1',
          gameId: 'maimai',
          providerId: 'lxns',
          credentialId: 'lxns:shared',
          displayName: '舞萌玩家',
          scoreDisplay: '15000',
        },
        {
          id: 'chunithm:lxns:2',
          gameId: 'chunithm',
          providerId: 'lxns',
          credentialId: 'lxns:shared',
          displayName: '中二玩家',
          scoreDisplay: '17.25',
          ratingPossession: 'rainbow',
        },
      ],
    });
    const rotated = {
      ...lxnsSession,
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
    };

    await applyLxnsTokenRotation('chunithm:lxns:2', rotated);

    expect(useSession.getState().sessionsByAccountId).toMatchObject({
      'maimai:lxns:1': rotated,
      'chunithm:lxns:2': rotated,
    });
    expect(useSession.getState().boundAccounts.find(
      (account) => account.id === 'chunithm:lxns:2',
    )?.ratingPossession).toBe('rainbow');
    expect(useSession.getState().session).toEqual(rotated);
  });

  it('propagates the final session when reusing one credential for another game', () => {
    const originalSession = {
      mode: 'lxns-oauth',
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      expiresAt: Date.now() + 60_000,
      persistable: true,
    } as const;
    const refreshedSession = {
      ...originalSession,
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
    };
    useSession.getState().finishRestore({
      version: 3,
      activeAccountId: 'maimai:lxns:1',
      credentials: [{ id: 'lxns:shared', providerId: 'lxns', session: originalSession }],
      accounts: [{
        id: 'maimai:lxns:1',
        gameId: 'maimai',
        providerId: 'lxns',
        credentialId: 'lxns:shared',
        displayName: '舞萌玩家',
        scoreDisplay: '15000',
      }],
    });

    useSession.getState().setSession(refreshedSession, {
      accountId: 'chunithm:lxns:2',
      credentialId: 'lxns:shared',
      displayName: '中二玩家',
      rating: 17.25,
      providerId: 'lxns',
      gameId: 'chunithm',
    });

    expect(useSession.getState().sessionsByAccountId).toMatchObject({
      'maimai:lxns:1': refreshedSession,
      'chunithm:lxns:2': refreshedSession,
    });
  });

  it('restores a demo account only when it is provided in optional accounts', async () => {
    await restoreSession(
      async () => ({
        version: 3 as const,
        activeAccountId: MAIMAI_TEST_ACCOUNT_ID,
        credentials: [],
        accounts: [],
      }),
      async () => [createMaxedMaimaiTestAccount()],
    );
    const state = useSession.getState();
    expect(state.activeAccountId).toBe(MAIMAI_TEST_ACCOUNT_ID);
    expect(state.session).toBeNull();
    expect(state.scoreProvider).toBeInstanceOf(MaxedMaimaiTestProvider);
  });

  it('falls back to unbound empty when demo is not among optional accounts', async () => {
    await restoreSession(async () => ({
      version: 3 as const,
      activeAccountId: MAIMAI_TEST_ACCOUNT_ID,
      credentials: [],
      accounts: [],
    }));
    const state = useSession.getState();
    expect(state.activeAccountId).toBe(UNBOUND_ACCOUNT_ID);
    expect(state.boundAccounts).toEqual([]);
    expect(state.scoreProvider).toBeInstanceOf(EmptyScoreProvider);
  });

  it('restores an additional local player as the active account', async () => {
    const extra = createLocalMaimaiAccount('离线二号', 13579, 'maimai:local:offline-2');
    await restoreSession(
      async () => ({
        version: 3 as const,
        activeAccountId: extra.id,
        credentials: [],
        accounts: [],
      }),
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

  it.each([
    ['TUF 社区', createTufBoundAccount({ playerId: 25, displayName: 'TUF 玩家' })],
    ['MuseDash.moe', createMuseDashBoundAccount({ userId: 'community-user', displayName: '喵斯玩家' })],
    ['Phira 社区', createPhiraBoundAccount({ playerId: 323528, displayName: 'Phira 玩家' })],
    ['喵斯示例', createMaxedMuseDashTestAccount()],
  ])('cold restores the selected optional %s account', async (_label, optionalAccount) => {
    await restoreSession(
      async () => ({
        version: 3 as const,
        activeAccountId: optionalAccount.id,
        credentials: [],
        accounts: [],
      }),
      async () => [createLocalMaimaiAccount('默认玩家', 0), optionalAccount],
    );

    const state = useSession.getState();
    expect(state.activeAccountId).toBe(optionalAccount.id);
    expect(state.activeGameId).toBe(optionalAccount.gameId);
    expect(state.activeProviderId).toBe(optionalAccount.providerId);
  });

  it('falls back to unbound empty data and exposes a restore error', async () => {
    await restoreSession(async () => { throw new Error('secure store unavailable'); });
    expect(useSession.getState()).toMatchObject({
      session: null,
      restoreStatus: 'error',
      activeAccountId: UNBOUND_ACCOUNT_ID,
    });
    expect(useSession.getState().restoreError).toContain('无法读取');
    expect(useSession.getState().scoreProvider).toBeInstanceOf(EmptyScoreProvider);
  });
});
