import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChunithmBoundAccount, createOsuBoundAccount, createLocalMaimaiAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import { useSession } from '@/state/session-store';

vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class { async getLatest() { return null; } } }));
vi.mock('@/storage/secure-session-store', () => ({ SecureSessionStore: class {} }));

const lxnsSession: ProviderSession = {
  mode: 'lxns-oauth', accessToken: 'access', refreshToken: 'refresh',
  expiresAt: Date.now() + 600_000, persistable: true,
};

beforeEach(() => useSession.getState().finishRestore(null));

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

  it('重新授权后当前中二查分器使用新会话', () => {
    const account = createChunithmBoundAccount({ playerId: '2', displayName: '中二玩家', rating: 17 });
    const metadata = { gameId: 'chunithm', accountId: account.id, providerId: 'lxns',
      playerId: '2', displayName: account.displayName, rating: 17, credentialId: 'shared' } as const;
    useSession.getState().setSession(lxnsSession, metadata);
    const next = { ...lxnsSession, accessToken: 'new-access', refreshToken: 'new-refresh' };
    useSession.getState().setSession(next, metadata);
    const provider = useSession.getState().protocolScoreProvider;
    expect(provider).toBeInstanceOf(ChunithmScoreProvider);
    expect(provider?.getSession()).toEqual(next);
  });

  it('osu! 模式切换保留各自查分器与共享会话', () => {
    const accounts = [createOsuBoundAccount({ gameId: 'osu-standard', userId: 7, displayName: '标准', pp: 100 }),
      createOsuBoundAccount({ gameId: 'osu-mania', userId: 7, displayName: '键盘', pp: 50 })];
    const session = { mode: 'osu-oauth', accessToken: 'access', refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000, persistable: true } as const;
    useSession.getState().setOsuBinding({ accounts, session, credentialId: 'osu:shared', activeAccountId: accounts[0].id });
    useSession.getState().selectBoundAccount(accounts[1].id);
    const provider = useSession.getState().protocolScoreProvider;
    expect(useSession.getState().activeGameId).toBe('osu-mania');
    expect(provider).toBeInstanceOf(OsuScoreProvider);
    expect(provider?.getSession()).toBe(session);
  });
});
