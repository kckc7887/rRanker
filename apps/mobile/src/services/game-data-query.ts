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
import type { QueryClient } from '@tanstack/react-query';

export const GAME_DATA_QUERY_VERSION = 18;

export function gameDataQueryKey(
  accountId: string,
  gameId: string,
  providerId: string | null,
  mode: string | null,
): readonly unknown[] {
  return ['game-data', GAME_DATA_QUERY_VERSION, accountId, gameId, providerId, mode ?? 'none'];
}

export type GameDataQueryParams = {
  accountId: string;
  gameId: string;
  providerId: string | null;
  mode: string | null;
};

export const GAME_DATA_QUERY_OPTIONS = {
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnMount: false,
  refetchOnReconnect: false,
} as const;

export type GameDataRefetchOutcome = {
  data?: GameDataBundle | undefined;
  isError?: boolean;
  error?: unknown;
};

export type GameDataRefreshTarget = 'data' | 'catalog' | 'player' | 'scores' | 'bests';
export type GameDataRefreshResult = RefreshResult<GameDataBundle, GameDataRefreshTarget>;

const dataRequested: readonly GameDataRefreshTarget[] = ['data'];

function queryId(key: readonly unknown[]): string {
  return JSON.stringify(key);
}

export function readGameDataBundle<T = GameDataBundle>(
  client: QueryClient,
  queryKey: readonly unknown[],
): T | undefined {
  return client.getQueryData<T>(queryKey);
}

export function publishGameDataBundle(
  client: QueryClient,
  queryKey: readonly unknown[],
  bundle: GameDataBundle,
  assertCurrent?: () => void,
): Promise<void> {
  return publishEntityValue(client, queryKey, bundle, assertCurrent);
}

export function publishEntityValue<T>(
  client: QueryClient,
  entityKey: readonly unknown[],
  value: T,
  assertCurrent?: () => void,
): Promise<void> {
  const cache = client.getQueryCache();
  const query = cache.find({ queryKey: entityKey, exact: true });
  const publish = () => {
    try { assertCurrent?.(); } catch { return; }
    client.setQueryData(entityKey, value);
  };
  if (!query || query.state.fetchStatus !== 'fetching') {
    publish();
    return Promise.resolve();
  }
  /** 先等首屏提交，避免它覆盖后台新值。 */
  return new Promise((resolve, reject) => {
    const unsubscribe = cache.subscribe((event) => {
      if (event.query !== query) return;
      if (event.type !== 'removed' && query.state.fetchStatus === 'fetching') return;
      unsubscribe();
      try {
        if (event.type !== 'removed') publish();
        resolve();
      } catch (error) { reject(error); }
    });
  });
}

export function invalidateEntityValue(client: QueryClient, entityKey: readonly unknown[]): void {
  void client.invalidateQueries({ queryKey: entityKey });
}

const backgroundRefreshes = new Map<string, Promise<GameDataRefreshResult>>();

export function registerGameDataBackground(
  queryKey: readonly unknown[],
  background: Promise<GameDataRefreshResult> | null | undefined,
): void {
  const id = queryId(queryKey);
  if (!background) {
    backgroundRefreshes.delete(id);
    return;
  }
  backgroundRefreshes.set(id, background.catch(error => failedRefresh<GameDataBundle, GameDataRefreshTarget>({ requested: dataRequested, failures: [refreshFailureFromError(error, 'data')] })));
}

export function awaitGameDataBackground(
  queryKey: readonly unknown[],
): Promise<GameDataRefreshResult> | null {
  return backgroundRefreshes.get(queryId(queryKey)) ?? null;
}

export function gameDataBackground<T extends { source: DataSource }>(
  settlement: Promise<CacheFirstRefreshResult<T>>,
  toBundle: (value: T) => GameDataBundle | Promise<GameDataBundle>,
): Promise<GameDataRefreshResult> {
  return settlement.then(async (result): Promise<GameDataRefreshResult> => {
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
  }).catch((error: unknown) => failedRefresh<GameDataBundle, GameDataRefreshTarget>({
    requested: dataRequested, failures: [refreshFailureFromError(error, 'data')],
  }));
}

function asDataFailure(
  failure: RefreshFailure<string>,
): RefreshFailure<GameDataRefreshTarget> {
  return { ...failure, target: failure.target === 'catalog' ? 'catalog' : 'data' };
}

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
  client: QueryClient;
  params: GameDataQueryParams;
  refetch: () => GameDataRefetchOutcome | Promise<GameDataRefetchOutcome>;
  catalogFailed?: boolean;
};

type TerminalResolution = {
  readonly cancelled: boolean;
  readonly terminal: GameDataBundle | undefined;
  readonly transportFailure: RefreshFailure<GameDataRefreshTarget> | null;
  readonly structured: GameDataRefreshResult | null;
};

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
  let structured: GameDataRefreshResult | null = null;
  const background = awaitGameDataBackground(queryKey);
  if (background) {
    const settled = await background;
    structured = settled;
    if (settled.status === 'cancelled') return { cancelled: true, terminal: undefined, transportFailure, structured };
    if (settled.value) backgroundValue = settled.value;
    if (!transportFailure && settled.failures.length > 0) transportFailure = asDataFailure(settled.failures[0]);
  }
  const committed = readGameDataBundle(input.client, queryKey);
  return {
    cancelled: false,
    terminal: backgroundValue ?? committed ?? refetched,
    transportFailure,
    structured,
  };
}

function combineStructuredRefresh(
  input: Parameters<typeof buildRefreshResult>[0],
  result: GameDataRefreshResult,
): GameDataRefreshResult {
  const requested = new Set(result.requested);
  const completed = new Set(result.completed);
  const failures = [...result.failures];
  if (input.transportFailure && !failures.some(failure => failure.code === input.transportFailure?.code)) {
    failures.push(input.transportFailure);
  }
  if (input.catalogFailed !== undefined) {
    requested.add('catalog');
    if (input.catalogFailed) failures.push({ code: 'no_data', target: 'catalog', diagnostic: '曲库暂未更新', retryable: true });
    else completed.add('catalog');
  }
  const hasDataCompleted = [...completed].some(target => target !== 'catalog');
  return {
    ...result,
    value: input.terminal ?? result.value,
    requested: [...requested],
    completed: [...completed],
    failures,
    status: failures.length ? hasDataCompleted ? 'partial' : 'failed' : result.status,
  };
}

function buildRefreshResult(input: {
  terminal: GameDataBundle | undefined;
  transportFailure: RefreshFailure<GameDataRefreshTarget> | null;
  requested: readonly GameDataRefreshTarget[];
  catalogFailed: boolean | undefined;
  structured: GameDataRefreshResult | null;
}): GameDataRefreshResult {
  const { terminal, requested } = input;
  if (input.structured) return combineStructuredRefresh(input, input.structured);
  const dataFailure = input.transportFailure
    ?? (terminal ? dataPartFailure(terminal) : null)
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
    structured: resolution.structured,
  });
}
