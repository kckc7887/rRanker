import { describe, expect, it } from 'vitest';
import type { DataSource } from '@/domain/models';
import { ProviderError } from '@/providers/errors';
import {
  cachedSnapshotSource,
  failedRefresh,
  refreshFailureFromError,
  refreshNeedsLogin,
  snapshotMetadataOf,
} from '@/domain/refresh-result';

const source: DataSource = {
  kind: 'lxns', label: '落雪咖啡屋', updatedAt: '2026-07-01T00:00:00.000Z', isStale: false,
};

describe('snapshot metadata', () => {
  it('records the original provider, fetch time and usable revision', () => {
    expect(snapshotMetadataOf(source, 'rev-2')).toEqual({
      provider: 'lxns', label: '落雪咖啡屋', fetchedAt: '2026-07-01T00:00:00.000Z', revision: 'rev-2',
    });
    expect(snapshotMetadataOf(source).revision).toBeNull();
  });


  it('keeps provider, label and fetch time when a snapshot is read from cache', () => {
    const cached = cachedSnapshotSource(source);
    expect(cached).toEqual({ ...source, isStale: true });
    expect(snapshotMetadataOf(cached)).toEqual(snapshotMetadataOf(source));
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

});
