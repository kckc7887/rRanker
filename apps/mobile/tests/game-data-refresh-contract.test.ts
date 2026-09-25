import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GAME_DATA_QUERY_OPTIONS,
  awaitGameDataBackground,
  gameDataQueryKey,
  refreshGameDataBundle,
  registerGameDataBackground,
  resetGameDataBackground,
  type GameDataQueryPort,
  type GameDataRefreshResult,
} from '@/services/game-data-query';
import { refreshSucceeded, successfulRefresh, failedRefresh } from '@/domain/refresh-result';
import { gameDataBundle, maimaiPayloadFromSnapshot } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import { ProviderError } from '@/providers/errors';
import { fixtureCatalog, fixturePlayer, fixtureRecords, fixtureSource } from '@/fixtures/sanitized';

const mobileRoot = resolve(__dirname, '..');
const accountId = 'lxns:player-a';
const params = { accountId, gameId: 'maimai', providerId: 'lxns', mode: 'lxns-oauth' } as const;
const queryKey = gameDataQueryKey(params.accountId, params.gameId, params.providerId, params.mode);

function bundle(stale = false, rating = 12345) {
  const profile = getGameProfile('maimai');
  return gameDataBundle({
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
  });
}

/** 只实现适配层声明的最小端口；服务不得依赖应用单例。 */
function memoryPort(committed?: unknown): GameDataQueryPort & { published: unknown[] } {
  const published: unknown[] = [];
  return {
    getQueryData: <T,>() => committed as T | undefined,
    setQueryData: (_key: readonly unknown[], value: unknown) => { published.push(value); },
    published,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => { resetGameDataBackground(); });
afterEach(() => { resetGameDataBackground(); });

describe('游戏数据主动刷新的终态', () => {
  it('取回新数据时返回成功终态，UI 不需要读任何其它真相', async () => {
    const client = memoryPort();
    const result = await refreshGameDataBundle({
      client,
      params,
      refetch: () => ({ data: bundle(), isError: false }),
    });

    expect(result.status).toBe('success');
    expect(refreshSucceeded(result)).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.value?.payload).toMatchObject({ kind: 'maimai', playerScore: { display: '12345' } });
  });

  it('曲库失败但成绩提交成功时返回部分失败，并保留可用的成绩', async () => {
    const client = memoryPort();
    const result = await refreshGameDataBundle({
      client,
      params,
      catalogFailed: true,
      refetch: () => ({ data: bundle(), isError: false }),
    });

    expect(result.status).toBe('partial');
    expect(refreshSucceeded(result)).toBe(false);
    expect(result.value).not.toBeNull();
    expect(result.requested).toEqual(['data', 'catalog']);
    expect(result.completed).toEqual(['data']);
    expect(result.failures.map((failure) => failure.target)).toEqual(['catalog']);
  });

  it('刷新抛错时返回失败终态，没有可提交的数据', async () => {
    const client = memoryPort();
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
    const client = memoryPort(bundle(true));
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
    const client = memoryPort(bundle(true));
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

  it('后台刷新落定后句柄不再保留，后续刷新只等自己这次', async () => {
    const pending = deferred<GameDataRefreshResult>();
    registerGameDataBackground(queryKey, pending.promise);
    pending.resolve(failedRefresh({ requested: ['data'] }));
    await awaitGameDataBackground(queryKey);
    expect(awaitGameDataBackground(queryKey)).toBeNull();
  });
});

describe('查询适配层的所有权边界', () => {
  it('service 不导入应用单例 QueryClient，测试直接注入端口', () => {
    const source = readFileSync(resolve(mobileRoot, 'src/services/game-data-query.ts'), 'utf8');
    expect(source).not.toContain("from '@/state/query-client'");
    expect(source).not.toContain('queryClient.');
  });

  it('规范查询选项只有一份，且是会话内不落后的策略', () => {
    expect(GAME_DATA_QUERY_OPTIONS).toEqual({
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnMount: false,
      refetchOnReconnect: false,
    });
    const hook = readFileSync(resolve(mobileRoot, 'src/hooks/use-game-data.ts'), 'utf8');
    expect(hook).toContain('GAME_DATA_QUERY_OPTIONS');
  });

  it('总览查询与刷新落在同一个实体键上', async () => {
    const seen: unknown[][] = [];
    const client: GameDataQueryPort = {
      getQueryData: <T,>(key: readonly unknown[]) => { seen.push([...key]); return undefined as T | undefined; },
      setQueryData: () => undefined,
    };
    await refreshGameDataBundle({ client, params, refetch: () => ({ data: bundle() }) });
    expect(seen).toEqual([[...queryKey]]);
  });
});
