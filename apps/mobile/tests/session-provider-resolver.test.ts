import { describe, expect, it, vi } from 'vitest';
import { createLocalMaimaiAccount, createMaxedMaimaiTestAccount } from '@/domain/bound-account';
import type { ProviderSession } from '@/providers/contracts';
import { EmptyCatalogProvider, EmptyScoreProvider } from '@/providers/empty-provider';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import {
  providerResolverCacheKey,
  providerResolverStats,
  releaseResolvedProviders,
  resetProviderResolverForTests,
  resolveSessionProviders,
} from '@/state/session-provider-resolver';

vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {} }));

process.env.OSU_OAUTH_CLIENT_SECRET ??= 'test-client-secret';

const lxnsSession = (refreshToken: string): ProviderSession => ({
  mode: 'lxns-oauth',
  accessToken: `access-${refreshToken}`,
  refreshToken,
  expiresAt: Date.now() + 600_000,
  persistable: true,
});

const account = () => ({ ...createLocalMaimaiAccount('本地玩家', 0) });

const resolve = (
  bound: Parameters<typeof resolveSessionProviders>[0],
  credentials: Parameters<typeof resolveSessionProviders>[1],
) => resolveSessionProviders(bound, credentials, vi.fn());

describe('Provider resolver 缓存与失效条件', () => {
  it('同一账号与同一凭据版本复用实例，不重复构造', () => {
    resetProviderResolverForTests();
    const bound = account();
    const before = providerResolverStats().created;

    const first = resolve(bound, { id: 'credential:local', session: null });
    const second = resolve({ ...bound }, { id: 'credential:local', session: null });

    expect(second.providers.scoreProvider).toBe(first.providers.scoreProvider);
    expect(second.providers.catalogProvider).toBe(first.providers.catalogProvider);
    expect(second.cacheKey).toBe(first.cacheKey);
    expect(providerResolverStats().created).toBe(before + 1);
  });

  it('换账号或换凭据都产生新的缓存键与新实例', () => {
    resetProviderResolverForTests();
    const bound = account();
    const baseKey = providerResolverCacheKey(bound, { id: 'credential:local', session: null });

    expect(providerResolverCacheKey({ ...bound, id: 'maimai:local:second' }, { id: 'credential:local', session: null }))
      .not.toBe(baseKey);
    expect(providerResolverCacheKey(bound, { id: 'credential:other', session: null })).not.toBe(baseKey);
  });

  it('凭据版本改变（轮换或重新授权）后缓存键改变并重建实例', () => {
    resetProviderResolverForTests();
    const bound = { ...createMaxedMaimaiTestAccount(), providerId: 'lxns' as const };
    const original = lxnsSession('refresh-a');
    const rotated = lxnsSession('refresh-b');

    const before = resolve(bound, { id: 'lxns:shared', session: original });
    expect(before.providers.scoreProvider).toBeInstanceOf(LxnsScoreProvider);

    const afterRotation = resolve(bound, { id: 'lxns:shared', session: rotated });
    expect(afterRotation.providers.scoreProvider).not.toBe(before.providers.scoreProvider);
    expect(afterRotation.cacheKey).not.toBe(before.cacheKey);

    // 重新授权拿到另一份凭据引用时同样失效。
    const reAuthorized = resolve(bound, { id: 'lxns:another', session: rotated });
    expect(reAuthorized.cacheKey).not.toBe(afterRotation.cacheKey);
    expect(reAuthorized.providers.scoreProvider).not.toBe(afterRotation.providers.scoreProvider);
  });

  it('解绑账号会清掉该账号的已解析实例', () => {
    resetProviderResolverForTests();
    const bound = account();
    const first = resolve(bound, { id: 'credential:local', session: null });
    expect(providerResolverStats().entries).toBe(1);

    releaseResolvedProviders([bound.id]);

    expect(providerResolverStats().entries).toBe(0);
    const recreated = resolve(bound, { id: 'credential:local', session: null });
    expect(recreated.providers.scoreProvider).not.toBe(first.providers.scoreProvider);
  });

  it('凭据字段顺序不同但内容相同保持同一缓存键', () => {
    const bound = account();
    const session: ProviderSession = { mode: 'import-token', value: 'token', persistable: true };
    const reordered: ProviderSession = { persistable: true, value: 'token', mode: 'import-token' };
    expect(providerResolverCacheKey(bound, { id: 'credential:x', session }))
      .toBe(providerResolverCacheKey(bound, { id: 'credential:x', session: reordered }));
  });

  it('未绑定账号返回共享的空 Provider', () => {
    resetProviderResolverForTests();
    const unbound = resolve(null, { id: null, session: null });
    expect(unbound.providers.scoreProvider).toBeInstanceOf(EmptyScoreProvider);
    expect(unbound.providers.catalogProvider).toBeInstanceOf(EmptyCatalogProvider);
  });
});
