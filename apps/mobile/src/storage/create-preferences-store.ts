import Storage from '@/storage/key-value-storage';
import type { KeyValueStore } from './create-demo-account-store';

export type { KeyValueStore };

export type PreferencesStoreInstance<P, S> = {
  load: [S] extends [void] ? () => Promise<P> : (scope: S) => Promise<P>;
  save: [S] extends [void]
    ? (value: P) => Promise<void>
    : (scope: S, value: P) => Promise<void>;
};

export type CreatePreferencesStoreOptions<P, S> = {
  storeKey: string | ((scope: S) => string);
  defaults: (scope: S) => P;
  parse: (value: unknown, scope: S) => P;
  toStored?: (value: P, scope: S) => unknown;
};

export function createPreferencesStore<P, S = void>(options: CreatePreferencesStoreOptions<P, S>) {
  const keyOf = (scope: S): string => (
    typeof options.storeKey === 'string' ? options.storeKey : options.storeKey(scope)
  );

  const toStored = (value: P, scope: S): unknown => (
    options.toStored ? options.toStored(value, scope) : value
  );

  const loadPreferences = async (storage: KeyValueStore, scope: S): Promise<P> => {
    const key = keyOf(scope);
    const raw = await storage.getItem(key);
    if (raw === null) return options.defaults(scope);
    let value: P;
    try {
      return options.parse(JSON.parse(raw), scope);
    } catch {
      value = options.defaults(scope);
    }
    await savePreferences(storage, scope, value);
    return value;
  };

  const savePreferences = async (
    storage: KeyValueStore,
    scope: S,
    value: P,
  ): Promise<void> => {
    await storage.setItem(keyOf(scope), JSON.stringify(toStored(value, scope)));
  };

  class PreferencesStore {
    constructor(private readonly storage: KeyValueStore = Storage) {}

    async load(...args: [] | [scope: S]): Promise<P> {
      return loadPreferences(this.storage, args[0] as S);
    }

    async save(...args: [value: P] | [scope: S, value: P]): Promise<void> {
      if (args.length === 1) {
        await savePreferences(this.storage, undefined as S, args[0] as P);
        return;
      }
      await savePreferences(this.storage, args[0] as S, args[1] as P);
    }
  }

  return {
    Store: PreferencesStore as unknown as new (
      storage?: KeyValueStore,
    ) => PreferencesStoreInstance<P, S>,
    load: loadPreferences,
    save: savePreferences,
  };
}
