import { waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { applyLxnsTokenRotation } from '@rranker/provider-lxns/rotation';
import { commitCredential } from '@rranker/sdk/services/session-credential-service';
import type { Credential } from '@rranker/sdk/credentials';
import type { BoundAccount } from '@rranker/sdk/account';
import type { MaimaiDataSource } from '@rranker/game-maimai/data-source';
import type { OsuDataSource } from '@rranker/game-osu/data-source';
import { resolveAccountClient } from '@rranker/sdk/state/session-provider-resolver';
import type { LxnsOAuthSession } from '@rranker/provider-lxns/credential';
import type { HttpCookieSession } from '@rranker/provider-majdata-net/credential';
import { useAccountStore } from '@rranker/sdk/state/account-store';
import { createMajdataBoundAccount } from '@rranker/game-majdata-net/accounts';
import { useDebugStore } from '@rranker/sdk/state/debug-store';
import { getGameDefinition, setDisabledPlugins } from '@rranker/sdk/registry';
import { CHUNITHM_TEST_ACCOUNT_ID, CHUNITHM_TEMP_ACCOUNT_ID, createChunithmBoundAccount, createMaxedChunithmTestAccount, createChunithmTempAccount } from '@rranker/game-chunithm/accounts';
import { PHIGROS_TEST_ACCOUNT_ID, createMaxedPhigrosTestAccount } from '@rranker/game-phigros/accounts';
import { createMaimaiBoundAccount, createLocalMaimaiAccount, createMaxedMaimaiTestAccount, LOCAL_MAIMAI_ACCOUNT_ID, MAIMAI_TEST_ACCOUNT_ID } from '@rranker/game-maimai/accounts';
import { groupBoundAccountGameIds } from '@rranker/sdk/domain/bound-account';
import { createMaxedMuseDashTestAccount, createMuseDashBoundAccount } from '@rranker/game-musedash/accounts';
import { createOsuBoundAccount } from '@rranker/game-osu/accounts';
import { createPhiraBoundAccount } from '@rranker/game-phira/accounts';
import { createRizlineBoundAccount } from '@rranker/game-rizline/accounts';
import { createTufBoundAccount } from '@rranker/game-adofai/accounts';

import type { SecureSessionStore } from '@rranker/sdk/storage/secure-session-store';
import {
  clearOsuRotationCache,
} from '@rranker/provider-osu/providers/osu-oauth';
import { restoreSession, retryPendingRotationWrites, UNBOUND_ACCOUNT_ID, useSession } from '@rranker/sdk/state/session-store';
const originalFetch = globalThis.fetch;


function bindAccount(account: BoundAccount, session: Credential, credentialId = `credential:${account.id}`) {
  useAccountStore.getState().bindAccounts({ accounts: [account], session, credentialId, activeAccountId: account.id });
}

process.env.OSU_OAUTH_CLIENT_SECRET ??= 'test-client-secret';

const mockUpdateCredentialSession = jest.fn<SecureSessionStore['updateCredentialSession']>(async () => 'applied');

jest.mock('@rranker/sdk/storage/secure-session-store', () => {
  const actual = jest.requireActual<typeof import('@rranker/sdk/storage/secure-session-store')>('@rranker/sdk/storage/secure-session-store');
  return {
    ...actual,
    SecureSessionStore: class {
      updateCredentialSession = (...args: Parameters<SecureSessionStore['updateCredentialSession']>) => mockUpdateCredentialSession(...args);
    },
  };
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({
    execAsync: jest.fn(async () => undefined),
    getFirstAsync: jest.fn(async () => null),
    runAsync: jest.fn(async () => undefined),
  })),
}));

const jwtSession: Credential = { mode: 'jwt', value: 'fake-jwt-token', persistable: true };
const tokenSessionA: Credential = { mode: 'import-token', value: 'token-a', persistable: true };
const tokenSessionB: Credential = { mode: 'import-token', value: 'token-b', persistable: true };

beforeEach(() => {
  setDisabledPlugins([]);
  useDebugStore.setState({ hydrated: true, testAccountsEnabled: true });
  mockUpdateCredentialSession.mockReset().mockResolvedValue('applied');
  useAccountStore.getState().finishRestore(null);
});

afterEach(async () => {
  setDisabledPlugins([]);
  useAccountStore.getState().clearSession();
  useAccountStore.getState().finishRestore(null);
  await retryPendingRotationWrites();
  jest.useRealTimers();
  globalThis.fetch = originalFetch;
});

