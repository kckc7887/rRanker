import type { DataSource } from '@/domain/models';
import type { ProviderErrorCode } from '@/providers/errors';

/**
 * 快照元数据：原提供方、抓取时间与可用修订。
 * 它只描述「这份数据是谁在什么时候抓到的」，不表达新鲜度，也不表达刷新是否成功；
 * 缓存读取保留原提供方与抓取时间，不把抓取时间改写成当前时间。
 */
export type SnapshotMetadata = {
  /** 原提供方；缓存命中时仍是原提供方，`cache` 只是展示标记。 */
  readonly provider: DataSource['kind'];
  /** 展示用名称，不承载错误原因或新鲜度。 */
  readonly label: string;
  /** 该数据实际抓取完成的时间。 */
  readonly fetchedAt: string;
  /** 该快照对应的可用修订；没有修订语义时为 null。 */
  readonly revision: string | null;
};

/**
 * 从持久化来源读出快照元数据。`cache` 是展示层的过期标记而不是提供方，
 * 直接传进来会抛错；缓存读取请先用 `cachedSnapshotSource` 打标再取元数据。
 */
export function snapshotMetadataOf(source: DataSource, revision: string | null = null): SnapshotMetadata {
  if (source.kind === 'cache') throw new Error('快照元数据不接受缓存标识作为提供方');
  return { provider: source.kind, label: source.label, fetchedAt: source.updatedAt, revision };
}

/** 缓存读取的展示来源：保留原提供方、抓取时间与修订，只补充过期标记。 */
export function cachedSnapshotSource(source: DataSource): DataSource {
  return source.isStale ? source : { ...source, isStale: true };
}

/** 持久化新快照前的断言：缓存命中或网络失败兜底不得被当成刷新结果写入。 */
export function assertFreshSnapshotSource(source: DataSource): void {
  if (source.isStale || source.kind === 'cache') throw new Error('缓存回退不能作为刷新结果写入');
}

/** 一次刷新的终态；`partial` 带失败项，`failed` 可附仍允许使用的旧快照。 */
export type RefreshStatus = 'success' | 'partial' | 'failed' | 'cancelled' | 'noop';

export type RefreshFailure<Target extends string = string> = {
  /** 机器可判定的原因：是否重新登录只看它，不读展示文案。 */
  readonly code: ProviderErrorCode;
  /** 出错的单个项，供只重试失败项使用；整批失败时为 null。 */
  readonly target: Target | null;
  /** 仅供诊断链路使用，任何情况下都不作为界面文案。 */
  readonly diagnostic: string;
  /** 重试是否可能成功；需要重新登录的失败项为 false。 */
  readonly retryable: boolean;
};

/**
 * 一次刷新的结果：结果状态与快照元数据分开。
 * `metadata` 只在 success / noop 时是本次抓取时间；其余情况保留旧快照元数据，
 * 写回时必须用 `refreshedFetchedAt` 才不会把部分成功当成完整成功时间。
 */
export type RefreshResult<T, Target extends string = string> = {
  readonly status: RefreshStatus;
  /** 仍可继续使用的数据；`cancelled` 或首次刷新失败时为 null。 */
  readonly value: T | null;
  readonly metadata: SnapshotMetadata | null;
  readonly requested: readonly Target[];
  readonly completed: readonly Target[];
  readonly failures: readonly RefreshFailure<Target>[];
};

/** 公共提供方错误的机器字段；领域层只按结构识别，不依赖 provider 的运行时实现。 */
const PROVIDER_ERROR_CODES: Record<ProviderErrorCode, true> = {
  authentication: true,
  permission: true,
  rate_limit: true,
  timeout: true,
  upstream_schema: true,
  no_data: true,
  cache_corrupt: true,
  network: true,
  unknown: true,
};

function isProviderErrorCode(value: unknown): value is ProviderErrorCode {
  return typeof value === 'string' && Object.hasOwn(PROVIDER_ERROR_CODES, value);
}

type ProviderErrorLike = { code: ProviderErrorCode; retryable: boolean; message: string };

function isProviderErrorLike(error: unknown): error is ProviderErrorLike {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; retryable?: unknown; message?: unknown };
  return isProviderErrorCode(candidate.code)
    && typeof candidate.retryable === 'boolean'
    && typeof candidate.message === 'string';
}

export function refreshFailureFromError<Target extends string = string>(
  error: unknown,
  target: Target | null = null,
): RefreshFailure<Target> {
  if (isProviderErrorLike(error)) {
    return { code: error.code, target, diagnostic: error.message, retryable: error.retryable };
  }
  return {
    code: 'unknown',
    target,
    diagnostic: error instanceof Error ? error.message : '',
    retryable: true,
  };
}

