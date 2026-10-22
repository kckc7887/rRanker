import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogTestGameId } from '@/domain/bound-account';
import type { ProviderId } from '@/domain/game-bind-options';
import { clearBoundAccountData, demoAccountBinding } from '@/services/account-management';
import { loadOptionalBoundAccounts, restoreAppAccounts, retryFailedAccountSources } from '@/services/account-restoration';
import { useDebugStore } from '@/state/debug-store';
import { useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';

const storage = vi.hoisted(() => ({ values: new Map<string, string>(), unreadable: new Set<string>() }));
vi.mock('expo-sqlite/kv-store', () => ({ default: {
  getItem: async (key: string) => {
    if (storage.unreadable.has(key)) throw new Error('storage unavailable');
    return storage.values.get(key) ?? null;
  },
  setItem: async (key: string, value: string) => { storage.values.set(key, value); },
  removeItem: async (key: string) => { storage.values.delete(key); },
  getAllKeys: async () => [...storage.values.keys()],
} }));

const games: { gameId: CatalogTestGameId; providerId: ProviderId; scoreDisplay: string }[] = [
  { gameId: 'example', providerId: 'example-test', scoreDisplay: '19000' },
  { gameId: 'rizline', providerId: 'rizline-test', scoreDisplay: '0.0000' },
  { gameId: 'phira', providerId: 'phira-test', scoreDisplay: '19.00' },
  { gameId: 'adofai', providerId: 'adofai-test', scoreDisplay: '114514' },
  { gameId: 'majdata-net', providerId: 'majdata-net-test', scoreDisplay: '114514.0000%' },
  { gameId: 'osu-standard', providerId: 'osu-test', scoreDisplay: '40000' },
  { gameId: 'osu-mania', providerId: 'osu-test', scoreDisplay: '40000' },
  { gameId: 'osu-catch', providerId: 'osu-test', scoreDisplay: '40000' },
  { gameId: 'osu-taiko', providerId: 'osu-test', scoreDisplay: '40000' },
];

const removal = { submit: async (_label: string, action: () => Promise<unknown>) => { await action(); },
  cleanup: async (_label: string, action: () => Promise<unknown>) => { await action(); } };

async function saveDemo(gameId: CatalogTestGameId, providerId: ProviderId) {
  const binding = demoAccountBinding(providerId, gameId)!;
  const account = { ...binding.create(), displayName: `${gameId} 示例玩家` };
  const previousKeys = new Set(storage.values.keys());
  await binding.persist(account);
  return { account, savedKeys: [...storage.values.keys()].filter(key => !previousKeys.has(key)) };
}

beforeEach(() => {
  storage.values.clear(); storage.unreadable.clear();
  useSession.getState().finishRestore(null);
  useDebugStore.setState({ testAccountsEnabled: true, hydrated: true });
});
afterEach(() => { useSession.getState().finishRestore(null); });

describe('曲库示例账号', () => {
  it.each(games)('$gameId 保存后可恢复和选择，清除登录保留示例，删除仅移除该账号', async spec => {
    const { account } = await saveDemo(spec.gameId, spec.providerId);
    const otherSpec = games.find(game => game.gameId !== spec.gameId)!;
    const { account: other } = await saveDemo(otherSpec.gameId, otherSpec.providerId);
    await new SecureSessionStore().setActiveAccountId(account.id);

    await restoreAppAccounts();
    expect(useSession.getState()).toMatchObject({ restoreStatus: 'ready', activeAccountId: account.id,
      activeGameId: spec.gameId, activeProviderId: spec.providerId, session: null });
    expect(useSession.getState().boundAccounts.find(item => item.id === account.id)).toMatchObject({
      gameId: spec.gameId, displayName: account.displayName, scoreDisplay: spec.scoreDisplay, providerTitle: '示例账号',
    });
    useSession.getState().selectBoundAccount(other.id);
    expect(useSession.getState().activeAccountId).toBe(other.id);
    useSession.getState().selectBoundAccount(account.id);
    expect(useSession.getState().activeGameId).toBe(spec.gameId);

    useSession.getState().clearSession();
    expect(useSession.getState().boundAccounts.map(item => item.id)).toEqual(expect.arrayContaining([account.id, other.id]));
    await clearBoundAccountData(account, removal);
    useSession.getState().removeBoundAccount(account.id);
    await restoreAppAccounts();
    expect(useSession.getState().boundAccounts.map(item => item.id)).toEqual([other.id]);
  });

  it('osu! 某模式读取失败和恢复重试均保留其他模式，重试取得新名称且不会重复账号', async () => {
    const saved = [];
    for (const game of games.filter(spec => spec.providerId === 'osu-test')) saved.push(await saveDemo(game.gameId, game.providerId));
    await restoreAppAccounts();
    const failed = saved.find(item => item.account.gameId === 'osu-mania')!;
    failed.savedKeys.forEach(key => storage.unreadable.add(key));
    await restoreAppAccounts();
    expect(useSession.getState().boundAccounts).toHaveLength(4);
    for (const { account } of saved) expect(useSession.getState().boundAccounts.find(item => item.id === account.id)?.displayName).toBe(account.displayName);

    storage.unreadable.clear();
    await demoAccountBinding('osu-test', 'osu-mania')!.persist({ ...failed.account, displayName: '恢复后的 mania 玩家' });
    await retryFailedAccountSources();
    expect(useSession.getState().boundAccounts).toHaveLength(4);
    expect(useSession.getState().boundAccounts.find(item => item.id === failed.account.id)?.displayName).toBe('恢复后的 mania 玩家');
    for (const { account } of saved.filter(item => item !== failed)) {
      expect(useSession.getState().boundAccounts.find(item => item.id === account.id)?.displayName).toBe(account.displayName);
    }
  });

  it('osu! 失败模式的持久账号已删除时，恢复重试只移除对应模式', async () => {
    const saved = [];
    for (const game of games.filter(spec => spec.providerId === 'osu-test')) saved.push(await saveDemo(game.gameId, game.providerId));
    await restoreAppAccounts();
    const failed = saved.find(item => item.account.gameId === 'osu-catch')!;
    failed.savedKeys.forEach(key => storage.unreadable.add(key));
    await restoreAppAccounts();
    await clearBoundAccountData(failed.account, removal);
    storage.unreadable.clear();
    await retryFailedAccountSources();
    expect(useSession.getState().boundAccounts.map(item => item.id).sort()).toEqual(
      saved.filter(item => item !== failed).map(item => item.account.id).sort(),
    );
    expect((await loadOptionalBoundAccounts()).map(item => item.id).sort()).toEqual(
      useSession.getState().boundAccounts.map(item => item.id).sort(),
    );
  });
});
