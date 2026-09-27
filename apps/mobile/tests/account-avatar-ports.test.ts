import { describe, expect, it, vi } from 'vitest';
import { accountAvatarResourceKey } from '@/domain/account-avatar';
import { createMaimaiBoundAccount, createTufBoundAccount, type BoundAccount } from '@/domain/bound-account';
import { chunithmPersonalResourceKey } from '@/domain/chunithm-personal';
import {
  createAccountAvatarResolver,
  type AccountAvatarResolverPorts,
  type PhigrosAccountHydration,
} from '@/services/account-avatar-resolver';

type Ports = AccountAvatarResolverPorts;
type Overrides = {
  latest?: Ports['snapshots']['latest'];
  resource?: Ports['snapshots']['resource'];
  lxnsIconId?: Ports['providers']['lxnsIconId'];
  chunithmMapIconId?: Ports['providers']['chunithmMapIconId'];
  phigrosAccount?: Ports['providers']['phigrosAccount'];
  cachedPlayer?: Ports['tuf']['cachedPlayer'];
  refreshPlayer?: Ports['tuf']['refreshPlayer'];
  persistAvatar?: Ports['persistAvatar'];
  foregroundSignal?: Ports['foregroundSignal'];
};

const lxnsAccount = createMaimaiBoundAccount({
  providerId: 'lxns',
  displayName: '落雪玩家',
  rating: 15000,
  playerId: '123456789',
});
const chunithmAccount = { ...lxnsAccount, gameId: 'chunithm' } as BoundAccount;
const tufAccount = createTufBoundAccount({ playerId: 25, displayName: 'TUF 玩家' });
const phiAccount = { ...lxnsAccount, providerId: 'phi-taptap', gameId: 'phigros' } as BoundAccount;
const lxnsSession = {
  mode: 'lxns-oauth',
  accessToken: 'a',
  refreshToken: 'r',
  expiresAt: Date.now() + 60_000,
  persistable: true,
} as const;
const phiSession = { mode: 'phi-session', sessionToken: 'token', playerId: 'p1', persistable: true } as const;

const tufPlayer = (avatarUrl: string) => ({
  id: 25, name: 'TUF 玩家', rankedScore: 1, generalScore: 0, ppScore: 0,
  totalPasses: 0, universalPassCount: 0, worldFirstCount: 0, topScores: [],
  avatarUrl, globalRank: null,
});

function ports(overrides: Overrides = {}): Ports {
  return {
    snapshots: {
      latest: overrides.latest ?? (async () => null),
      resource: overrides.resource ?? (async () => null),
    },
    providers: {
      lxnsIconId: overrides.lxnsIconId ?? (async () => null),
      chunithmMapIconId: overrides.chunithmMapIconId ?? (async () => null),
      phigrosAccount: overrides.phigrosAccount ?? (async () => { throw new Error('意外的 Phigros 读取'); }),
    },
    tuf: {
      cachedPlayer: overrides.cachedPlayer ?? (async () => null),
      refreshPlayer: overrides.refreshPlayer ?? (async () => { throw new Error('意外的 TUF 拉取'); }),
    },
    persistAvatar: overrides.persistAvatar ?? (async () => undefined),
    foregroundSignal: overrides.foregroundSignal ?? (() => new AbortController().signal),
  };
}