function assertCompletedWithinRequested<Target extends string>(
  requested: readonly Target[],
  completed: readonly Target[],
): void {
  for (const item of completed) {
    if (!requested.includes(item)) throw new Error('完成范围必须落在请求范围内');
  }
}

/** 请求范围全部完成：唯一会推进快照抓取时间的成功结果。 */
export function successfulRefresh<T, Target extends string = string>(input: {
  value: T;
  metadata: SnapshotMetadata;
  requested: readonly Target[];
  completed?: readonly Target[];
}): RefreshResult<T, Target> {
  const completed = input.completed ?? input.requested;
  assertCompletedWithinRequested(input.requested, completed);
  return {
    status: 'success',
    value: input.value,
    metadata: input.metadata,
    requested: [...input.requested],
    completed: [...completed],
    failures: [],
  };
}

/** 部分成功：保留成功项、失败项与实际完成范围，不推进完整成功时间。 */
export function partialRefresh<T, Target extends string = string>(input: {
  value: T;
  metadata: SnapshotMetadata;
  requested: readonly Target[];
  completed: readonly Target[];
  failures: readonly RefreshFailure<Target>[];
}): RefreshResult<T, Target> {
  if (input.failures.length === 0) throw new Error('部分成功必须带失败项');
  assertCompletedWithinRequested(input.requested, input.completed);
  return {
    status: 'partial',
    value: input.value,
    metadata: input.metadata,
    requested: [...input.requested],
    completed: [...input.completed],
    failures: [...input.failures],
  };
}

/**
 * 失败：可以附带仍允许使用的旧快照及其原抓取时间。
 * 旧快照的来源无法识别时用 `value` + `metadata: null` 表达，调用端不得据此推进成功时间。
 */
export function failedRefresh<T, Target extends string = string>(input: {
  value?: T | null;
  metadata?: SnapshotMetadata | null;
  requested: readonly Target[];
  completed?: readonly Target[];
  failures?: readonly RefreshFailure<Target>[];
}): RefreshResult<T, Target> {
  const value = input.value ?? null;
  const metadata = input.metadata ?? null;
  if (value === null && metadata !== null) throw new Error('没有可继续使用的数据时不得带快照元数据');
  assertCompletedWithinRequested(input.requested, input.completed ?? []);
  return {
    status: 'failed',
    value,
    metadata,
    requested: [...input.requested],
    completed: [...(input.completed ?? [])],
    failures: [...(input.failures ?? [])],
  };
}

/** 取消：没有任何数据与时间被提交。 */
export function cancelledRefresh<T, Target extends string = string>(
  requested: readonly Target[],
): RefreshResult<T, Target> {
  return { status: 'cancelled', value: null, metadata: null, requested: [...requested], completed: [], failures: [] };
}

/** 没有需要刷新的项：沿用现有快照与它的抓取时间。 */
export function noopRefresh<T, Target extends string = string>(input: {
  value: T;
  metadata: SnapshotMetadata;
}): RefreshResult<T, Target> {
  return {
    status: 'noop', value: input.value, metadata: input.metadata, requested: [], completed: [], failures: [],
  };
}

export function refreshSucceeded<T, Target extends string>(result: RefreshResult<T, Target>): boolean {
  return result.status === 'success' && result.failures.length === 0;
}

/** 只重试失败项时使用的具体目标；需要重新登录的项不属于可重试项。 */
export function refreshRetryTargets<T, Target extends string>(result: RefreshResult<T, Target>): Target[] {
  return result.failures
    .filter((failure) => failure.retryable && failure.target !== null)
    .map((failure) => failure.target as Target);
}

export function refreshFailuresNeedLogin(failures: readonly RefreshFailure<string>[]): boolean {
  return failures.some((failure) => failure.code === 'authentication');
}

/** 是否需要重新登录：只看机器错误码。 */
export function refreshNeedsLogin<T, Target extends string>(
  result: Pick<RefreshResult<T, Target>, 'failures'>,
): boolean {
  return refreshFailuresNeedLogin(result.failures);
}

/**
 * 快照应写回的抓取时间：只有本次请求范围全部成功（success / noop）才推进；
 * partial / failed / cancelled 保留上一次完整成功时间。
 */
export function refreshedFetchedAt<T, Target extends string>(
  result: RefreshResult<T, Target>,
  previousFetchedAt: string,
): string {
  return result.status === 'success' || result.status === 'noop'
    ? result.metadata?.fetchedAt ?? previousFetchedAt
    : previousFetchedAt;
}
