import Storage from 'expo-sqlite/kv-store';

/** 各 storage 模块共用的键值存储接口（expo-sqlite/kv-store 及测试替身同构）。 */
export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

export type DemoAccountProfile = {
  id: string;
  displayName: string;
};

type StoredDemoAccountV1 = {
  version: 1;
  account: DemoAccountProfile;
};

/**
 * 单账号示例 store 公共工厂（chunithm/musedash/phigros 同构）：
 * load 解析失败即清理坏数据返回 null；save 校验测试账号 ID 与非空名称。
 */
export function createDemoAccountStore(input: {
  storeKey: string;
  isTestAccountId: (id: string) => boolean;
  saveErrorMessage: string;
}) {
  const { storeKey, isTestAccountId, saveErrorMessage } = input;

  const parse = (value: unknown): DemoAccountProfile | null => {
    if (!value || typeof value !== 'object') return null;
    const raw = value as { version?: unknown; account?: unknown };
    if (raw.version !== 1 || !raw.account || typeof raw.account !== 'object') return null;
    const account = raw.account as { id?: unknown; displayName?: unknown };
    if (typeof account.id !== 'string' || !isTestAccountId(account.id)) return null;
    const displayName = typeof account.displayName === 'string' ? account.displayName.trim() : '';
    return displayName ? { id: account.id, displayName } : null;
  };

  const Store = class DemoAccountStore {
    constructor(private readonly storage: KeyValueStore = Storage) {}

    async load(): Promise<DemoAccountProfile | null> {
      try {
        const raw = await this.storage.getItem(storeKey);
        return raw ? parse(JSON.parse(raw)) : null;
      } catch {
        await this.storage.removeItem(storeKey).catch(() => undefined);
        return null;
      }
    }

    async save(profile: DemoAccountProfile): Promise<void> {
      const displayName = profile.displayName.trim();
      if (!isTestAccountId(profile.id) || !displayName) {
        throw new Error(saveErrorMessage);
      }
      const value: StoredDemoAccountV1 = {
        version: 1,
        account: { id: profile.id, displayName },
      };
      await this.storage.setItem(storeKey, JSON.stringify(value));
    }

    async remove(): Promise<void> {
      await this.storage.removeItem(storeKey);
    }
  };

  return { parse, Store };
}
