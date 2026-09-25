import { describe, expect, it, vi } from 'vitest';

/**
 * 兼容外观检查：`@/state/session-store` 仍导出既有会话入口与动作，
 * 页面与 Hook 不需要改导入路径（协调器与 resolver 在内部装配）。
 */
vi.mock('@/state/session-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/state/session-store')>();
  return actual;
});

describe('会话 Store 的兼容外观', () => {
  it('继续导出既有会话入口与动作', async () => {
    const store = await import('@/state/session-store');
    for (const name of [
      'useSession',
      'UNBOUND_ACCOUNT_ID',
      'restoreSession',
      'applyLxnsTokenRotation',
      'applyOsuTokenRotation',
      'applyRizlineSessionRotation',
      'retryPendingRotationWrites',
      'pendingRotationWritesSnapshot',
      'resetPendingRotationWritesForTests',
    ] as const) {
      expect(store[name], name).toBeDefined();
    }
    const state = store.useSession.getState();
    for (const action of [
      'setSession',
      'upsertBoundAccount',
      'updateBoundAccountScore',
      'renameLocalAccount',
      'selectBoundAccount',
      'removeBoundAccount',
      'setOsuBinding',
      'setActiveProviderId',
      'setActiveGameId',
      'clearSession',
      'finishRestore',
      'failRestore',
    ] as const) {
      expect(typeof state[action], action).toBe('function');
    }
  }, 30_000);
});