describe('头像解析服务端口装配', () => {
  it('落雪头像优先取持久化快照，快照命中时不再读取协议客户端', async () => {
    const lxnsIconId = vi.fn(async () => 200201);
    const resolver = createAccountAvatarResolver(ports({
      latest: (async () => ({ player: { presentation: { iconId: 255406 } } })) as unknown as Ports['snapshots']['latest'],
      lxnsIconId,
    }));

    await expect(resolver.resolveAccountAvatarUrl(lxnsAccount, lxnsSession))
      .resolves.toBe('https://assets2.lxns.net/maimai/icon/255406.png');
    expect(lxnsIconId).not.toHaveBeenCalled();
  });

  it('快照没有图标时从协议客户端补齐', async () => {
    const resolver = createAccountAvatarResolver(ports({ lxnsIconId: async () => 200201 }));
    await expect(resolver.resolveAccountAvatarUrl(lxnsAccount, lxnsSession))
      .resolves.toBe('https://assets2.lxns.net/maimai/icon/200201.png');
  });

  it('中二头像优先取个人资料地图图标', async () => {
    const chunithmMapIconId = vi.fn(async () => 300);
    const resolver = createAccountAvatarResolver(ports({
      resource: (async (key: string) => (
        key === chunithmPersonalResourceKey(chunithmAccount.id) ? { player: { map_icon: { id: 42 } } } : null
      )) as Ports['snapshots']['resource'],
      chunithmMapIconId,
    }));
    await expect(resolver.resolveAccountAvatarUrl(chunithmAccount, lxnsSession))
      .resolves.toContain('/icon/42.png');
    expect(chunithmMapIconId).not.toHaveBeenCalled();
  });

  it('协议客户端失败时返回空而不是抛出', async () => {
    const resolver = createAccountAvatarResolver(ports({
      lxnsIconId: async () => { throw new Error('network'); },
    }));
    await expect(resolver.resolveAccountAvatarUrl(lxnsAccount, lxnsSession)).resolves.toBeNull();
  });

  it('已持久化的账号头像先于网络解析命中', async () => {
    const refreshPlayer = vi.fn(async () => tufPlayer('https://example.test/tuf-live.png'));
    const resolver = createAccountAvatarResolver(ports({
      resource: (async (key: string) => (
        key === accountAvatarResourceKey(tufAccount.id) ? { avatarUrl: 'https://example.test/stored.png' } : null
      )) as Ports['snapshots']['resource'],
      refreshPlayer,
    }));
    await expect(resolver.resolveAccountAvatarUrl(tufAccount, undefined))
      .resolves.toBe('https://example.test/stored.png');
    expect(refreshPlayer).not.toHaveBeenCalled();
  });

  it('TUF 旧账号先读缓存资料，再回落到公开资料拉取', async () => {
    const refreshPlayer = vi.fn(async () => tufPlayer('https://example.test/tuf-live.png'));
    const cached = createAccountAvatarResolver(ports({
      cachedPlayer: async () => tufPlayer('https://example.test/tuf-cache.png'),
      refreshPlayer,
    }));
    await expect(cached.resolveAccountAvatarUrl(tufAccount, undefined))
      .resolves.toBe('https://example.test/tuf-cache.png');
    expect(refreshPlayer).not.toHaveBeenCalled();

    const live = createAccountAvatarResolver(ports({ refreshPlayer }));
    await expect(live.resolveAccountAvatarUrl(tufAccount, undefined))
      .resolves.toBe('https://example.test/tuf-live.png');
  });

  it('同一账号的并发解析只触发一次协议读取', async () => {
    const lxnsIconId = vi.fn(async () => 200201);
    const resolver = createAccountAvatarResolver(ports({ lxnsIconId }));
    await expect(Promise.all([
      resolver.resolveAccountAvatarUrl(lxnsAccount, lxnsSession),
      resolver.resolveAccountAvatarUrl(lxnsAccount, lxnsSession),
    ])).resolves.toEqual([
      'https://assets2.lxns.net/maimai/icon/200201.png',
      'https://assets2.lxns.net/maimai/icon/200201.png',
    ]);
    expect(lxnsIconId).toHaveBeenCalledTimes(1);
  });

  it('批量同步最多三个并发，并把结果交给更新回调与落盘端口', async () => {
    let active = 0;
    let maximum = 0;
    const refreshPlayer = vi.fn(async (playerId: number) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return tufPlayer(`https://example.test/${playerId}.png`);
    });
    const persistAvatar = vi.fn(async () => undefined);
    const update = vi.fn();
    const accounts = Array.from({ length: 8 }, (_, index) => createTufBoundAccount({
      playerId: 100 + index,
      displayName: `TUF ${index}`,
    }));
    const resolver = createAccountAvatarResolver(ports({ refreshPlayer, persistAvatar }));

    await resolver.syncAllAccountAvatars(accounts, {}, update, new AbortController().signal);

    expect(maximum).toBe(3);
    expect(update).toHaveBeenCalledTimes(8);
    expect(persistAvatar).toHaveBeenCalledTimes(8);
  });

  it('已取消的解析不发请求并返回空', async () => {
    const lxnsIconId = vi.fn(async () => 200201);
    const controller = new AbortController();
    controller.abort(new Error('已取消'));
    const resolver = createAccountAvatarResolver(ports({ lxnsIconId }));
    await expect(resolver.resolveAccountAvatarUrl(lxnsAccount, lxnsSession, controller.signal)).resolves.toBeNull();
    expect(lxnsIconId).not.toHaveBeenCalled();
  });

  it('未提供取消信号时使用端口的前台信号', async () => {
    const foregroundSignal = vi.fn(() => {
      const controller = new AbortController();
      controller.abort(new Error('后台'));
      return controller.signal;
    });
    const resolver = createAccountAvatarResolver(ports({ foregroundSignal }));
    await expect(resolver.resolveAccountAvatarUrl(tufAccount, undefined)).resolves.toBeNull();
    expect(foregroundSignal).toHaveBeenCalled();
  });
});

describe('Phigros 账号摘要端口', () => {
  const hydration: PhigrosAccountHydration = {
    summary: { username: '玩家', avatar: 'avatar.Cipher1' } as unknown as PhigrosAccountHydration['summary'],
    avatarUrl: 'https://example.test/avatar.png',
  };

  it('摘要按账号缓存，重复调用与头像解析只请求一次', async () => {
    const phigrosAccount = vi.fn(async () => hydration);
    const resolver = createAccountAvatarResolver(ports({ phigrosAccount }));

    await expect(resolver.hydratePhigrosAccount(phiAccount, phiSession)).resolves.toEqual(hydration);
    await expect(resolver.hydratePhigrosAccount(phiAccount, phiSession)).resolves.toEqual(hydration);
    await expect(resolver.resolveAccountAvatarUrl(phiAccount, phiSession))
      .resolves.toBe('https://example.test/avatar.png');
    expect(phigrosAccount).toHaveBeenCalledTimes(1);
  });

  it('会话模式不匹配时直接失败', async () => {
    const resolver = createAccountAvatarResolver(ports());
    await expect(resolver.hydratePhigrosAccount(phiAccount, lxnsSession)).rejects.toThrow('account hydration aborted');
  });
});
