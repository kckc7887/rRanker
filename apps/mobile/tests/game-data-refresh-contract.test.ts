import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  awaitGameDataBackground,
  gameDataQueryKey,
  refreshGameDataBundle,
  registerGameDataBackground,
  type GameDataRefreshResult,
} from '@/services/game-data-query';
import { successfulRefresh, failedRefresh } from '@/domain/refresh-result';
import { maimaiPayloadFromSnapshot, type GameDataBundle } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import { ProviderError } from '@/providers/errors';
import { fixtureCatalog, fixturePlayer, fixtureRecords, fixtureSource } from '@/fixtures/sanitized';
const accountId = 'lxns:player-a';
const params = { accountId, gameId: 'maimai', providerId: 'lxns', mode: 'lxns-oauth' } as const;
const queryKey = gameDataQueryKey(params.accountId, params.gameId, params.providerId, params.mode);

function bundle(stale = false, rating = 12345): GameDataBundle {
  const profile = getGameProfile('maimai');
  return {
    gameId: 'maimai',
    providerId: 'lxns',
    profile,
    payload: maimaiPayloadFromSnapshot({
      player: { ...fixturePlayer, rating },
      records: fixtureRecords,
      source: { ...fixtureSource, isStale: stale },
      catalogSource: { ...fixtureSource, isStale: stale },
      best50: {
        player: { ...fixturePlayer, rating },
        currentVersion: fixtureCatalog.currentVersion,
        b35: fixtureRecords.slice(0, 2),
        b15: fixtureRecords.slice(2, 3),
        unmatchedRecordCount: 0,
        rating,
        generatedAt: fixtureSource.updatedAt,
        source: { ...fixtureSource, isStale: stale },
      },
    }, profile),
  };
}

const clients: QueryClient[] = [];
function queryClient(committed?: GameDataBundle): QueryClient {
  const client = new QueryClient();
  if (committed) client.setQueryData(queryKey, committed);
  clients.push(client);
  return client;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => { registerGameDataBackground(queryKey, null); });
afterEach(() => {
  registerGameDataBackground(queryKey, null);
  for (const client of clients.splice(0)) client.clear();
});

describe('游戏数据主动刷新的终态', () => {
  it('获取新数据后返回成功与成绩', async () => {
    const client = queryClient();
    const result = await refreshGameDataBundle({
      client,
      params,
      refetch: () => ({ data: bundle(), isError: false }),
    });

    expect(result.status).toBe('success');
    expect(result.metadata).toMatchObject({ provider: fixtureSource.kind, fetchedAt: fixtureSource.updatedAt });
    expect(result.failures).toEqual([]);
    expect(result.value?.payload).toMatchObject({ kind: 'maimai', playerScore: { display: '12345' } });
  });

  it('曲库失败但成绩提交成功时返回部分失败，并保留可用的成绩', async () => {
    const client = queryClient();
    const result = await refreshGameDataBundle({
      client,
      params,
      catalogFailed: true,
      refetch: () => ({ data: bundle(), isError: false }),
    });

    expect(result.status).toBe('partial');
    expect(result.value).not.toBeNull();
    expect(result.requested).toEqual(['data', 'catalog']);
    expect(result.completed).toEqual(['data']);
    expect(result.failures.map((failure) => failure.target)).toEqual(['catalog']);
  });

  it('刷新抛错时返回失败终态，没有可提交的数据', async () => {
    const client = queryClient();
    const result = await refreshGameDataBundle({
      client,
      params,
      refetch: () => { throw new ProviderError('network', 'offline', true); },
    });

    expect(result.status).toBe('failed');
    expect(result.value).toBeNull();
    expect(result.metadata).toBeNull();
    expect(result.failures[0]).toMatchObject({ code: 'network', target: 'data', retryable: true });
  });

  it('只读回缓存时返回失败终态但仍带上可继续使用的旧快照', async () => {
    const client = queryClient(bundle(true));
    const result = await refreshGameDataBundle({
      client,
      params,
      refetch: () => ({ data: bundle(true), isError: false }),
    });

    expect(result.status).toBe('failed');
    expect(result.value?.payload).toMatchObject({ kind: 'maimai' });
    expect(result.failures[0]).toMatchObject({ code: 'no_data', target: 'data' });
  });
});

describe('后台刷新的可等待句柄', () => {
  it('等待分离的后台刷新落定，而不是把 refetch 立即返回的缓存当成终态', async () => {
    const client = queryClient(bundle(true));
    const pending = deferred<GameDataRefreshResult>();
    registerGameDataBackground(queryKey, pending.promise);
    expect(awaitGameDataBackground(queryKey)).not.toBeNull();

    let settled = false;
    const refreshing = refreshGameDataBundle({
      client,
      params,
      refetch: () => ({ data: bundle(true), isError: false }),
    }).then((result) => { settled = true; return result; });
    await Promise.resolve();
    expect(settled).toBe(false);

    const fresh = bundle(false, 20000);
    pending.resolve(successfulRefresh({
      value: fresh,
      metadata: { provider: 'lxns', label: '落雪咖啡屋', fetchedAt: fixtureSource.updatedAt, revision: null },
      requested: ['data'],
    }));

    const result = await refreshing;
    expect(result.status).toBe('success');
    expect(result.value?.payload).toMatchObject({ kind: 'maimai', playerScore: { display: '20000' } });
  });

  it('后台刷新落定后保留终态，新操作显式清除旧句柄', async () => {
    const pending = deferred<GameDataRefreshResult>();
    registerGameDataBackground(queryKey, pending.promise);
    pending.resolve(failedRefresh({ requested: ['data'] }));
    await awaitGameDataBackground(queryKey);
    expect(await awaitGameDataBackground(queryKey)).toMatchObject({ status: 'failed' });
    registerGameDataBackground(queryKey, undefined);
    expect(await awaitGameDataBackground(queryKey)).toBeNull();
  });
});

describe('游戏数据查询', () => {
  it('刷新读取当前查询键上已提交的数据', async () => {
    const committed = bundle(false, 18000);
    const client = queryClient(committed);
    const result = await refreshGameDataBundle({ client, params, refetch: () => ({ data: bundle(false, 17000) }) });
    expect(result.value).toBe(committed);
    expect(result.value?.payload).toMatchObject({ kind: 'maimai', playerScore: { display: '18000' } });
  });
});
