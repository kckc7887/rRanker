import type { GameDataBundle, GamePayload } from '@/domain/game-data';
import type { DataSource } from '@/domain/models';
import type { RefreshFailure, RefreshResult, SnapshotMetadata } from '@/domain/refresh-result';
import {
  cancelledRefresh,
  failedRefresh,
  noopRefresh,
  partialRefresh,
  refreshFailureFromError,
  successfulRefresh,
} from '@/domain/refresh-result';
import type { CacheFirstRefreshResult } from '@/services/cache-first';

/**
 * 缓存结构或字段语义变化时递增查询 key 版本号。
 * 与 useGameData 共享同一常量，避免 key 构造分叉。
 */
export const GAME_DATA_QUERY_VERSION = 18;

/** 与 useGameData 查询一致的账号维度 key。providerId 取 activeAccount.providerId，与 session.activeProviderId 恒等。 */
export function gameDataQueryKey(
  accountId: string,
  gameId: string,
  providerId: string | null,
  mode: string | null,
): readonly unknown[] {
  return ['game-data', GAME_DATA_QUERY_VERSION, accountId, gameId, providerId, mode ?? 'none'];
}

/** 一个实体的查询维度；刷新与读取必须用同一组参数，才能落在同一份终态上。 */
export type GameDataQueryParams = {
  accountId: string;
  gameId: string;
  providerId: string | null;
  mode: string | null;
};

/**
 * 规范查询选项：一个实体只有一份新鲜度策略，总览与详情都从这里派生视图。
 * 会话内不落后、不自动重取；主动同步走 `refreshGameDataBundle`。
 */
export const GAME_DATA_QUERY_OPTIONS = {
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnMount: false,
  refetchOnReconnect: false,
} as const;

/**
 * 查询客户端在适配层使用的最小端口：只声明真正需要的读取、写入与失效。
 * 服务因此可以在测试里注入内存实现，不需要导入应用单例 QueryClient。
 */
export type GameDataQueryPort = {
  getQueryData<T>(queryKey: readonly unknown[]): T | undefined;
  setQueryData(queryKey: readonly unknown[], value: unknown): unknown;
  invalidateQueries?(filters: { queryKey: readonly unknown[] }): unknown;
};

/** 页面上一次 refetch 的结果形状；只取终态判定需要的字段。 */
export type GameDataRefetchOutcome = {
  data?: GameDataBundle | undefined;
  isError?: boolean;
  error?: unknown;
};

export type GameDataRefreshTarget = 'data' | 'catalog';
export type GameDataRefreshResult = RefreshResult<GameDataBundle, GameDataRefreshTarget>;

const dataRequested: readonly GameDataRefreshTarget[] = ['data'];

function queryId(key: readonly unknown[]): string {
  return JSON.stringify(key);
}

/** 已提交值的规范读取：调用方不再自己判断「后台刷新有没有落定」。 */
export function readGameDataBundle<T = GameDataBundle>(
  client: GameDataQueryPort,
  queryKey: readonly unknown[],
): T | undefined {
  if (typeof client.getQueryData !== 'function') return undefined;
  return client.getQueryData<T>(queryKey);
}

/** 查询适配层的唯一发布入口：数据包只经这里进入缓存。 */
export function publishGameDataBundle(
  client: GameDataQueryPort,
  queryKey: readonly unknown[],
  bundle: GameDataBundle,
): void {
  if (typeof client.setQueryData !== 'function') return;
  client.setQueryData(queryKey, bundle);
}

/** 一个实体的已提交值写入入口；总览数据包与各游戏页面共用同一条发布路径。 */
export function publishEntityValue<T>(
  client: GameDataQueryPort,
  entityKey: readonly unknown[],
  value: T,
): void {
  if (typeof client.setQueryData !== 'function') return;
  client.setQueryData(entityKey, value);
}

/** 失效另一个粒度的实体（如曲库、排名）：查询适配层之外的模块不得直接操作查询客户端。 */
export function invalidateEntityValue(client: GameDataQueryPort, entityKey: readonly unknown[]): void {
  void client.invalidateQueries?.({ queryKey: entityKey });
}

const backgroundRefreshes = new Map<string, Promise<GameDataRefreshResult>>();

/**
 * 登记一个实体的后台刷新终态句柄。查询函数在返回首屏数据前登记，
 * 主动刷新随后就能等到「网络、提交与失败」全部落定，而不是只看 refetch 的返回值。
 */
export function registerGameDataBackground(
  queryKey: readonly unknown[],
  background: Promise<GameDataRefreshResult> | null | undefined,
): void {
  const id = queryId(queryKey);
  if (!background) {
    backgroundRefreshes.delete(id);
    return;
  }
  backgroundRefreshes.set(id, background);
  const cleanup = () => { if (backgroundRefreshes.get(id) === background) backgroundRefreshes.delete(id); };
  void background.then(cleanup, cleanup);
}

