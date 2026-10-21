import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChunithmBoundAccount, createOsuBoundAccount, createLocalMaimaiAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import type { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import type { OsuScoreProvider } from '@/providers/osu-score-provider';
import { useSession } from '@/state/session-store';

vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class { async getLatest() { return null; } } }));
vi.mock('@/storage/secure-session-store', () => ({ SecureSessionStore: class {} }));

const lxnsSession: ProviderSession = {
  mode: 'lxns-oauth', accessToken: 'access', refreshToken: 'refresh',
  expiresAt: Date.now() + 600_000, persistable: true,
};

beforeEach(() => useSession.getState().finishRestore(null));
afterEach(() => { vi.unstubAllGlobals(); });

describe('当前账号的 Provider', () => {
  it('切换本地账号后查分显示对应玩家名，改名立即生效', async () => {
    const first = createLocalMaimaiAccount('玩家甲', 0);
    const second = { ...createLocalMaimaiAccount('玩家乙', 0), id: 'maimai:local:second' };
    useSession.getState().upsertBoundAccount(first);
    useSession.getState().upsertBoundAccount(second);
    useSession.getState().selectBoundAccount(first.id);
    expect((await useSession.getState().scoreProvider.getPlayer())?.displayName).toBe('玩家甲');
    useSession.getState().selectBoundAccount(second.id);
    expect((await useSession.getState().scoreProvider.getPlayer())?.displayName).toBe('玩家乙');
    useSession.getState().renameLocalAccount(second.id, '新名字');
    expect((await useSession.getState().scoreProvider.getPlayer())?.displayName).toBe('新名字');
  });

  it('重新授权后的中二请求使用新令牌', async () => {
    const account = createChunithmBoundAccount({ playerId: '2', displayName: '中二玩家', rating: 17 });
    const metadata = { gameId: 'chunithm', accountId: account.id, providerId: 'lxns',
      playerId: '2', displayName: account.displayName, rating: 17, credentialId: 'shared' } as const;
    useSession.getState().setSession(lxnsSession, metadata);
    const next = { ...lxnsSession, accessToken: 'new-access', refreshToken: 'new-refresh' };
    useSession.getState().setSession(next, metadata);
    const requests: Headers[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      requests.push(new Headers(init.headers));
      return new Response(JSON.stringify({ success: true, code: 200, data: { name: '中二玩家', rating: 17, friend_code: 2, level: 99,
        class_emblem: { base: 0, medal: 0 }, reborn_count: 0, over_power: 0, over_power_progress: 0,
        currency: 0, total_currency: 0, total_play_count: 0 } }));
    });
    const provider = useSession.getState().protocolScoreProvider as ChunithmScoreProvider;
    await expect(provider.getPlayer()).resolves.toMatchObject({ name: '中二玩家', rating: 17 });
    expect(requests[0].get('Authorization')).toBe('Bearer new-access');
  });

  it('osu! 模式切换读取对应模式并使用共享令牌', async () => {
    const accounts = [createOsuBoundAccount({ gameId: 'osu-standard', userId: 7, displayName: '标准', pp: 100 }),
      createOsuBoundAccount({ gameId: 'osu-mania', userId: 7, displayName: '键盘', pp: 50 })];
    const session = { mode: 'osu-oauth', accessToken: 'access', refreshToken: 'refresh',
      expiresAt: Date.now() + 600_000, persistable: true } as const;
    useSession.getState().setOsuBinding({ accounts, session, credentialId: 'osu:shared', activeAccountId: accounts[0].id });
    const requests: { url: string; authorization: string | null }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      requests.push({ url: String(url), authorization: new Headers(init.headers).get('Authorization') });
      return new Response(JSON.stringify({ id: 7, username: '玩家', avatar_url: '', country_code: 'CN', statistics: { pp: 50 } }));
    });
    const standard = useSession.getState().protocolScoreProvider as OsuScoreProvider;
    await standard.getOwnUser('osu-standard');
    useSession.getState().selectBoundAccount(accounts[1].id);
    const mania = useSession.getState().protocolScoreProvider as OsuScoreProvider;
    await expect(mania.getOwnUser('osu-mania')).resolves.toMatchObject({ id: 7, username: '玩家' });
    expect(requests.map(request => new URL(request.url).pathname)).toEqual(['/api/v2/me/osu', '/api/v2/me/mania']);
    expect(requests.map(request => request.authorization)).toEqual(['Bearer access', 'Bearer access']);
  });
});
