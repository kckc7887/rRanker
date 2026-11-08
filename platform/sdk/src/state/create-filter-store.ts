import { create } from 'zustand';

type SetterName<K extends string> = `set${Capitalize<K>}`;

export type FilterStoreSetters<Defaults extends Record<string, unknown>> = {
  [K in keyof Defaults & string as SetterName<K>]: (value: Defaults[K]) => void;
};

export type FilterStoreApi<Defaults extends Record<string, unknown>> = FilterStoreSetters<Defaults> & {
  clearFilters: () => void;
  reset: () => void;
};

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