/** 读取该实体当前登记的后台刷新句柄；没有分离刷新时为 null。 */
export function awaitGameDataBackground(
  queryKey: readonly unknown[],
): Promise<GameDataRefreshResult> | null {
  return backgroundRefreshes.get(queryId(queryKey)) ?? null;
}

/** 清空后台刷新句柄；测试与整体清理入口使用。 */
export function resetGameDataBackground(): void {
  backgroundRefreshes.clear();
}

/** 把「快照级」的后台刷新终态提升为「数据包级」终态，只在有值时做一次展示转换。 */
export function gameDataBackground<T extends { source: DataSource }>(
  settlement: Promise<CacheFirstRefreshResult<T>>,
  toBundle: (value: T) => GameDataBundle | Promise<GameDataBundle>,
): Promise<GameDataRefreshResult> {
  return settlement.then(async (result) => {
    const value = result.value === null ? null : await toBundle(result.value);
    const failures = result.failures.map((failure) => asDataFailure(failure));
    switch (result.status) {
      case 'success':
        return value && result.metadata
          ? successfulRefresh({ value, metadata: result.metadata, requested: dataRequested })
          : value
            ? failedRefresh({ value, metadata: null, requested: dataRequested, failures })
            : failedRefresh({ requested: dataRequested, failures });
      case 'noop':
        return value && result.metadata
          ? noopRefresh({ value, metadata: result.metadata })
          : failedRefresh({ value, metadata: null, requested: dataRequested, failures });
      case 'partial':
        return value && result.metadata
          ? partialRefresh({ value, metadata: result.metadata, requested: dataRequested, completed: dataRequested, failures })
          : failedRefresh({ value, metadata: null, requested: dataRequested, failures });
      case 'failed':
        return failedRefresh({ value, metadata: value ? result.metadata : null, requested: dataRequested, failures });
      default:
        return cancelledRefresh<GameDataBundle, GameDataRefreshTarget>(dataRequested);
    }
  });
}

function asDataFailure(
  failure: RefreshFailure<string>,
): RefreshFailure<GameDataRefreshTarget> {
  return { ...failure, target: failure.target === 'catalog' ? 'catalog' : 'data' };
}

/** 数据包是否只剩缓存：各游戏载荷的来源标记由这一处判定，UI 不各自读缓存推断。 */
export function gameDataBundleStale(bundle: GameDataBundle | undefined): boolean {
  const payload = bundle?.payload;
  if (!payload) return false;
  switch (payload.kind) {
    case 'rizline':
      return payload.source.isStale || payload.catalogSource?.isStale === true;
    case 'chunithm':
    case 'adofai':
    case 'musedash':
    case 'majdata-net':
    case 'phira':
    case 'osu':
      return payload.source.isStale;
    case 'maimai':
    case 'phigros':
      return payload.source.isStale || payload.catalogSource.isStale;
    default:
      return false;
  }
}

function payloadSource(payload: GamePayload | undefined): DataSource | undefined {
  if (!payload) return undefined;
  return (payload as { source?: DataSource }).source;
}

function terminalMetadata(bundle: GameDataBundle | undefined): SnapshotMetadata | null {
  const source = payloadSource(bundle?.payload);
  if (!source || source.kind === 'cache') return null;
  return { provider: source.kind, label: source.label, fetchedAt: source.updatedAt, revision: null };
}

/** 数据部分的终态失败：认证失效优先于「只读到缓存」。 */
function dataPartFailure(bundle: GameDataBundle | undefined): RefreshFailure<GameDataRefreshTarget> | null {
  const payload = bundle?.payload;
  if (!payload) {
    return { code: 'no_data', target: 'data', diagnostic: '没有可用的成绩数据', retryable: true };
  }
  if (payload.kind === 'rizline' && payload.requiresLogin) {
    return { code: 'authentication', target: 'data', diagnostic: '登录已失效', retryable: false };
  }
  if (payload.kind === 'chunithm' && !payload.hasSyncedData) {
    return { code: 'no_data', target: 'data', diagnostic: '账号还没有可同步的成绩', retryable: true };
  }
  if (gameDataBundleStale(bundle)) {
    return { code: 'no_data', target: 'data', diagnostic: '本次只读取到缓存', retryable: true };
  }
  return null;
}

export type GameDataRefreshInput = {
  client: GameDataQueryPort;
  /** 与查询同一组维度参数。 */
  params: GameDataQueryParams;
  /** 触发该实体查询重新读取；返回该查询的原始结果。 */
  refetch: () => GameDataRefetchOutcome | Promise<GameDataRefetchOutcome>;
  /** 不同粒度的曲库部分已经失败：只把这次刷新降级成部分失败。 */
  catalogFailed?: boolean;
};

