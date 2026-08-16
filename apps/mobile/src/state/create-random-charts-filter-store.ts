import { create } from 'zustand';

type SetterName<K extends string> = `set${Capitalize<K>}`;

/** 偏好持久化访问（load/save），与各游戏 random-charts preferences store 的子集同构。 */
export type RandomChartsPreferencesAccess<Preferences extends object> = {
  load: () => Promise<Preferences>;
  save: (preferences: Preferences) => Promise<unknown>;
};

/** 持久化随机歌曲筛选 store 公共形态：偏好字段 + 水合状态 + setter + clearFilters。 */
export type RandomChartsFilterStore<Preferences extends object> = Preferences & {
  hydrated: boolean;
  collapsed: boolean;
  hydrate: () => Promise<void>;
  setCollapsed: (value: boolean) => void;
} & {
  [K in keyof Preferences & string as SetterName<K>]: (value: Preferences[K]) => void;
} & {
  clearFilters: () => void;
};

/**
 * 各游戏随机歌曲筛选 store 的公共工厂：串行保存队列、水合前脏写保护、
 * clearFilters 仅重置 clearKeys；setter 命名恒为 `set${Capitalize(key)}`。
 */
export function createPersistedRandomChartsFilterStore<Preferences extends object>(input: {
  preferences: RandomChartsPreferencesAccess<Preferences>;
  defaults: () => Preferences;
  clearKeys: readonly (keyof Preferences & string)[];
}) {
  const { preferences, defaults, clearKeys } = input;
  let hydrationPromise: Promise<void> | null = null;
  let saveQueue: Promise<void> = Promise.resolve();
  let dirtyBeforeHydrate = false;

  return create<RandomChartsFilterStore<Preferences>>((set, get) => {
    const preferenceKeys = Object.keys(defaults()) as (keyof Preferences & string)[];
    const pickPreferences = (): Preferences => {
      const state = get() as unknown as Record<string, unknown>;
      return Object.fromEntries(preferenceKeys.map((key) => [key, state[key]])) as Preferences;
    };
    const persist = () => {
      const snapshot = pickPreferences();
      const operation = saveQueue.then(async () => {
        await get().hydrate();
        await preferences.save(snapshot);
      });
      saveQueue = operation.catch(() => undefined);
    };
    const update = (patch: Partial<Preferences>) => {
      if (!get().hydrated) dirtyBeforeHydrate = true;
      set(patch as Partial<RandomChartsFilterStore<Preferences>>);
      persist();
    };
    const clearPatch = () =>
      Object.fromEntries(
        clearKeys.map((key) => [key, defaults()[key]]),
      ) as Partial<Preferences>;

    const setters = {} as Record<string, (value: unknown) => void>;
    for (const key of preferenceKeys) {
      setters[`set${key.charAt(0).toUpperCase()}${key.slice(1)}`] = (value: unknown) =>
        update({ [key]: value } as Partial<Preferences>);
    }

    return {
      hydrated: false,
      collapsed: true,
      ...defaults(),
      hydrate: async () => {
        if (get().hydrated) return;
        hydrationPromise ??= preferences.load().then((stored) => {
          if (get().hydrated) return;
          set((dirtyBeforeHydrate ? { hydrated: true } : { hydrated: true, ...stored }) as Partial<RandomChartsFilterStore<Preferences>>);
        }).finally(() => {
          hydrationPromise = null;
        });
        await hydrationPromise;
      },
      ...setters,
      setCollapsed: (collapsed: boolean) => set({ collapsed } as Partial<RandomChartsFilterStore<Preferences>>),
      clearFilters: () => update(clearPatch()),
    } as RandomChartsFilterStore<Preferences>;
  });
}
