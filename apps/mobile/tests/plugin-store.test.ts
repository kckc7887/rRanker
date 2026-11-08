import { beforeEach, expect, it, vi } from 'vitest';
import type { BoundAccount } from '@rranker/sdk/account';
import type { GameAdapter, DataSourcePlugin, ToolPlugin } from '@rranker/sdk/plugins';

const game: GameAdapter = {
  kind: 'game', id: 'game.practice', title: 'Practice',
  games: [{ id: 'practice', title: 'Practice', icon: 1, profile: { ratingLabel: 'Score', ratingDigits: 0, bestSections: [] } }],
  parseDetailParams: (_, params) => params,
  parseLibraryTarget: target => target,
};
const source: DataSourcePlugin = {
  kind: 'provider', id: 'provider.practice', providerId: 'practice-source', title: 'Practice source',
  gameIds: ['practice'], detail: '', icon: 1, bindingKind: 'credentials',
};
const tool: ToolPlugin = {
  kind: 'tool', id: 'tool.practice', title: 'Practice tool', gameIds: ['practice'], tools: [], pages: { practice: () => null },
};
const account: BoundAccount = {
  id: 'practice:alice', gameId: 'practice', providerId: 'practice-source', displayName: 'Alice',
  scoreLabel: 'Score', scoreDisplay: '42', providerTitle: 'Practice source',
};

beforeEach(async () => {
  vi.resetModules();
  const registry = await import('@rranker/sdk/registry');
  registry.initializePlugins([game, source, tool]);
  registry.setDisabledPlugins([]);
  const { pluginPreferencesStore } = await import('@rranker/sdk/storage/plugin-preferences-store');
  vi.spyOn(pluginPreferencesStore, 'load').mockResolvedValue({ disabledPlugins: [] });
  vi.spyOn(pluginPreferencesStore, 'save').mockResolvedValue();
});

it('停用来源时保留账号和凭据，重新启用恢复原选择', async () => {
  const { usePluginStore } = await import('@rranker/sdk/state/plugin-store');
  const { useAccountStore, activeAccount } = await import('@rranker/sdk/state/account-store');
  const { isPluginAvailable } = await import('@rranker/sdk/registry');
  useAccountStore.getState().bindAccounts({ accounts: [account], credentialId: 'credential',
    session: { mode: 'practice', persistable: true, token: 'saved' }, activeAccountId: account.id });
  await usePluginStore.getState().setEnabled(source.id, false);
  expect(activeAccount(useAccountStore.getState())).toBeUndefined();
  expect(useAccountStore.getState().boundAccounts[0]?.displayName).toBe('Alice');
  expect(useAccountStore.getState().credentialsById.credential).toEqual({ mode: 'practice', persistable: true, token: 'saved' });
  expect(isPluginAvailable(tool.id, 'practice')).toBe(true);
  await usePluginStore.getState().setEnabled(source.id, true);
  expect(activeAccount(useAccountStore.getState())?.id).toBe(account.id);
});

it('停用适配器取消所属查询并阻止迟到结果，其他游戏查询保留', async () => {
  const { usePluginStore } = await import('@rranker/sdk/state/plugin-store');
  const { queryClient } = await import('@rranker/sdk/state/query-client');
  const { isPluginAvailable } = await import('@rranker/sdk/registry');
  let finish!: (value: string) => void;
  let aborted = false;
  const pending = queryClient.fetchQuery({ queryKey: ['practice-scores'], meta: { pluginId: game.id, gameId: 'practice' },
    queryFn: ({ signal }) => { signal.addEventListener('abort', () => { aborted = true; }); return new Promise<string>(resolve => { finish = resolve; }); } });
  const settled = pending.catch(() => undefined);
  queryClient.setQueryData(['another-game'], 'keep');
  await usePluginStore.getState().setEnabled(game.id, false);
  finish('late');
  await settled;
  expect(aborted).toBe(true);
  expect(queryClient.getQueryData(['practice-scores'])).toBeUndefined();
  expect(queryClient.getQueryData(['another-game'])).toBe('keep');
  expect(isPluginAvailable(source.id)).toBe(false);
  expect(isPluginAvailable(tool.id)).toBe(false);
  queryClient.clear();
});

it('设置写入失败保留启用状态，读取失败可重试', async () => {
  const { usePluginStore } = await import('@rranker/sdk/state/plugin-store');
  const { pluginPreferencesStore } = await import('@rranker/sdk/storage/plugin-preferences-store');
  const { isPluginAvailable } = await import('@rranker/sdk/registry');
  vi.mocked(pluginPreferencesStore.load).mockRejectedValueOnce(new Error('read failed'));
  await expect(usePluginStore.getState().hydrate()).rejects.toThrow('read failed');
  expect(isPluginAvailable(game.id)).toBe(true);
  await usePluginStore.getState().hydrate();
  vi.mocked(pluginPreferencesStore.save).mockRejectedValueOnce(new Error('disk full'));
  await expect(usePluginStore.getState().setEnabled(game.id, false)).rejects.toThrow('disk full');
  expect(usePluginStore.getState().disabledPlugins).toEqual([]);
  expect(isPluginAvailable(game.id)).toBe(true);
  await usePluginStore.getState().setEnabled(game.id, false);
  expect(isPluginAvailable(game.id)).toBe(false);
});


it('停用一个来源取消所属请求，同游戏另一来源账号与工具查询继续', async () => {
  const { initializePlugins } = await import('@rranker/sdk/registry');
  const otherSource = { ...source, id: 'provider.other', providerId: 'other-source' };
  initializePlugins([game, source, otherSource, tool]);
  const { usePluginStore } = await import('@rranker/sdk/state/plugin-store');
  const { useAccountStore } = await import('@rranker/sdk/state/account-store');
  const { queryClient } = await import('@rranker/sdk/state/query-client');
  const { captureBoundAccountWrites } = await import('@rranker/sdk/services/account-write-scope');
  const otherAccount = { ...account, id: 'another-player', providerId: otherSource.providerId };
  useAccountStore.getState().upsertBoundAccount(account);
  useAccountStore.getState().upsertBoundAccount(otherAccount);
  const assertOther = captureBoundAccountWrites(otherAccount.id);
  let ownSignal!: AbortSignal;
  let otherSignal!: AbortSignal;
  let finishOther!: (value: string) => void;
  const own = queryClient.fetchQuery({ queryKey: ['own-scores'], meta: { gameId: 'practice', sourcePluginId: source.id, accountId: account.id },
    queryFn: ({ signal }) => { ownSignal = signal; return new Promise<string>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))); } }).catch(() => undefined);
  const other = queryClient.fetchQuery({ queryKey: ['other-scores'], meta: { gameId: 'practice', sourcePluginId: otherSource.id, accountId: otherAccount.id },
    queryFn: ({ signal }) => { otherSignal = signal; return new Promise<string>(resolve => { finishOther = resolve; }); } });
  await queryClient.fetchQuery({ queryKey: ['practice-tool'], meta: { gameId: 'practice', pluginId: tool.id }, queryFn: () => 'tool data' });
  await usePluginStore.getState().setEnabled(source.id, false);
  await own;
  expect(ownSignal.aborted).toBe(true);
  expect(queryClient.getQueryData(['own-scores'])).toBeUndefined();
  expect(otherSignal.aborted).toBe(false);
  expect(assertOther).not.toThrow();
  finishOther('other data');
  await other;
  expect(queryClient.getQueryData(['other-scores'])).toBe('other data');
  expect(queryClient.getQueryData(['practice-tool'])).toBe('tool data');
  queryClient.clear();
});
