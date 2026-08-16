import Storage from 'expo-sqlite/kv-store';
import type { KeyValueStore } from './create-demo-account-store';

export type { KeyValueStore };

/**
 * 偏好 store 实例的公开形态：
 * 全局单 key（S = void）时无参 load / 单参 save；按账号或游戏分 key 时带 scope 参数。
 */
export type PreferencesStoreInstance<P, S> = {
  load: [S] extends [void] ? () => Promise<P> : (scope: S) => Promise<P>;
  save: [S] extends [void]
    ? (value: P) => Promise<void>
    : (scope: S, value: P) => Promise<void>;
};

export type CreatePreferencesStoreOptions<P, S> = {
  /** 固定存储 key，或按 scope（账号 ID / 游戏 ID 等）拼接 key 的构造器。 */
  storeKey: string | ((scope: S) => string);
  /** 指定 scope 下无数据（含坏数据回退）时使用的默认值。 */
  defaults: (scope: S) => P;
  /** 解析并校验存储 JSON（含 schemaVersion 迁移），坏结构返回默认值。 */
  parse: (value: unknown, scope: S) => P;
  /** 写入前的序列化值构造（含版本字段包装与归一化）；缺省原样存储。 */
  toStored?: (value: P, scope: S) => unknown;
  /** 读到坏 JSON 时是否清理对应 key；缺省清理。 */
  clearOnError?: boolean;
  /** 主 key 无数据时的一次性迁移钩子（如旧共享 key 迁移）；返回 null 表示无迁移。 */
  onMissing?: (context: {
    storage: KeyValueStore;
    scope: S;
    save: (value: P) => Promise<void>;
  }) => Promise<P | null>;
};

/**
 * 偏好持久化 store 公共工厂：收敛「load 解析 + 坏数据静默回退（可选清 key）+ save 序列化」同构骨架。
 * 各份的字段校验与 schemaVersion 迁移语义由 defaults / parse / toStored 注入，逐份保持不变。
 */
export function createPreferencesStore<P, S = void>(options: CreatePreferencesStoreOptions<P, S>) {
  const clearOnError = options.clearOnError ?? true;

  const keyOf = (scope: S): string => (
    typeof options.storeKey === 'string' ? options.storeKey : options.storeKey(scope)
  );

  const toStored = (value: P, scope: S): unknown => (
    options.toStored ? options.toStored(value, scope) : value
  );

  const loadPreferences = async (storage: KeyValueStore, scope: S): Promise<P> => {
    const key = keyOf(scope);
    try {
      const raw = await storage.getItem(key);
      if (raw) return options.parse(JSON.parse(raw), scope);
      if (options.onMissing) {
        const migrated = await options.onMissing({
          storage,
          scope,
          save: (value: P) => savePreferences(storage, scope, value),
        });
        if (migrated !== null) return migrated;
      }
      return options.defaults(scope);
    } catch {
      if (clearOnError) await storage.removeItem(key).catch(() => undefined);
      return options.defaults(scope);
    }
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