type TerminalResolution = {
  readonly cancelled: boolean;
  readonly terminal: GameDataBundle | undefined;
  readonly transportFailure: RefreshFailure<GameDataRefreshTarget> | null;
};

/**
 * 解析这次刷新的终态：等 refetch、等该实体的后台分离刷新句柄，再按
 * 「后台落定值 → 实体已提交版本 → refetch 返回值」取终态数据。
 */
async function resolveTerminal(
  input: GameDataRefreshInput,
  queryKey: readonly unknown[],
): Promise<TerminalResolution> {
  let refetched: GameDataBundle | undefined;
  let transportFailure: RefreshFailure<GameDataRefreshTarget> | null = null;
  try {
    const outcome = await input.refetch();
    if (outcome?.isError) transportFailure = refreshFailureFromError(outcome.error, 'data');
    else refetched = outcome?.data;
  } catch (error) {
    transportFailure = refreshFailureFromError(error, 'data');
  }

  let backgroundValue: GameDataBundle | null = null;
  const background = awaitGameDataBackground(queryKey);
  if (background) {
    const settled = await background;
    if (settled.status === 'cancelled') return { cancelled: true, terminal: undefined, transportFailure };
    if (settled.value) backgroundValue = settled.value;
    if (!transportFailure && settled.failures.length > 0) transportFailure = asDataFailure(settled.failures[0]);
  }
  const committed = readGameDataBundle(input.client, queryKey);
  return {
    cancelled: false,
    terminal: backgroundValue ?? committed ?? refetched,
    transportFailure,
  };
}

/** 聚合各粒度的成功项与失败项；只有数据部分完成才算部分成功。 */
function buildRefreshResult(input: {
  terminal: GameDataBundle | undefined;
  transportFailure: RefreshFailure<GameDataRefreshTarget> | null;
  requested: readonly GameDataRefreshTarget[];
  catalogFailed: boolean | undefined;
}): GameDataRefreshResult {
  const { terminal, requested } = input;
  // 有载荷但只剩缓存（或认证失效）时，缓存提示比传输错误更能说明结果；
  // 完全没有载荷时传输错误优先，最后才回落到「没有可用数据」。
  const dataFailure = (terminal ? dataPartFailure(terminal) : null)
    ?? input.transportFailure
    ?? dataPartFailure(terminal);
  const failures: RefreshFailure<GameDataRefreshTarget>[] = [];
  const completed: GameDataRefreshTarget[] = [];
  if (dataFailure) failures.push(dataFailure);
  else completed.push('data');
  if (input.catalogFailed === true) {
    failures.push({ code: 'no_data', target: 'catalog', diagnostic: '曲库暂未更新', retryable: true });
  } else if (input.catalogFailed === false) {
    completed.push('catalog');
  }

  const metadata = terminalMetadata(terminal);
  if (failures.length === 0 && terminal && metadata) {
    return successfulRefresh({ value: terminal, metadata, requested, completed });
  }
  if (failures.length === 0) {
    return failedRefresh({
      value: terminal ?? null,
      metadata: null,
      requested,
      completed,
      failures: [{ code: 'no_data', target: 'data', diagnostic: '本次刷新没有可用数据', retryable: true }],
    });
  }
  if (terminal && metadata && completed.includes('data')) {
    return partialRefresh({ value: terminal, metadata, requested, completed, failures });
  }
  return failedRefresh({
    value: terminal ?? null,
    metadata: terminal ? metadata : null,
    requested,
    completed,
    failures,
  });
}

/**
 * 主动刷新一个实体，返回「网络读取、后台分离刷新与提交」全部落定后的终态。
 * 调用方只读返回值判断成功 / 部分失败 / 全部失败，不需要逐游戏 waiter，
 * 也不需要再二次读查询缓存来猜后台刷新有没有完成。
 *
 * 只取消一个消费者时，使用该消费者自己的 signal（见 `cacheFirstLoadWithBackground`）；
 * 取消整个操作由缓存清理的代次与共享任务中止负责，两者都会反映在终态里。
 */
export async function refreshGameDataBundle(input: GameDataRefreshInput): Promise<GameDataRefreshResult> {
  const queryKey = gameDataQueryKey(
    input.params.accountId,
    input.params.gameId,
    input.params.providerId,
    input.params.mode,
  );
  const requested: GameDataRefreshTarget[] = input.catalogFailed === undefined
    ? [...dataRequested]
    : [...dataRequested, 'catalog'];
  const resolution = await resolveTerminal(input, queryKey);
  if (resolution.cancelled) return cancelledRefresh<GameDataBundle, GameDataRefreshTarget>(requested);
  return buildRefreshResult({
    terminal: resolution.terminal,
    transportFailure: resolution.transportFailure,
    requested,
    catalogFailed: input.catalogFailed,
  });
}
