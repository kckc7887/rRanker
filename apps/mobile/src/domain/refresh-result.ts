import type { DataSource } from '@/domain/models';
import type { ProviderErrorCode } from '@/providers/errors';

/** 缓存保留原提供方和抓取时间，不改成本次读取时间。 */
export type SnapshotMetadata = {
  readonly provider: DataSource['kind'];
  readonly label: string;
  readonly fetchedAt: string;
  readonly revision: string | null;
};

export function snapshotMetadataOf(source: DataSource, revision: string | null = null): SnapshotMetadata {
  if (source.kind === 'cache') throw new Error('快照元数据不接受缓存标识作为提供方');
  return { provider: source.kind, label: source.label, fetchedAt: source.updatedAt, revision };
}

export function cachedSnapshotSource(source: DataSource): DataSource {
  return source.isStale ? source : { ...source, isStale: true };
}

export function assertFreshSnapshotSource(source: DataSource): void {
  if (source.isStale || source.kind === 'cache') throw new Error('缓存回退不能作为刷新结果写入');
}

export type RefreshStatus = 'success' | 'partial' | 'failed' | 'cancelled' | 'noop';

export type RefreshFailure<Target extends string = string> = {
  readonly code: ProviderErrorCode;
  readonly target: Target | null;
  readonly diagnostic: string;
  readonly retryable: boolean;
};

/** metadata 只在 success/noop 中表示本次抓取，其余保留原时间。 */
export type RefreshResult<T, Target extends string = string> = {
  readonly status: RefreshStatus;
  readonly value: T | null;
  readonly metadata: SnapshotMetadata | null;
  readonly requested: readonly Target[];
  readonly completed: readonly Target[];
  readonly failures: readonly RefreshFailure<Target>[];
};

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
  authorization_prepare: true,
  authorization_open: true,
  authorization_callback: true,
  verification: true,
  configuration: true,
  credential_storage: true,
  local_commit: true,
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

export function successfulRefresh<T, Target extends string = string>(input: {
  value: T;
  metadata: SnapshotMetadata;
  requested: readonly Target[];
  completed?: readonly Target[];
}): RefreshResult<T, Target> {
  const completed = input.completed ?? input.requested;
  return {
    status: 'success',
    value: input.value,
    metadata: input.metadata,
    requested: [...input.requested],
    completed: [...completed],
    failures: [],
  };
}

/** 部分成功保留失败项，不推进整批成功时间。 */
export function partialRefresh<T, Target extends string = string>(input: {
  value: T;
  metadata: SnapshotMetadata;
  requested: readonly Target[];
  completed: readonly Target[];
  failures: readonly RefreshFailure<Target>[];
}): RefreshResult<T, Target> {
  return {
    status: 'partial',
    value: input.value,
    metadata: input.metadata,
    requested: [...input.requested],
    completed: [...input.completed],
    failures: [...input.failures],
  };
}

export function failedRefresh<T, Target extends string = string>(input: {
  value?: T | null;
  metadata?: SnapshotMetadata | null;
  requested: readonly Target[];
  completed?: readonly Target[];
  failures?: readonly RefreshFailure<Target>[];
}): RefreshResult<T, Target> {
  const value = input.value ?? null;
  const metadata = input.metadata ?? null;
  return {
    status: 'failed',
    value,
    metadata,
    requested: [...input.requested],
    completed: [...(input.completed ?? [])],
    failures: [...(input.failures ?? [])],
  };
}

export function cancelledRefresh<T, Target extends string = string>(
  requested: readonly Target[],
): RefreshResult<T, Target> {
  return { status: 'cancelled', value: null, metadata: null, requested: [...requested], completed: [], failures: [] };
}

export function noopRefresh<T, Target extends string = string>(input: {
  value: T;
  metadata: SnapshotMetadata;
}): RefreshResult<T, Target> {
  return {
    status: 'noop', value: input.value, metadata: input.metadata, requested: [], completed: [], failures: [],
  };
}

export function refreshFailuresNeedLogin(failures: readonly RefreshFailure<string>[]): boolean {
  return failures.some((failure) => failure.code === 'authentication');
}

export function refreshNeedsLogin<T, Target extends string>(
  result: Pick<RefreshResult<T, Target>, 'failures'>,
): boolean {
  return refreshFailuresNeedLogin(result.failures);
}
