import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindLxnsAccount } from '@/services/lxns-account-binding';
import { SecureSessionStore } from '@/storage/secure-session-store';
import type { ChunithmPersonalSnapshot } from '@/domain/chunithm-personal';

const mocks = vi.hoisted(() => {
  const index = new Map<string, string>();
  return {
    index,
    secrets: new Map<string, string>(),
    afterIndexWrite: undefined as undefined | (() => void),
    afterSecretDelete: undefined as undefined | (() => void),
    getPlayer: vi.fn(), getRecords: vi.fn(), getSnapshot: vi.fn(), getSession: vi.fn(),
    saveResource: vi.fn(),
    storage: {
      getItem: async (key: string) => index.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        index.set(key, value);
        mocks.afterIndexWrite?.();
      },
      removeItem: async (key: string) => { index.delete(key); },
    },
  };
});
vi.mock('@/storage/key-value-storage', () => ({ default: mocks.storage }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mocks.secrets.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { mocks.secrets.set(key, value); },
  deleteItemAsync: async (key: string) => { mocks.secrets.delete(key); mocks.afterSecretDelete?.(); },
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));
vi.mock('@/providers/lxns-score-provider', () => ({ LxnsScoreProvider: class {
  getOptionalPlayer = mocks.getPlayer; getOptionalRecords = mocks.getRecords; getSession = mocks.getSession;
} }));
vi.mock('@/providers/chunithm-score-provider', () => ({ ChunithmScoreProvider: class {
  getSnapshot = mocks.getSnapshot; getSession = mocks.getSession;
} }));
vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {
  saveResource = mocks.saveResource;
} }));
vi.mock('@/services/runtime-diagnostics-recorder', () => ({ recordRuntimeError: vi.fn(), recordRuntimeDiagnostic: vi.fn() }));

const session = { mode: 'lxns-oauth', accessToken: 'access', refreshToken: 'refresh',
  expiresAt: Date.now() + 900_000, persistable: true } as const;
const player = { id: '123', displayName: '舞萌玩家', rating: 15000 };
const snapshot: ChunithmPersonalSnapshot = {
  player: null, scores: [], bests: { bests: [], selections: [], new_bests: [] },
  source: { kind: 'lxns', label: '落雪咖啡屋', updatedAt: '2026-01-01T00:00:00Z', isStale: false },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const restored = () => new SecureSessionStore(mocks.storage).loadVault();

beforeEach(() => {
  vi.resetAllMocks(); mocks.index.clear(); mocks.secrets.clear();
  mocks.afterIndexWrite = undefined; mocks.afterSecretDelete = undefined;
  mocks.getPlayer.mockResolvedValue(player); mocks.getRecords.mockResolvedValue([]);
  mocks.getSnapshot.mockResolvedValue(snapshot); mocks.getSession.mockReturnValue(session);
  mocks.saveResource.mockImplementation(async (_key, _schema, _updatedAt, _value, assertCurrent) => assertCurrent?.());
});

describe('LXNS 绑定取消与提交边界', () => {
  it('预取消不验证或保存账号', async () => {
    const controller = new AbortController(); const reason = new Error('cancelled'); controller.abort(reason);
    await expect(bindLxnsAccount({ gameId: 'maimai', session, signal: controller.signal })).rejects.toBe(reason);
    expect(mocks.getPlayer).not.toHaveBeenCalled(); expect(mocks.getRecords).not.toHaveBeenCalled();
    expect((await restored()).accounts).toEqual([]);
  });

  it.each(['maimai', 'chunithm'] as const)('拒绝 %s 验证期间取消后的迟到结果', async gameId => {
    const read = deferred<typeof player | ChunithmPersonalSnapshot>();
    (gameId === 'maimai' ? mocks.getPlayer : mocks.getSnapshot).mockReturnValueOnce(read.promise);
    const controller = new AbortController(); const reason = new Error('cancelled');
    const pending = bindLxnsAccount({ gameId, session, credentialId: 'lxns:shared', signal: controller.signal });
    const failed = expect(pending).rejects.toBe(reason);
    controller.abort(reason); read.resolve(gameId === 'maimai' ? player : snapshot); await failed;
    expect(gameId === 'maimai' ? mocks.getPlayer : mocks.getSnapshot).toHaveBeenCalledWith(controller.signal);
    if (gameId === 'maimai') expect(mocks.getRecords).toHaveBeenCalledWith(controller.signal);
    expect(mocks.saveResource).not.toHaveBeenCalled(); expect((await restored()).accounts).toEqual([]);
  });

  it('中二快照排队期间代次失效不会保存账号', async () => {
    let current = true;
    mocks.saveResource.mockImplementationOnce(async (_key, _schema, _updatedAt, _value, assertCurrent) => {
      current = false; assertCurrent();
    });
    await expect(bindLxnsAccount({ gameId: 'chunithm', session, credentialId: 'lxns:shared',
      assertCurrent: () => { if (!current) throw new Error('stale'); } })).rejects.toMatchObject({ code: 'local_commit' });
    expect((await restored()).accounts).toEqual([]);
  });

  it('索引提交期间取消恢复同 ID 原绑定及原凭据', async () => {
    const original = await bindLxnsAccount({ gameId: 'maimai', session, credentialId: 'lxns:shared' });
    const baseline = await restored(); const controller = new AbortController(); const reason = new Error('cancelled');
    mocks.getSession.mockReturnValue({ ...session, accessToken: 'next-access', refreshToken: 'next-refresh' });
    mocks.afterIndexWrite = () => { mocks.afterIndexWrite = undefined; controller.abort(reason); };
    await expect(bindLxnsAccount({ gameId: 'maimai', session, credentialId: original.credentialId,
      signal: controller.signal })).rejects.toBe(reason);
    expect(await restored()).toEqual(baseline);
  });

  it('索引提交完成后的退出保留新绑定与凭据', async () => {
    await bindLxnsAccount({ gameId: 'maimai', session, credentialId: 'lxns:shared' });
    const controller = new AbortController(); const reason = new Error('cancelled');
    const next = { ...session, accessToken: 'next-access', refreshToken: 'next-refresh' };
    mocks.getSession.mockReturnValue(next);
    mocks.afterSecretDelete = () => { mocks.afterSecretDelete = undefined; controller.abort(reason); };
    await expect(bindLxnsAccount({ gameId: 'maimai', session, credentialId: 'lxns:shared',
      signal: controller.signal })).rejects.toBe(reason);
    const vault = await restored();
    expect(vault.accounts).toHaveLength(1); expect(vault.activeAccountId).toBe(vault.accounts[0].id);
    expect(vault.credentials[0].session).toEqual(next);
  });

  it.each(['maimai', 'chunithm'] as const)('成功绑定 %s 并复用共享凭据', async gameId => {
    const controller = new AbortController();
    const result = await bindLxnsAccount({ gameId, session, credentialId: 'lxns:shared', signal: controller.signal });
    const vault = await restored();
    expect(vault.activeAccountId).toBe(result.account.id); expect(vault.accounts[0].gameId).toBe(gameId);
    expect(vault.credentials[0]).toMatchObject({ id: 'lxns:shared', session });
    if (gameId === 'chunithm') expect(mocks.saveResource).toHaveBeenCalledWith(
      expect.any(String), expect.any(Number), snapshot.source.updatedAt, snapshot, expect.any(Function));
  });
});