describe('Rizline account sessions', () => {
  const session = { mode: 'rizline', phone: '13800000000', token: 'private-token', deviceId: 'device-id', channelId: '1', persistable: true } as const;
  const account = createRizlineBoundAccount({ userId: '123', username: 'Rizline 玩家', totalRks: 135.4321 });
  const metadata = { gameId: 'rizline', providerId: 'rizline-official', playerId: '123', displayName: account.displayName,
    rating: 135.4321, credentialId: 'rizline-credential' } as const;
  beforeEach(() => { useAccountStore.getState().finishRestore(null); mockUpdateCredentialSession.mockClear(); });
  it('activates and restores the same stable account id and RKS', () => {
    bindAccount(account, session, metadata.credentialId);
    expect(useSession.getState()).toMatchObject({ activeGameId: 'rizline', activeProviderId: 'rizline-official', activeAccountId: account.id, session });
    useAccountStore.getState().finishRestore({ version: 3, activeAccountId: account.id,
      credentials: [{ id: metadata.credentialId, providerId: 'rizline-official', session }],
      accounts: [{ id: account.id, credentialId: metadata.credentialId, gameId: 'rizline', providerId: 'rizline-official', displayName: account.displayName, scoreDisplay: '135.4321' }],
    });
    expect(useSession.getState().boundAccounts[0]).toMatchObject(account);
    expect(useSession.getState().activeGameId).toBe('rizline');
  });
  it('rotates the current session and ignores a late rotation after reauthentication', async () => {
    bindAccount(account, session, metadata.credentialId);
    const next = { ...session, token: 'rotated' };
    await commitCredential({ credentialId: metadata.credentialId, providerId: metadata.providerId, next, expected: session });
    expect(useSession.getState().session).toBe(next);
    expect(mockUpdateCredentialSession).toHaveBeenCalledWith(metadata.credentialId, next, { expected: session, assertCurrent: expect.any(Function) });
    mockUpdateCredentialSession.mockClear();
    const latest = { ...session, token: 'new-login' };
    bindAccount(account, latest, metadata.credentialId);
    await commitCredential({ credentialId: metadata.credentialId, providerId: metadata.providerId, next: { ...session, token: 'late' }, expected: next });
    expect(mockUpdateCredentialSession).not.toHaveBeenCalled();
    expect(useSession.getState().session).toBe(latest);
  });
  it('rotates when the in-memory session is an equivalent token copy', async () => {
    bindAccount(account, session, metadata.credentialId);
    const copy = { ...session };
    useAccountStore.getState().updateCredential(metadata.credentialId, copy);
    const next = { ...session, token: 'rotated' };
    await commitCredential({ credentialId: metadata.credentialId, providerId: metadata.providerId, next, expected: session });
    expect(mockUpdateCredentialSession).toHaveBeenCalledWith(metadata.credentialId, next, { expected: session, assertCurrent: expect.any(Function) });
    expect(useSession.getState().session).toBe(next);
  });
  it('does not project a session when persistent eligibility rejects the update', async () => {
    bindAccount(account, session, metadata.credentialId);
    mockUpdateCredentialSession.mockResolvedValueOnce('stale');
    await commitCredential({ credentialId: metadata.credentialId, providerId: metadata.providerId, next: { ...session, token: 'rotated' }, expected: session });
    expect(useSession.getState().session).toBe(session);
  });
});
const lxnsSession: LxnsOAuthSession = {
  mode: 'lxns-oauth',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 600_000,
  persistable: true,
};

