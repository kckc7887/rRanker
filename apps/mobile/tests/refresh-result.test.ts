import { describe, expect, it } from 'vitest';
import type { DataSource } from '@/domain/models';
import { ProviderError } from '@/providers/errors';
import {
  assertFreshSnapshotSource,
  cachedSnapshotSource,
  cancelledRefresh,
  failedRefresh,
  noopRefresh,
  partialRefresh,
  refreshFailureFromError,
  refreshNeedsLogin,
  refreshRetryTargets,
  refreshSucceeded,
  refreshedFetchedAt,
  snapshotMetadataOf,
  successfulRefresh,
} from '@/domain/refresh-result';

const source: DataSource = {
  kind: 'lxns', label: '落雪咖啡屋', updatedAt: '2026-07-01T00:00:00.000Z', isStale: false,
};
const previousFetchedAt = '2026-01-01T00:00:00.000Z';

describe('snapshot metadata', () => {
  it('records the original provider, fetch time and usable revision', () => {
    expect(snapshotMetadataOf(source, 'rev-2')).toEqual({
      provider: 'lxns', label: '落雪咖啡屋', fetchedAt: '2026-07-01T00:00:00.000Z', revision: 'rev-2',
    });
    expect(snapshotMetadataOf(source).revision).toBeNull();
  });

  it('refuses the display-only cache marker where a provider is required', () => {
    expect(() => snapshotMetadataOf({ ...source, kind: 'cache' })).toThrow('缓存标识');
  });

  it('keeps provider, label and fetch time when a snapshot is read from cache', () => {
    const cached = cachedSnapshotSource(source);
    expect(cached).toEqual({ ...source, isStale: true });
    expect(snapshotMetadataOf(cached)).toEqual(snapshotMetadataOf(source));
    expect(cachedSnapshotSource(cached)).toBe(cached);
  });

  it('rejects a cache fallback that is written as a refresh result', () => {
    expect(() => assertFreshSnapshotSource(source)).not.toThrow();
    expect(() => assertFreshSnapshotSource(cachedSnapshotSource(source))).toThrow('缓存');
    expect(() => assertFreshSnapshotSource({ ...source, kind: 'cache' })).toThrow('缓存');
  });
});

describe('refresh failures', () => {
  it('carries a machine error code that does not depend on the message', () => {
    expect(refreshFailureFromError(new ProviderError('authentication', '任意文案', false), 'bests'))
      .toEqual({ code: 'authentication', target: 'bests', diagnostic: '任意文案', retryable: false });
    expect(refreshFailureFromError(new Error('offline')))
      .toEqual({ code: 'unknown', target: null, diagnostic: 'offline', retryable: true });
  });

  it('decides re-login by error code, not by text', () => {
    const login = failedRefresh<string, 'player'>({
      requested: ['player'], failures: [refreshFailureFromError(new ProviderError('authentication', '甲', false), 'player')],
    });
    const offline = failedRefresh<string, 'player'>({
      requested: ['player'], failures: [refreshFailureFromError(new ProviderError('network', '乙', true), 'player')],
    });
    expect(refreshNeedsLogin(login)).toBe(true);
    expect(refreshNeedsLogin(offline)).toBe(false);
  });

  it('offers the concrete failed items for a retry', () => {
    const partial = partialRefresh<string, 'player' | 'scores'>({
      value: 'data',
      metadata: snapshotMetadataOf(source),
      requested: ['player', 'scores'],
      completed: ['player'],
      failures: [
        refreshFailureFromError(new ProviderError('network', '离线', true), 'scores'),
        refreshFailureFromError(new ProviderError('authentication', '登录失效', false), 'player'),
      ],
    });
    expect(refreshRetryTargets(partial)).toEqual(['scores']);
  });
});

describe('refresh status and snapshot time', () => {
  it('advances the fetch time only when the whole requested scope completed', () => {
    const success = successfulRefresh({
      value: 'data', metadata: snapshotMetadataOf(source), requested: ['player', 'scores'],
    });
    expect(success.status).toBe('success');
    expect(refreshSucceeded(success)).toBe(true);
    expect(refreshedFetchedAt(success, previousFetchedAt)).toBe('2026-07-01T00:00:00.000Z');

    const partial = partialRefresh({
      value: 'data',
      metadata: snapshotMetadataOf(source),
      requested: ['player', 'scores'],
      completed: ['player'],
      failures: [refreshFailureFromError(new Error('offline'), 'scores')],
    });
    expect(partial.status).toBe('partial');
    expect(refreshSucceeded(partial)).toBe(false);
    expect(refreshedFetchedAt(partial, previousFetchedAt)).toBe(previousFetchedAt);
  });

  it('keeps the old snapshot time and the usable old snapshot when every item failed', () => {
    const failed = failedRefresh({
      value: '旧快照',
      metadata: snapshotMetadataOf(source),
      requested: ['player'],
      failures: [refreshFailureFromError(new Error('offline'), 'player')],
    });
    expect(failed.status).toBe('failed');
    expect(failed.value).toBe('旧快照');
    expect(failed.metadata?.fetchedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(refreshedFetchedAt(failed, previousFetchedAt)).toBe(previousFetchedAt);
    expect(refreshSucceeded(failed)).toBe(false);

    const firstFailure = failedRefresh<string, 'player'>({
      requested: ['player'], failures: [refreshFailureFromError(new Error('offline'), 'player')],
    });
    expect(firstFailure.value).toBeNull();
    expect(firstFailure.metadata).toBeNull();
  });

  it('does not treat a cancelled or no-op refresh as a success with a new time', () => {
    const cancelled = cancelledRefresh<string>(['player']);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.value).toBeNull();
    expect(cancelled.metadata).toBeNull();
    expect(refreshedFetchedAt(cancelled, previousFetchedAt)).toBe(previousFetchedAt);

    const noop = noopRefresh({ value: 'data', metadata: snapshotMetadataOf(source) });
    expect(noop.status).toBe('noop');
    expect(noop.requested).toEqual([]);
    expect(noop.failures).toEqual([]);
    expect(refreshedFetchedAt(noop, previousFetchedAt)).toBe('2026-07-01T00:00:00.000Z');
  });

  it('refuses to build a success with failures or a partial without any failure', () => {
    expect(() => successfulRefresh({
      value: 'data', metadata: snapshotMetadataOf(source), requested: ['player'],
      completed: ['player'],
    })).not.toThrow();
    expect(() => partialRefresh({
      value: 'data', metadata: snapshotMetadataOf(source), requested: ['player'], completed: ['player'], failures: [],
    })).toThrow('失败项');
    expect(() => failedRefresh({ requested: ['player'], metadata: snapshotMetadataOf(source) })).toThrow('快照元数据');
    expect(() => successfulRefresh({
      value: 'data', metadata: snapshotMetadataOf(source), requested: ['player'], completed: ['scores'],
    })).toThrow('请求范围');
  });
});
