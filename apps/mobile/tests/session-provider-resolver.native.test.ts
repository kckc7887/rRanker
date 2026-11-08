import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Credential } from '@rranker/sdk/credentials';
import { createChunithmBoundAccount } from '@rranker/game-chunithm/accounts';
import { createOsuBoundAccount } from '@rranker/game-osu/accounts';
import { createLocalMaimaiAccount } from '@rranker/game-maimai/accounts';

import type { ChunithmDataSource } from '@rranker/game-chunithm/data-source';
import type { MaimaiDataSource } from '@rranker/game-maimai/data-source';
import type { OsuDataSource } from '@rranker/game-osu/data-source';
import { useAccountStore } from '@rranker/sdk/state/account-store';
import { useSession } from '@rranker/sdk/state/session-store';
const originalFetch = globalThis.fetch;


jest.mock('@rranker/sdk/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class { async getAccountScore() { return null; } } }));
jest.mock('@rranker/sdk/storage/secure-session-store', () => ({ SecureSessionStore: class {} }));

const lxnsSession: Credential = {
  mode: 'lxns-oauth', accessToken: 'access', refreshToken: 'refresh',
  expiresAt: Date.now() + 600_000, persistable: true,
};

beforeEach(() => useAccountStore.getState().finishRestore(null));
afterEach(() => { globalThis.fetch = originalFetch; });

describe('当前账号的 Provider', () => {
  it('切换本地账号后查分显示对应玩家名，改名立即生效', async () => {
    const first = createLocalMaimaiAccount('玩家甲', 0);
    const second = { ...createLocalMaimaiAccount('玩家乙', 0), id: 'maimai:local:second' };
    useAccountStore.getState().upsertBoundAccount(first);
    useAccountStore.getState().upsertBoundAccount(second);
    useAccountStore.getState().selectBoundAccount(first.id);
    expect((await (useSession.getState().sourceClient as MaimaiDataSource).scoreProvider.getPlayer())?.displayName).toBe('玩家甲');
    useAccountStore.getState().selectBoundAccount(second.id);
    expect((await (useSession.getState().sourceClient as MaimaiDataSource).scoreProvider.getPlayer())?.displayName).toBe('玩家乙');
    useAccountStore.getState().renameLocalAccount(second.id, '新名字');
    expect((await (useSession.getState().sourceClient as MaimaiDataSource).scoreProvider.getPlayer())?.displayName).toBe('新名字');
  });

  it('重新授权后的中二请求使用新令牌', async () => {
    const account = createChunithmBoundAccount({ playerId: '2', displayName: '中二玩家', rating: 17 });
    useAccountStore.getState().bindAccounts({ accounts: [account], session: lxnsSession, credentialId: 'shared', activeAccountId: account.id });
    const next = { ...lxnsSession, accessToken: 'new-access', refreshToken: 'new-refresh' };
    useAccountStore.getState().bindAccounts({ accounts: [account], session: next, credentialId: 'shared', activeAccountId: account.id });
    const requests: Headers[] = [];
    (globalThis.fetch = (async (_url: string, init: RequestInit) => {
      requests.push(new Headers(init.headers));
      return new Response(JSON.stringify({ success: true, code: 200, data: { name: '中二玩家', rating: 17, friend_code: 2, level: 99,
        class_emblem: { base: 0, medal: 0 }, reborn_count: 0, over_power: 0, over_power_progress: 0,
        currency: 0, total_currency: 0, total_play_count: 0 } }));
    }) as typeof fetch);
    const provider = useSession.getState().sourceClient as ChunithmDataSource;
    await expect(provider.getPlayer!()).resolves.toMatchObject({ name: '中二玩家', rating: 17 });
    expect(requests[0].get('Authorization')).toBe('Bearer new-access');
  });

  it('osu! 模式切换读取对应模式并使用共享令牌', async () => {
    const accounts = [createOsuBoundAccount({ gameId: 'osu-standard', userId: 7, displayName: '标准', pp: 100 }),
      createOsuBoundAccount({ gameId: 'osu-mania', userId: 7, displayName: '键盘', pp: 50 })];
    const session = { mode: 'osu-oauth', accessToken: 'access', refreshToken: 'refresh',
      expiresAt: Date.now() + 600_000, persistable: true } as const;
    useAccountStore.getState().bindAccounts({ accounts, session, credentialId: 'osu:shared', activeAccountId: accounts[0].id });
    const requests: { url: string; authorization: string | null }[] = [];
    (globalThis.fetch = (async (url: string, init: RequestInit) => {
      requests.push({ url: String(url), authorization: new Headers(init.headers).get('Authorization') });
      return Response.json(String(url).includes('/scores/best') ? []
        : { id: 7, username: '玩家', avatar_url: '', country_code: 'CN', statistics: { pp: 50 } });
    }) as typeof fetch);
    const standard = useSession.getState().sourceClient as OsuDataSource;
    await standard.readFresh(new AbortController().signal);
    useAccountStore.getState().selectBoundAccount(accounts[1].id);
    const mania = useSession.getState().sourceClient as OsuDataSource;
    await expect(mania.readFresh(new AbortController().signal)).resolves.toMatchObject({ data: { player: { userId: 7, username: '玩家' } } });
    expect(requests.map(request => new URL(request.url).pathname)).toEqual([
      '/api/v2/users/7/osu', '/api/v2/users/7/scores/best', '/api/v2/users/7/mania', '/api/v2/users/7/scores/best',
    ]);
    expect(requests.filter(request => request.url.includes('/scores/best')).map(request => new URL(request.url).searchParams.get('mode'))).toEqual(['osu', 'mania']);
    expect(requests.map(request => request.authorization)).toEqual(Array(4).fill('Bearer access'));
  });
});