describe('useSession store', () => {

  beforeEach(() => {
    useAccountStore.getState().finishRestore(null, [
      createLocalMaimaiAccount('本地玩家', 0),
      createMaxedMaimaiTestAccount(),
      createMaxedPhigrosTestAccount(),
    ]);
  });

  it('activates, restores and switches isolated Majdata accounts with real avatar URLs', async () => {
    const session = (value: string): Credential => ({ mode: 'http-cookies', origin: 'https://majdata.net',
      cookies: [{ name: 'auth', value, path: '/', secure: true }], persistable: true });
    const first = { accountId: 'majdata-net:account:玩家 a&b', displayName: '玩家 A&B',
      gameId: 'majdata-net' as const, providerId: 'majdata-net' as const, rating: null, credentialId: 'credential:first' };
    const second = { ...first, accountId: 'majdata-net:account:second', displayName: 'Second', credentialId: 'credential:second' };
    bindAccount(createMajdataBoundAccount(first), session('one'), first.credentialId);
    useAccountStore.getState().updateBoundAccountScore(first.accountId, '123.4567%');
    expect(useSession.getState().boundAccounts.find(a => a.id === first.accountId)?.scoreDisplay).toBe('123.4567%');
    bindAccount(createMajdataBoundAccount(second), session('two'), second.credentialId);
    expect(groupBoundAccountGameIds(useSession.getState().boundAccounts)).toContain('majdata-net');
    useAccountStore.getState().selectBoundAccount(first.accountId);
    expect(useSession.getState().session).toEqual(session('one'));
    expect(useSession.getState().boundAccounts.find(a => a.id === first.accountId)?.avatarUrl)
      .toBe('https://majdata.net/api3/api/account/Icon?username=%E7%8E%A9%E5%AE%B6%20A%26B');
    await restoreSession(async () => ({ version: 3 as const, activeAccountId: second.accountId,
      credentials: [first, second].map((a, i) => ({ id: a.credentialId, providerId: 'majdata-net' as const, session: session(i === 0 ? 'one' : 'two') })),
      accounts: [first, second].map(a => ({ id: a.accountId, credentialId: a.credentialId, gameId: a.gameId,
        providerId: a.providerId, displayName: a.displayName, scoreDisplay: '200.0000%' })),
    }));
    expect(useSession.getState().activeAccountId).toBe(second.accountId);
    expect(useSession.getState().session).toEqual(session('two'));
    expect(useSession.getState().boundAccounts.every(a => a.scoreDisplay === '200.0000%')).toBe(true);
    useAccountStore.getState().selectBoundAccount(first.accountId);
    useAccountStore.getState().removeBoundAccount(second.accountId);
    expect(useSession.getState().session).toEqual(session('one'));
    expect(useSession.getState().boundAccounts).toHaveLength(1);
    expect(useSession.getState().credentialIdsByAccountId[second.accountId]).toBeUndefined();
  });

  it('does not re-inject deleted local or demo accounts', () => {
    useAccountStore.getState().removeBoundAccount(LOCAL_MAIMAI_ACCOUNT_ID);
    useAccountStore.getState().removeBoundAccount(MAIMAI_TEST_ACCOUNT_ID);
    const { boundAccounts } = useSession.getState();
    expect(boundAccounts.map((account) => account.id)).not.toContain(LOCAL_MAIMAI_ACCOUNT_ID);
    expect(boundAccounts.map((account) => account.id)).not.toContain(MAIMAI_TEST_ACCOUNT_ID);
    expect(boundAccounts.map((account) => account.id)).toContain(PHIGROS_TEST_ACCOUNT_ID);
  });
  it('commits Majdata cookies once with the active projection and rejects stale persistent updates', async () => {
    const session: HttpCookieSession = { mode: 'http-cookies', origin: 'https://majdata.net', cookies: [{ name: 'auth', value: 'first', path: '/', secure: true }], persistable: true };
    const metadata = { accountId: 'majdata-net:account:player', displayName: 'Player', gameId: 'majdata-net', providerId: 'majdata-net', rating: null, credentialId: 'majdata-credential' } as const;
    bindAccount(createMajdataBoundAccount(metadata), session, metadata.credentialId);
    const next = { ...session, cookies: [{ ...session.cookies[0], value: 'next' }] };
    const notifications: Credential[] = [];
    const unsubscribe = useSession.subscribe((state) => { notifications.push(state.session!); expect(state.sessionsByAccountId[metadata.accountId]).toBe(state.session); });
    await commitCredential({ credentialId: metadata.credentialId, providerId: metadata.providerId, next, expected: session });
    unsubscribe();
    expect(notifications).toEqual([next]);
    expect(mockUpdateCredentialSession).toHaveBeenCalledWith(metadata.credentialId, next, { expected: session, assertCurrent: expect.any(Function) });
    mockUpdateCredentialSession.mockResolvedValueOnce('stale');
    await commitCredential({ credentialId: metadata.credentialId, providerId: metadata.providerId, next: session, expected: next });
    expect(useSession.getState().session).toBe(next);
    mockUpdateCredentialSession.mockRejectedValueOnce(new Error('offline'));
    await commitCredential({ credentialId: metadata.credentialId, providerId: metadata.providerId, next: session, expected: next });
    expect(useSession.getState().session).toBe(session);
    await expect(retryPendingRotationWrites()).resolves.toBe(1);
  });

  it('enters unbound empty state without exposing disabled examples when all accounts are removed', async () => {
    useAccountStore.getState().removeBoundAccount(LOCAL_MAIMAI_ACCOUNT_ID);
    useAccountStore.getState().removeBoundAccount(MAIMAI_TEST_ACCOUNT_ID);
    useAccountStore.getState().removeBoundAccount(PHIGROS_TEST_ACCOUNT_ID);
    const state = useSession.getState();
    expect(state.boundAccounts).toEqual([]);
    expect(state.activeAccountId).toBe(UNBOUND_ACCOUNT_ID);
    expect(state.activeProviderId).toBeNull();
    await useDebugStore.getState().setTestAccountsEnabled(false);
    expect(getGameDefinition(useSession.getState().activeGameId)?.fixture).not.toBe(true);
    expect(useSession.getState().activeAccountId).toBe(UNBOUND_ACCOUNT_ID);
  });

  it.each(['game.phigros', 'provider.phigros-test'])('restores the selected account after enabling %s again', pluginId => {
    const selected = createMaxedPhigrosTestAccount();
    const fallback = createLocalMaimaiAccount('本地玩家', 0);
    useAccountStore.getState().finishRestore({ version: 3, activeAccountId: selected.id, accounts: [], credentials: [] }, [selected, fallback]);
    expect(useSession.getState().activeAccountId).toBe(selected.id);
    setDisabledPlugins([pluginId]);
    expect(useSession.getState().activeAccountId).toBe(fallback.id);
    expect(useSession.getState().boundAccounts.map(account => account.id)).toEqual([selected.id, fallback.id]);
    setDisabledPlugins([]);
    expect(useSession.getState().activeAccountId).toBe(selected.id);
  });

  it('prefers an authenticated maimai account when the saved selection is missing', () => {
    useAccountStore.getState().finishRestore({
      version: 3, activeAccountId: 'removed',
      credentials: [{ id: 'credential:remote', providerId: 'diving-fish', session: tokenSessionA }],
      accounts: [{ id: 'maimai:diving-fish:remote', gameId: 'maimai', providerId: 'diving-fish',
        credentialId: 'credential:remote', displayName: '水鱼玩家', scoreDisplay: '15000' }],
    }, [createPhiraBoundAccount({ playerId: 7, displayName: 'Phira' }), createLocalMaimaiAccount('本地玩家', 0)]);
    expect(useSession.getState().activeAccountId).toBe('maimai:diving-fish:remote');
    expect(useSession.getState().session).toEqual(tokenSessionA);
  });

  it('binds a maimai account with display name and DX rating meta', () => {
    bindAccount(createMaimaiBoundAccount({ displayName: '尘言', rating: 15000, playerId: 'p1', providerId: 'diving-fish' }), jwtSession);
    const state = useSession.getState();
    expect(state.session).toEqual(jwtSession);


    const maimai = state.boundAccounts.find((account) => account.id === state.activeAccountId);
    expect(maimai?.displayName).toBe('尘言');
    expect(maimai?.scoreLabel).toBe('DX RATING');
    expect(maimai?.scoreDisplay).toBe('15000');
    expect(maimai?.providerTitle).toBe('水鱼查分器');
  });

  it('binds an lxns oauth account onto LxnsScoreProvider', () => {
    bindAccount(createMaimaiBoundAccount({ displayName: '落雪玩家', rating: 12000, playerId: '123456789000000', providerId: 'lxns' }), lxnsSession);
    const state = useSession.getState();
    expect(state.session).toEqual(lxnsSession);
    expect(state.activeProviderId).toBe('lxns');

    expect(state.activeAccountId).toBe('maimai:lxns:123456789000000');
    expect(state.boundAccounts.find((account) => account.id === state.activeAccountId)?.providerTitle)
      .toBe('落雪查分器');
  });

  it('persists the first provider-triggered LXNS refresh and uses the rotated token for the request', async () => {
    const expired = { ...lxnsSession, accessToken: 'first-expired', refreshToken: 'first-refresh', expiresAt: 0 };
    const authorizations: (string | null)[] = [];
    (globalThis.fetch = (jest.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/token')) {
        return new Response(JSON.stringify({ access_token: 'first-next', refresh_token: 'first-next-refresh', expires_in: 3600 }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      authorizations.push(new Headers(init?.headers).get('Authorization'));
      return new Response(JSON.stringify({ success: true, code: 200, data: { name: '已刷新玩家', rating: 12000, friend_code: 1 } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    })) as typeof fetch);
    bindAccount(createMaimaiBoundAccount({ displayName: '落雪玩家', rating: 12000, playerId: '1', providerId: 'lxns' }), expired);
    await expect((useSession.getState().sourceClient as MaimaiDataSource).scoreProvider.getPlayer()).resolves.toMatchObject({ displayName: '已刷新玩家' });
    const next = useSession.getState().session;
    expect(next).toMatchObject({ accessToken: 'first-next', refreshToken: 'first-next-refresh' });
    expect(mockUpdateCredentialSession).toHaveBeenCalledWith('credential:maimai:lxns:1', next, {
      expected: expired, assertCurrent: expect.any(Function),
    });
    expect(authorizations).toEqual(['Bearer first-next']);
  });

  it('keeps multiple diving-fish accounts instead of replacing the previous one', () => {
    bindAccount(createMaimaiBoundAccount({ displayName: '账号甲', rating: 14000, playerId: 'a1', providerId: 'diving-fish' }), tokenSessionA);
    bindAccount(createMaimaiBoundAccount({ displayName: '账号乙', rating: 15000, playerId: 'b2', providerId: 'diving-fish' }), tokenSessionB);
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

    useAccountStore.getState().selectBoundAccount('maimai:diving-fish:a1');
    expect(useSession.getState().session).toEqual(tokenSessionA);
    expect(useSession.getState().activeAccountId).toBe('maimai:diving-fish:a1');
  });

  it('switches between Phigros and the no-score Chunithm account', () => {
    useAccountStore.getState().selectBoundAccount(PHIGROS_TEST_ACCOUNT_ID);
    expect(useSession.getState().activeGameId).toBe('phigros');

    useAccountStore.getState().upsertBoundAccount(createChunithmTempAccount());
    useAccountStore.getState().selectBoundAccount(CHUNITHM_TEMP_ACCOUNT_ID);
    const state = useSession.getState();
    expect(state.activeAccountId).toBe(CHUNITHM_TEMP_ACCOUNT_ID);
    expect(state.activeGameId).toBe('chunithm');
  });

  it('switches to the no-score Chunithm temporary account', () => {
    useAccountStore.getState().upsertBoundAccount(createChunithmTempAccount());
    useAccountStore.getState().selectBoundAccount(CHUNITHM_TEMP_ACCOUNT_ID);
    const state = useSession.getState();
    expect(state.activeAccountId).toBe(CHUNITHM_TEMP_ACCOUNT_ID);
    expect(state.activeGameId).toBe('chunithm');
    expect(state.activeProviderId).toBe('chunithm-temp');
    expect(state.session).toBeNull();
  });

  it('switches to the generated maxed maimai demo account', () => {
    useAccountStore.getState().selectBoundAccount(MAIMAI_TEST_ACCOUNT_ID);
    const state = useSession.getState();
    expect(state.activeAccountId).toBe(MAIMAI_TEST_ACCOUNT_ID);
    expect(state.activeGameId).toBe('maimai');
    expect(state.activeProviderId).toBe('maimai-test');


  });

  it('switches to the generated maxed Chunithm demo account', () => {
    useAccountStore.getState().upsertBoundAccount(createMaxedChunithmTestAccount());
    useAccountStore.getState().selectBoundAccount(CHUNITHM_TEST_ACCOUNT_ID);
    const state = useSession.getState();
    expect(state.activeAccountId).toBe(CHUNITHM_TEST_ACCOUNT_ID);
    expect(state.activeGameId).toBe('chunithm');
    expect(state.activeProviderId).toBe('chunithm-test');
    expect(state.session).toBeNull();
  });

  it('switches to the generated maxed Phigros demo account', () => {
    useAccountStore.getState().upsertBoundAccount(createMaxedPhigrosTestAccount());
    useAccountStore.getState().selectBoundAccount(PHIGROS_TEST_ACCOUNT_ID);
    const state = useSession.getState();
    expect(state.activeAccountId).toBe(PHIGROS_TEST_ACCOUNT_ID);
    expect(state.activeGameId).toBe('phigros');
    expect(state.activeProviderId).toBe('phigros-test');
    expect(state.session).toBeNull();
  });

  it('keeps multiple local players and rebuilds the active provider after renaming', async () => {
    const extra = createLocalMaimaiAccount('第二位玩家', 12345, 'maimai:local:second');
    useAccountStore.getState().upsertBoundAccount(extra);
    useAccountStore.getState().selectBoundAccount(extra.id);
    useAccountStore.getState().renameLocalAccount(extra.id, '已改名玩家');

    const state = useSession.getState();
    expect(state.boundAccounts.filter((account) => account.providerId === 'local')).toHaveLength(2);
    expect(state.activeAccountId).toBe(extra.id);
    await expect((state.sourceClient as MaimaiDataSource).scoreProvider.getPlayer()).resolves.toMatchObject({
      id: extra.id,
      displayName: '已改名玩家',
    });
  });

  it('can remove the default local player and keep other locals', () => {
    const extraA = createLocalMaimaiAccount('本地 A', 10000, 'maimai:local:a');
    const extraB = createLocalMaimaiAccount('本地 B', 11000, 'maimai:local:b');
    useAccountStore.getState().upsertBoundAccount(extraA);
    useAccountStore.getState().upsertBoundAccount(extraB);
    useAccountStore.getState().removeBoundAccount(LOCAL_MAIMAI_ACCOUNT_ID);

    const localIds = useSession.getState().boundAccounts
      .filter((account) => account.providerId === 'local')
      .map((account) => account.id);
    expect(localIds).toEqual([extraA.id, extraB.id]);
  });

  it('clears remote binds and keeps remaining local/demo accounts', () => {
    useAccountStore.getState().upsertBoundAccount(createChunithmTempAccount());
    useAccountStore.getState().upsertBoundAccount(createMaxedChunithmTestAccount());
    useAccountStore.getState().upsertBoundAccount(createMaxedPhigrosTestAccount());
    bindAccount(createMaimaiBoundAccount({ displayName: '尘言', rating: 1, providerId: 'diving-fish' }), jwtSession);
    useAccountStore.getState().clearSession();
    const state = useSession.getState();
    expect(state.session).toBeNull();
    expect(state.boundAccounts.some((account) => account.id === LOCAL_MAIMAI_ACCOUNT_ID)).toBe(true);
    expect(state.boundAccounts.some((account) => account.id === MAIMAI_TEST_ACCOUNT_ID)).toBe(true);
    expect(state.boundAccounts.some((account) => account.id === CHUNITHM_TEMP_ACCOUNT_ID)).toBe(true);
    expect(state.boundAccounts.some((account) => account.id === CHUNITHM_TEST_ACCOUNT_ID)).toBe(true);
    expect(state.boundAccounts.some((account) => account.id === PHIGROS_TEST_ACCOUNT_ID)).toBe(true);
    expect(state.boundAccounts.some((account) => account.providerId === 'diving-fish')).toBe(false);
  });

  it('removes one bound account without wiping the other', () => {
    bindAccount(createMaimaiBoundAccount({ displayName: '账号甲', rating: 14000, playerId: 'a1', providerId: 'diving-fish' }), tokenSessionA);
    bindAccount(createMaimaiBoundAccount({ displayName: '账号乙', rating: 15000, playerId: 'b2', providerId: 'diving-fish' }), tokenSessionB);
    useAccountStore.getState().removeBoundAccount('maimai:diving-fish:b2');
    const state = useSession.getState();
    expect(state.sessionsByAccountId['maimai:diving-fish:a1']).toEqual(tokenSessionA);
    expect(state.sessionsByAccountId['maimai:diving-fish:b2']).toBeUndefined();
    expect(state.activeAccountId).toBe('maimai:diving-fish:a1');
    expect(state.session).toEqual(tokenSessionA);
  });



  it('restores a Phigros session when the displayed nickname differs from the player ID', () => {
    const session = { mode: 'phi-session', sessionToken: 'phi-token', openid: 'phi-player', displayName: 'Phigros 玩家', persistable: true } as const;
    useAccountStore.getState().finishRestore({
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
        displayName: 'Phigros 玩家', scoreDisplay: '15.4321', displayData: { challengeModeRank: 523 },
      }],
    });
    expect(useSession.getState()).toMatchObject({
      activeAccountId: 'phigros:phi-taptap:phi-player', session,
      boundAccounts: [{
        id: 'phigros:phi-taptap:phi-player', displayName: 'Phigros 玩家',
        scoreDisplay: '15.4321', displayData: { challengeModeRank: 523 },
      }],
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
    useAccountStore.getState().finishRestore({
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
          displayData: { ratingPossession: 'rainbow' },
        },
      ],
    });
    const rotated = {
      ...lxnsSession,
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
    };

    await applyLxnsTokenRotation('chunithm:lxns:2', { previous: lxnsSession, next: rotated });
    expect(useSession.getState().sessionsByAccountId).toMatchObject({
      'maimai:lxns:1': rotated,
      'chunithm:lxns:2': rotated,
    });
    expect(useSession.getState().boundAccounts.find(
      (account) => account.id === 'chunithm:lxns:2',
    )?.displayData?.ratingPossession).toBe('rainbow');
    expect(useSession.getState().session).toEqual(rotated);
  });

  it('uses rotated LXNS tokens for the active maimai account after linked-account refresh', async () => {
    const initial = {
      mode: 'lxns-oauth',
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      expiresAt: Date.now() + 600_000,
      persistable: true,
    } as const;
    useAccountStore.getState().finishRestore({
      version: 3,
      activeAccountId: 'maimai:lxns:1',
      credentials: [{ id: 'lxns:shared', providerId: 'lxns', session: initial }],
      accounts: [
        {
          id: 'maimai:lxns:1', gameId: 'maimai', providerId: 'lxns',
          credentialId: 'lxns:shared', displayName: '舞萌玩家', scoreDisplay: '15000',
        },
        {
          id: 'chunithm:lxns:2', gameId: 'chunithm', providerId: 'lxns',
          credentialId: 'lxns:shared', displayName: '中二玩家', scoreDisplay: '17.25',
        },
      ],
    });
    const rotated = {
      ...initial,
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
    };

    await applyLxnsTokenRotation('chunithm:lxns:2', { previous: initial, next: rotated });

    const state = useSession.getState();
    let authorization: string | null = null;
    (globalThis.fetch = (async (_url: string, init: RequestInit) => {
      authorization = new Headers(init.headers).get('Authorization');
      return Response.json({ success: true, code: 200, data: { name: '舞萌玩家', rating: 15000, friend_code: 1 } });
    }) as typeof fetch);
    await expect((state.sourceClient as MaimaiDataSource).scoreProvider.getPlayer()).resolves.toMatchObject({ displayName: '舞萌玩家', rating: 15000 });
    expect(authorization).toBe('Bearer access-b');
    expect(state.sessionsByAccountId).toMatchObject({
      'maimai:lxns:1': rotated,
      'chunithm:lxns:2': rotated,
    });
  });

  it('keeps the latest in-memory LXNS session and marks it pending when persistence fails', async () => {
    bindAccount(createMaimaiBoundAccount({ displayName: '落雪玩家', rating: 12000, playerId: '1', providerId: 'lxns' }), lxnsSession);
    const accountId = useSession.getState().activeAccountId;
    const rotated = {
      ...lxnsSession,
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
    };
    mockUpdateCredentialSession.mockRejectedValueOnce(new Error('write failed'));

    await expect(applyLxnsTokenRotation(accountId, { previous: lxnsSession, next: rotated }))
      .resolves.toBe('pending-persist');

    const state = useSession.getState();
    expect(state.session).toEqual(rotated);
    expect(state.sessionsByAccountId[accountId]).toEqual(rotated);
    let authorization: string | null = null;
    (globalThis.fetch = (async (_url: string, init: RequestInit) => {
      authorization = new Headers(init.headers).get('Authorization');
      return Response.json({ success: true, code: 200, data: { name: '舞萌玩家', rating: 15000, friend_code: 1 } });
    }) as typeof fetch);
    await expect((state.sourceClient as MaimaiDataSource).scoreProvider.getPlayer()).resolves.toMatchObject({ displayName: '舞萌玩家', rating: 15000 });
    expect(authorization).toBe('Bearer access-b');
    mockUpdateCredentialSession.mockResolvedValue('applied');
    await expect(retryPendingRotationWrites()).resolves.toBe(1);
    await expect(retryPendingRotationWrites()).resolves.toBe(0);
  });

  it('drops pending writes after the account was removed', async () => {
    bindAccount(createMaimaiBoundAccount({ displayName: '落雪玩家', rating: 12000, playerId: '1', providerId: 'lxns' }), lxnsSession);
    const accountId = useSession.getState().activeAccountId;
    const rotated = { ...lxnsSession, accessToken: 'access-b', refreshToken: 'refresh-b' };
    mockUpdateCredentialSession.mockRejectedValue(new Error('disk offline'));
    await expect(applyLxnsTokenRotation(accountId, { previous: lxnsSession, next: rotated }))
      .resolves.toBe('pending-persist');

    useAccountStore.getState().removeBoundAccount(accountId);
    mockUpdateCredentialSession.mockClear();
    await expect(retryPendingRotationWrites()).resolves.toBe(0);
    expect(mockUpdateCredentialSession).not.toHaveBeenCalled();
    expect(useSession.getState().sessionsByAccountId[accountId]).toBeUndefined();
  });

  it('runs pending write retries one at a time and is idempotent', async () => {
    bindAccount(createMaimaiBoundAccount({ displayName: '落雪玩家', rating: 12000, playerId: '1', providerId: 'lxns' }), lxnsSession);
    const accountId = useSession.getState().activeAccountId;
    const rotated = { ...lxnsSession, accessToken: 'access-b', refreshToken: 'refresh-b' };
    mockUpdateCredentialSession.mockRejectedValueOnce(new Error('disk offline'));
    await applyLxnsTokenRotation(accountId, { previous: lxnsSession, next: rotated });
    mockUpdateCredentialSession.mockClear();

    let release: (value: 'applied') => void = () => undefined;
    mockUpdateCredentialSession.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const first = retryPendingRotationWrites();
    const second = retryPendingRotationWrites();
    try {
      await waitFor(() => expect(mockUpdateCredentialSession).toHaveBeenCalledTimes(1));
      release('applied');
      await expect(Promise.all([first, second])).resolves.toEqual([1, 1]);
    } finally {
      release('applied');
      await Promise.allSettled([first, second]);
      mockUpdateCredentialSession.mockReset();
      mockUpdateCredentialSession.mockResolvedValue('applied');
    }
    await expect(retryPendingRotationWrites()).resolves.toBe(0);
  });
  it('retains an exhausted automatic retry and resumes it when manually triggered', async () => {
    jest.useFakeTimers();
    try {
      bindAccount(createMaimaiBoundAccount({ displayName: 'Player', rating: 12000, playerId: '1', providerId: 'lxns' }), lxnsSession);
      const accountId = useSession.getState().activeAccountId;
      const next = { ...lxnsSession, accessToken: 'next', refreshToken: 'next' };
      mockUpdateCredentialSession.mockRejectedValue(new Error('offline'));
      await applyLxnsTokenRotation(accountId, { previous: lxnsSession, next });
      await jest.advanceTimersByTimeAsync(5_000 + 30_000 + 120_000);
      await jest.advanceTimersByTimeAsync(600_000);
      let persisted: Credential | null = null;
      mockUpdateCredentialSession.mockImplementation(async (_credentialId, session) => { persisted = session; return 'applied'; });
      await expect(retryPendingRotationWrites()).resolves.toBe(1);
      expect(persisted).toBe(next);
      await expect(retryPendingRotationWrites()).resolves.toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('writes the shared osu credential even after the initiating mode account was removed', async () => {
    const expected = { mode: 'osu-oauth', accessToken: 'access-a', refreshToken: 'refresh-a',
      expiresAt: 0, persistable: true } as const;
    const mania = createOsuBoundAccount({ gameId: 'osu-mania', userId: 7, displayName: 'mania', pp: 1 });
    const standard = createOsuBoundAccount({ gameId: 'osu-standard', userId: 7, displayName: 'standard', pp: 1 });
    useAccountStore.getState().finishRestore(null);
    useAccountStore.getState().bindAccounts({ accounts: [mania, standard], credentialId: 'osu-shared',
      activeAccountId: standard.id, session: expected });
    const client = resolveAccountClient(mania.id) as OsuDataSource;
    useAccountStore.getState().removeBoundAccount(mania.id);
    (globalThis.fetch = (async (url: string) => Response.json(String(url).endsWith('/oauth/token')
      ? { access_token: 'access-b', refresh_token: 'refresh-b', expires_in: 600, token_type: 'Bearer' }
      : String(url).includes('/scores/best') ? []
        : { id: 7, username: 'standard', avatar_url: '', statistics: { pp: 1 } })) as typeof fetch);
    await client.readFresh(new AbortController().signal);
    const state = useSession.getState();
    expect(state.sessionsByAccountId[standard.id]).toMatchObject({ accessToken: 'access-b', refreshToken: 'refresh-b' });
    expect(state.sessionsByAccountId[mania.id]).toBeUndefined();
    expect(mockUpdateCredentialSession).toHaveBeenCalledWith('osu-shared', state.sessionsByAccountId[standard.id], {
      expected, assertCurrent: expect.any(Function),
    });
  });

  it('broadcasts a single-mode reauthorization before accepting its next shared rotation', async () => {
    clearOsuRotationCache();
    const previous = { mode: 'osu-oauth' as const, accessToken: 'old-access', refreshToken: 'old-refresh',
      expiresAt: Date.now() + 60_000, persistable: true as const };
    const authorized = { ...previous, accessToken: 'authorized-access', refreshToken: 'authorized-refresh' };
    const rotated = { ...authorized, accessToken: 'next-access', refreshToken: 'next-refresh' };
    const standard = createOsuBoundAccount({ gameId: 'osu-standard', userId: 7, displayName: 'old', pp: 1 });
    const mania = createOsuBoundAccount({ gameId: 'osu-mania', userId: 7, displayName: 'old', pp: 1 });
    const updatedMania = createOsuBoundAccount({ gameId: 'osu-mania', userId: 7, displayName: 'updated', pp: 42 });
    useAccountStore.getState().finishRestore(null);
    useAccountStore.getState().bindAccounts({ accounts: [standard, mania], credentialId: 'osu-shared',
      activeAccountId: standard.id, session: previous });
    const oldStandardProvider = useSession.getState().sourceClient;
    useAccountStore.getState().selectBoundAccount(mania.id);
    const oldManiaProvider = useSession.getState().sourceClient;
    useAccountStore.getState().bindAccounts({ accounts: [updatedMania], credentialId: 'osu-shared',
      activeAccountId: mania.id, session: authorized });
    const state = useSession.getState();
    expect(state.boundAccounts.find(account => account.id === mania.id)).toMatchObject(updatedMania);
    expect(state.boundAccounts.find(account => account.id === standard.id)).toMatchObject(standard);
    expect(state.sessionsByAccountId[standard.id]).toBe(authorized);
    expect(state.sessionsByAccountId[mania.id]).toBe(authorized);
    expect(state.session).toBe(authorized);
    expect(state.sourceClient).not.toBe(oldManiaProvider);
    useAccountStore.getState().selectBoundAccount(standard.id);
    expect(useSession.getState().sourceClient).not.toBe(oldStandardProvider);
    mockUpdateCredentialSession.mockClear();
    await expect(commitCredential({ credentialId: 'osu-shared', providerId: 'osu', next: rotated, expected: authorized })).resolves.toBe('applied');
    expect(mockUpdateCredentialSession).toHaveBeenCalledWith('osu-shared', rotated, { expected: authorized, assertCurrent: expect.any(Function) });
    expect(useSession.getState().sessionsByAccountId[standard.id]).toBe(rotated);
    expect(useSession.getState().sessionsByAccountId[mania.id]).toBe(rotated);
    mockUpdateCredentialSession.mockClear();
    await expect(commitCredential({ credentialId: 'osu-shared', providerId: 'osu', next: { ...previous, refreshToken: 'late-refresh' }, expected: previous })).resolves.toBe('stale');
    expect(mockUpdateCredentialSession).not.toHaveBeenCalled();
    expect(useSession.getState().session).toBe(rotated);
  });

  it('rejects a late osu rotation after the mode account re-authorized', async () => {
    const stale = {
      mode: 'osu-oauth' as const,
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      expiresAt: Date.now() + 60_000,
      persistable: true as const,
    };
    const reAuthorized = { ...stale, accessToken: 'access-new', refreshToken: 'refresh-new' };
    const account = createOsuBoundAccount({ gameId: 'osu-standard', userId: 7, displayName: 'osu 玩家', pp: 1 });
    useAccountStore.getState().finishRestore(null);
    useAccountStore.getState().bindAccounts({
      accounts: [account],
      credentialId: 'osu-credential',
      activeAccountId: account.id,
      session: reAuthorized,
    });
    mockUpdateCredentialSession.mockClear();

    await expect(commitCredential({ credentialId: 'osu-credential', providerId: 'osu', next: { ...stale, refreshToken: 'refresh-b' }, expected: stale }))
      .resolves.toBe('stale');
    expect(useSession.getState().sessionsByAccountId[account.id]).toEqual(reAuthorized);
    expect(mockUpdateCredentialSession).not.toHaveBeenCalled();
  });

  it('rejects a late LXNS rotation after the account was re-authorized', async () => {
    const staleSession = {
      mode: 'lxns-oauth',
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      expiresAt: Date.now() + 60_000,
      persistable: true,
    } as const;
    const reAuthorized = {
      ...staleSession,
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
    };
    useAccountStore.getState().finishRestore({
      version: 3,
      activeAccountId: 'maimai:lxns:1',
      credentials: [{ id: 'lxns:new', providerId: 'lxns', session: reAuthorized }],
      accounts: [{
        id: 'maimai:lxns:1', gameId: 'maimai', providerId: 'lxns',
        credentialId: 'lxns:new', displayName: '舞萌玩家', scoreDisplay: '15000',
      }],
    });

    await expect(applyLxnsTokenRotation('maimai:lxns:1', {
      previous: staleSession,
      next: { ...staleSession, accessToken: 'access-b', refreshToken: 'refresh-b' },
    })).resolves.toBe('stale');

    const state = useSession.getState();
    expect(state.sessionsByAccountId['maimai:lxns:1']).toEqual(reAuthorized);
    expect(mockUpdateCredentialSession).not.toHaveBeenCalled();
  });

  it('keeps the shared credential rotating after the initiating account was removed', async () => {
    const shared = { mode: 'lxns-oauth', accessToken: 'access-a', refreshToken: 'refresh-a',
      expiresAt: 0, persistable: true } as const;
    useAccountStore.getState().finishRestore({ version: 3, activeAccountId: 'chunithm:lxns:2',
      credentials: [{ id: 'lxns:shared', providerId: 'lxns', session: shared }], accounts: [
        { id: 'maimai:lxns:1', gameId: 'maimai', providerId: 'lxns', credentialId: 'lxns:shared', displayName: '舞萌玩家', scoreDisplay: '15000' },
        { id: 'chunithm:lxns:2', gameId: 'chunithm', providerId: 'lxns', credentialId: 'lxns:shared', displayName: '中二玩家', scoreDisplay: '17.25' },
      ],
    });
    const client = resolveAccountClient('maimai:lxns:1') as MaimaiDataSource;
    useAccountStore.getState().removeBoundAccount('maimai:lxns:1');
    (globalThis.fetch = (async (url: string) => Response.json(String(url).endsWith('/token')
      ? { access_token: 'access-b', refresh_token: 'refresh-b', expires_in: 600 }
      : { success: true, code: 200, data: { name: '舞萌玩家', rating: 15000, friend_code: 1 } })) as typeof fetch);
    await client.scoreProvider.getPlayer();
    const state = useSession.getState();
    expect(state.sessionsByAccountId['chunithm:lxns:2']).toMatchObject({ accessToken: 'access-b', refreshToken: 'refresh-b' });
    expect(state.sessionsByAccountId['maimai:lxns:1']).toBeUndefined();
    expect(state.boundAccounts.map(account => account.id)).toEqual(['chunithm:lxns:2']);
    expect(mockUpdateCredentialSession).toHaveBeenCalledWith('lxns:shared', state.sessionsByAccountId['chunithm:lxns:2'], {
      expected: shared, assertCurrent: expect.any(Function),
    });
  });

  it('reports removed and writes nothing when the account and its credential are gone', async () => {
    useAccountStore.getState().finishRestore({
      version: 3,
      activeAccountId: 'maimai:lxns:1',
      credentials: [{ id: 'lxns:shared', providerId: 'lxns', session: lxnsSession }],
      accounts: [{
        id: 'maimai:lxns:1', gameId: 'maimai', providerId: 'lxns',
        credentialId: 'lxns:shared', displayName: '舞萌玩家', scoreDisplay: '15000',
      }],
    });
    useAccountStore.getState().removeBoundAccount('maimai:lxns:1');
    mockUpdateCredentialSession.mockClear();

    await expect(applyLxnsTokenRotation('maimai:lxns:1', {
      previous: lxnsSession,
      next: { ...lxnsSession, accessToken: 'access-b', refreshToken: 'refresh-b' },
    })).resolves.toBe('removed');
    expect(mockUpdateCredentialSession).not.toHaveBeenCalled();
    expect(useSession.getState().sessionsByAccountId).toEqual({});
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
    useAccountStore.getState().finishRestore({
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

    bindAccount(createChunithmBoundAccount({ accountId: 'chunithm:lxns:2', displayName: '中二玩家', rating: 17.25 }), refreshedSession, 'lxns:shared');
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
    await expect((state.sourceClient as MaimaiDataSource).scoreProvider.getPlayer()).resolves.toMatchObject({
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

  it('preserves loaded accounts and exposes a recoverable restore error', async () => {
    const previous = useSession.getState();
    await restoreSession(async () => { throw new Error('secure store unavailable'); });
    expect(useSession.getState()).toMatchObject({
      session: null,
      restoreStatus: 'error',
      activeAccountId: previous.activeAccountId,
    });
    expect(useSession.getState().restoreError).toContain('无法读取');
    expect((useSession.getState().sourceClient as MaimaiDataSource).scoreProvider).toBe((previous.sourceClient as MaimaiDataSource).scoreProvider);
    expect(useSession.getState().boundAccounts).toBe(previous.boundAccounts);
  });

  it('rejects late osu rotations after unbinding or clearing the session', async () => {
    const account = createOsuBoundAccount({
      gameId: 'osu-standard', userId: 7, displayName: 'osu 玩家', pp: 1,
    });
    const session = { mode: 'osu-oauth', accessToken: 'access', refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000, persistable: true } as const;
    const rotated = { ...session, accessToken: 'next-access', refreshToken: 'next-refresh' };
    useAccountStore.getState().finishRestore(null);
    useAccountStore.getState().bindAccounts({
      accounts: [account],
      credentialId: 'osu-credential',
      activeAccountId: account.id,
      session,
    });
    useAccountStore.getState().removeBoundAccount(account.id);
    await expect(commitCredential({ credentialId: 'osu-credential', providerId: 'osu', next: rotated, expected: session })).resolves.toBe('removed');
    expect(useSession.getState().sessionsByAccountId[account.id]).toBeUndefined();
    useAccountStore.getState().bindAccounts({ accounts: [account], credentialId: 'osu-credential', activeAccountId: account.id, session });
    useAccountStore.getState().clearSession();
    await expect(commitCredential({ credentialId: 'osu-credential', providerId: 'osu', next: rotated, expected: session })).resolves.toBe('removed');
    expect(mockUpdateCredentialSession).not.toHaveBeenCalled();
    expect(useSession.getState().session).toBeNull();
  });
});
