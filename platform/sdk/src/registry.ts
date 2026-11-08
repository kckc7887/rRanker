import { useSyncExternalStore } from 'react';
import type { DataSourcePlugin, GameAdapter, GameDefinition, GameId, GameModeFamily, Plugin, PluginId, ProviderId } from './plugins';
import { pluginHref } from './navigation';
import type { DetailParams } from './navigation';

let plugins: readonly Plugin[] = [];
const games = new Map<GameId, { game: GameDefinition; adapter: GameAdapter }>();
const providers = new Map<ProviderId, DataSourcePlugin>();
const families = new Map<string, GameModeFamily>();
const byId = new Map<PluginId, Plugin>();
let disabledPlugins = new Set<PluginId>();
let revision = 0;
const listeners = new Set<() => void>();

function notify() {
  revision += 1;
  for (const listener of listeners) listener();
}

export function initializePlugins(installed: readonly Plugin[]) {
  plugins = installed;
  games.clear();
  providers.clear();
  families.clear();
  byId.clear();
  for (const plugin of installed) {
    if (byId.has(plugin.id)) throw new Error(`插件 ID 重复：${plugin.id}`);
    byId.set(plugin.id, plugin);
    if (plugin.kind === 'game') {
      for (const game of plugin.games) {
        if (games.has(game.id)) throw new Error(`游戏 ID 重复：${game.id}`);
        games.set(game.id, { game, adapter: plugin });
      }
      for (const family of plugin.families ?? []) families.set(family.id, family);
    } else if (plugin.kind === 'provider') {
      if (providers.has(plugin.providerId)) throw new Error(`数据源 ID 重复：${plugin.providerId}`);
      providers.set(plugin.providerId, plugin);
    }
  }
  notify();
}

export function setDisabledPlugins(ids: Iterable<PluginId>) {
  const next = new Set(ids);
  if (next.size === disabledPlugins.size && [...next].every(id => disabledPlugins.has(id))) return;
  disabledPlugins = next;
  notify();
}

export function subscribePlugins(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getPluginRevision() { return revision; }
export function usePluginRevision() {
  return useSyncExternalStore(subscribePlugins, getPluginRevision, getPluginRevision);
}

export function getPlugins() { return plugins; }
export function getPlugin(id: PluginId) { return byId.get(id); }
export function getGameDefinitions() { return [...games.values()].map(({ game }) => game); }
export function getGameDefinition(id: GameId) { return games.get(id)?.game; }
export function getGameAdapter(id: GameId) { return games.get(id)?.adapter; }
export function getDataSource(id: ProviderId) { return providers.get(id); }
export function getDataSources(gameId?: GameId) {
  return [...providers.values()].filter(provider => gameId === undefined || provider.gameIds.includes(gameId));
}
export function getGameResourceSource(gameId: GameId) {
  return getDataSources(gameId).filter(source => source.createResources && isPluginAvailable(source.id, gameId))
    .sort((a, b) => (b.resourcePriority ?? 0) - (a.resourcePriority ?? 0) || a.id.localeCompare(b.id))[0];
}

export function resolveGameResources(gameId: GameId): unknown {
  return getGameResourceSource(gameId)?.createResources?.(gameId);
}

export function getGameFamilies() { return [...families.values()]; }
export function getGameFamily(id: string) { return families.get(id); }

export function isGameAvailable(gameId: GameId) {
  const adapter = games.get(gameId)?.adapter;
  return adapter !== undefined && !disabledPlugins.has(adapter.id);
}

export function isPluginEnabled(id: PluginId) {
  return byId.has(id) && !disabledPlugins.has(id);
}

export function isPluginAvailable(id: PluginId, gameId?: GameId) {
  const plugin = byId.get(id);
  if (!plugin || disabledPlugins.has(id)) return false;
  const gameIds = plugin.kind === 'game' ? plugin.games.map(game => game.id) : plugin.gameIds;
  const available = (id: GameId) => isGameAvailable(id) && (plugin.kind !== 'tool'
    || (plugin.requiredCapabilities?.[id] ?? []).every(capability => getGameAdapter(id)?.capabilities?.includes(capability)));
  return gameId === undefined ? gameIds.some(available)
    : gameIds.includes(gameId) && available(gameId);
}

export function getInstalledGameTools(gameId: GameId) {
  return plugins.flatMap(plugin => plugin.kind === 'tool'
    ? plugin.tools.filter(tool => tool.gameId === gameId).map(tool => ({
      ...tool,
      pluginId: plugin.id,
      href: pluginHref({ pluginId: plugin.id, pageId: tool.pageId, gameId }),
    })) : []).sort((a, b) => a.order - b.order);
}

export function getGameTools(gameId: GameId) {
  return getInstalledGameTools(gameId).filter(tool => isPluginAvailable(tool.pluginId, gameId));
}

export function gameToolHref(gameId: GameId, toolId: string, params?: DetailParams) {
  const tool = getGameTools(gameId).find(item => item.id === toolId);
  return tool ? pluginHref({ pluginId: tool.pluginId, pageId: tool.pageId, gameId, params }) : null;
}

export function gamePageHref(gameId: GameId, pageId: string, params?: DetailParams) {
  const plugin = plugins.find(item => item.kind === 'tool'
    && isPluginAvailable(item.id, gameId) && item.pages[pageId]);
  return plugin ? pluginHref({ pluginId: plugin.id, pageId, gameId, params }) : null;
}

export function getOverviewCards(gameId: GameId) {
  return plugins.flatMap(plugin => plugin.kind === 'tool' && isPluginAvailable(plugin.id, gameId)
    && plugin.overviewCards ? [plugin.overviewCards] : []);
}

export function getPluginPage(pluginId: PluginId, pageId: string, gameId?: GameId) {
  const plugin = byId.get(pluginId);
  return plugin?.kind === 'tool' && isPluginAvailable(pluginId, gameId) ? plugin.pages[pageId] : undefined;
}

export function getOverviewActions(gameId: GameId) {
  for (const plugin of plugins) {
    if (plugin.kind === 'tool' && isPluginAvailable(plugin.id, gameId) && plugin.overviewActions) return plugin.overviewActions;
  }
  return undefined;
}

export function getChartDownload(gameId: GameId) {
  for (const plugin of plugins) {
    if (plugin.kind !== 'tool' || !isPluginAvailable(plugin.id, gameId)) continue;
    const run = plugin.chartDownloads?.[gameId];
    if (run) return { pluginId: plugin.id, run };
  }
  return undefined;
}
