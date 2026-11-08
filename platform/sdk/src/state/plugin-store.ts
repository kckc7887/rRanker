import { create } from 'zustand';
import { getPlugin } from '@rranker/sdk/registry';
import { pluginPreferencesStore } from '@rranker/sdk/storage/plugin-preferences-store';
import { applyDisabledPlugins } from '@rranker/sdk/services/plugin-lifecycle';

type PluginState = {
  disabledPlugins: string[];
  hydrated: boolean;
  saving: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  setEnabled: (pluginId: string, enabled: boolean) => Promise<void>;
};

let hydration: Promise<void> | undefined;
let writes = Promise.resolve();
let pendingWrites = 0;

export const usePluginStore = create<PluginState>((set, get) => ({
  disabledPlugins: [], hydrated: false, saving: false, error: null,
  hydrate: () => {
    hydration ??= pluginPreferencesStore.load().then(async preferences => {
      await applyDisabledPlugins(preferences.disabledPlugins);
      set({ ...preferences, hydrated: true, error: null });
    }).catch((error: unknown) => {
      hydration = undefined;
      set({ error: '无法读取插件设置，请重试。' });
      throw error;
    });
    return hydration;
  },
  setEnabled: (pluginId, enabled) => {
    if (!getPlugin(pluginId)) return Promise.reject(new Error('插件尚未安装'));
    pendingWrites += 1;
    set({ saving: true });
    const operation = writes.then(async () => {
      await get().hydrate();
      const disabledPlugins = enabled ? get().disabledPlugins.filter(id => id !== pluginId)
        : [...new Set([...get().disabledPlugins, pluginId])];
      await pluginPreferencesStore.save({ disabledPlugins });
      set({ disabledPlugins, error: null });
      await applyDisabledPlugins(disabledPlugins);
    }).finally(() => {
      pendingWrites -= 1;
      set({ saving: pendingWrites > 0 });
    });
    writes = operation.catch(() => undefined);
    return operation;
  },
}));
