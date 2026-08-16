import { create } from 'zustand';

type SetterName<K extends string> = `set${Capitalize<K>}`;

/** 由 defaults 字段生成的 `setXxx` 写入器。 */
export type FilterStoreSetters<Defaults extends Record<string, unknown>> = {
  [K in keyof Defaults & string as SetterName<K>]: (value: Defaults[K]) => void;
};

/** 简单筛选 store 公共形态：默认值 + 逐字段 setter + clearFilters + reset。 */
export type FilterStoreApi<Defaults extends Record<string, unknown>> = FilterStoreSetters<Defaults> & {
  clearFilters: () => void;
  reset: () => void;
};

/**
 * 各游戏 records/catalog 筛选 store 的公共工厂。
 * clearFilters 仅重置 clearKeys 列出的字段（各游戏对 collapsed/sort 等是否重置语义不同），
 * reset 恒定恢复 defaults 全量；setter 命名恒为 `set${Capitalize(key)}`。
 */
export function createFilterStore<Defaults extends Record<string, unknown>>(input: {
  defaults: Defaults;
  clearKeys: readonly (keyof Defaults & string)[];
}) {
  const { defaults, clearKeys } = input;
  type State = Defaults & FilterStoreApi<Defaults>;
  return create<State>((set) => {
    const patch = (partial: Record<string, unknown>) =>
      set(partial as Partial<State>);
    const setters = {} as Record<string, (value: unknown) => void>;
    for (const key of Object.keys(defaults)) {
      const setterName = `set${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      setters[setterName] = (value: unknown) => patch({ [key]: value });
    }
    const clearPatch = () =>
      Object.fromEntries(clearKeys.map((key) => [key, defaults[key]]));
    return {
      ...defaults,
      ...setters,
      clearFilters: () => patch(clearPatch()),
      reset: () => patch({ ...defaults }),
    } as State;
  });
}
