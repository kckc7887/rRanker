import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRizlineCached, refreshRizlineSnapshot } from '@/services/rizline-service';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { ProviderError } from '@/providers/errors';
import type { RizlineSession } from '@/providers/contracts';
import {
  refreshNeedsLogin,
  refreshRetryTargets,
  refreshSucceeded,
  refreshedFetchedAt,
} from '@/domain/refresh-result';
import { rizlineSave } from './fixtures/rizline';

const mocks = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  getSave: vi.fn(),
  loginWithPassword: vi.fn(),
  rotate: vi.fn(),
  isExpired: vi.fn((_token?: string) => false),
  hasPassword: vi.fn(async (_id?: string) => false),
  readPassword: vi.fn(async (_id?: string) => null as string | null),
  deletePassword: vi.fn(async (_id?: string) => undefined),
  sessionsByAccountId: {} as Record<string, RizlineSession>,
}));
vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {
  async getResource(key: string) { return mocks.values.get(key) ?? null; }
  async saveResource(key: string, _version: number, _time: string, value: unknown, assertCurrent?: () => void) { assertCurrent?.(); mocks.values.set(key, value); }
  async clearResources(keys: string[]) { keys.forEach(key => mocks.values.delete(key)); }
} }));
vi.mock('@/providers/rizline-provider', () => ({ RizlineProvider: class {
  getSave = mocks.getSave;
  loginWithPassword = mocks.loginWithPassword;
}, isRizlineTokenExpired: (token: string) => mocks.isExpired(token) }));
vi.mock('@/state/session-store', () => ({
  applyRizlineSessionRotation: mocks.rotate,
  useSession: { getState: () => ({ sessionsByAccountId: mocks.sessionsByAccountId }) },
}));
vi.mock('@/storage/rizline-password-store', () => ({
  hasRizlinePassword: (id: string) => mocks.hasPassword(id),
  readRizlinePassword: (id: string) => mocks.readPassword(id),
  deleteRizlinePassword: (id: string) => mocks.deletePassword(id),
}));

const session: RizlineSession = {
  mode: 'rizline', token: 'token', phone: '13800138000', deviceId: 'device', channelId: '1', persistable: true,
};
const account = 'rizline:official:user-a';
const signal = () => new AbortController().signal;

beforeEach(() => {
  invalidateResourceWrites('rizline');
  mocks.values.clear();
  mocks.sessionsByAccountId = {};
  mocks.getSave.mockReset();
  mocks.loginWithPassword.mockReset();
  mocks.rotate.mockReset();
  mocks.isExpired.mockReset();
  mocks.hasPassword.mockReset();
  mocks.readPassword.mockReset();
  mocks.getSave.mockResolvedValue(rizlineSave());
  mocks.isExpired.mockReturnValue(false);
  mocks.hasPassword.mockResolvedValue(false);
  mocks.readPassword.mockResolvedValue(null);
  mocks.rotate.mockResolvedValue(undefined);
});

describe('Rizline refresh results', () => {
  it('reports a completed refresh with the original provider and a new fetch time', async () => {
    const result = await refreshRizlineSnapshot(account, session, signal());

    expect(result.status).toBe('success');
    expect(refreshSucceeded(result)).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.requested).toEqual([account]);
    expect(result.completed).toEqual([account]);
    expect(result.value?.save.userId).toBe('user-a');
    expect(result.value?.source).toMatchObject({ kind: 'rizline-official', label: '官方账号', isStale: false });
    expect(refreshedFetchedAt(result, '2026-01-01T00:00:00.000Z')).toBe(result.metadata?.fetchedAt);
    expect(refreshedFetchedAt(result, '2026-01-01T00:00:00.000Z')).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps the old snapshot and its fetch time without calling it a success', async () => {
    await refreshRizlineSnapshot(account, session, signal());
    const cached = await loadRizlineCached(account);
    const cachedFetchedAt = cached!.source.updatedAt;
    mocks.getSave.mockRejectedValue(new Error('offline'));

    const result = await refreshRizlineSnapshot(account, session, signal());

    expect(result.status).toBe('failed');
    expect(refreshSucceeded(result)).toBe(false);
    expect(result.failures).toEqual([{ code: 'unknown', target: account, diagnostic: 'offline', retryable: true }]);
    expect(refreshNeedsLogin(result)).toBe(false);
    expect(refreshRetryTargets(result)).toEqual([account]);
    expect(result.value?.save.totalRks).toBe(99.1234);
    // 缓存读取保留原提供方与抓取时间，只用过期标记表达它来自本地。
    expect(result.value?.source).toMatchObject({
      kind: 'rizline-official', label: '官方账号', updatedAt: cachedFetchedAt, isStale: true,
    });
    expect(result.metadata?.fetchedAt).toBe(cachedFetchedAt);
    expect(refreshedFetchedAt(result, cachedFetchedAt)).toBe(cachedFetchedAt);
  });

  it('distinguishes an expired login from a network failure by error code', async () => {
    mocks.getSave.mockRejectedValue(new ProviderError('authentication', '会话已过期', false));

    const expired = await refreshRizlineSnapshot(account, session, signal());

    expect(expired.status).toBe('failed');
    expect(expired.value).toBeNull();
    expect(expired.metadata).toBeNull();
    expect(refreshNeedsLogin(expired)).toBe(true);
    // 需要重新登录的失败项不作为可重试项。
    expect(refreshRetryTargets(expired)).toEqual([]);

    mocks.getSave.mockReset();
    mocks.getSave.mockRejectedValue(new ProviderError('network', '网络连接失败', true));
    const offline = await refreshRizlineSnapshot(account, session, signal());

    expect(refreshNeedsLogin(offline)).toBe(false);
    expect(refreshRetryTargets(offline)).toEqual([account]);
  });

  it('reports cancellation instead of a failed refresh when the caller already cancelled', async () => {
    const controller = new AbortController();
    controller.abort(new Error('同步已取消'));

    const result = await refreshRizlineSnapshot(account, session, controller.signal);

    expect(result.status).toBe('cancelled');
    expect(result.value).toBeNull();
    expect(result.metadata).toBeNull();
    expect(result.failures).toEqual([]);
    expect(refreshedFetchedAt(result, '2026-01-01T00:00:00.000Z')).toBe('2026-01-01T00:00:00.000Z');
    expect(mocks.getSave).not.toHaveBeenCalled();
  });
});
