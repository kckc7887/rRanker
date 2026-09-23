import Storage from 'expo-sqlite/kv-store';

/** 各 storage 模块共用的键值存储接口（expo-sqlite/kv-store 及测试替身同构）。 */
export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

/** 存储层暂时读不到账号目录。原键保持不变，调用方可以重试。 */
export class AccountDirectoryReadError extends Error {
  readonly name = 'AccountDirectoryReadError';

  constructor(readonly storeKey: string, options?: { cause?: unknown }) {
    super(`账号目录读取失败：${storeKey}`);
    this.cause = options?.cause;
  }
}

/** 账号目录不是合法 JSON。原键保留，副本写在 corrupt 键上。 */
export class AccountDirectoryCorruptError extends Error {
  readonly name = 'AccountDirectoryCorruptError';

  constructor(readonly storeKey: string, readonly preservedRaw: string, options?: { cause?: unknown }) {
    super(`账号目录内容损坏：${storeKey}`);
    this.cause = options?.cause;
  }
}

export function accountDirectoryCorruptKey(storeKey: string): string {
  return `${storeKey}.corrupt`;
}

/**
 * 读取账号目录原文。I/O 失败不删除原键；JSON 无法解析时先保留副本再抛出损坏错误。
 * 解析函数返回的空列表或 null 表示结构可识别但没有账号，不是读取失败。
 */
export async function loadAccountDirectory<T>(
  storage: KeyValueStore,
  storeKey: string,
  parse: (value: unknown) => T,
  empty: T,
): Promise<T> {
  let raw: string | null;
  try {
    raw = await storage.getItem(storeKey);
  } catch (cause) {
    throw new AccountDirectoryReadError(storeKey, { cause });
  }
  if (!raw) return empty;
  try {
    return parse(JSON.parse(raw));
  } catch (cause) {
    try {
      await storage.setItem(accountDirectoryCorruptKey(storeKey), raw);
    } catch {
      // 副本写失败时原键仍然保留。
    }
    throw new AccountDirectoryCorruptError(storeKey, raw, { cause });
  }
}

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
 * 读取失败或内容损坏时保留原键并抛错；save 校验测试账号 ID 与非空名称。
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

    load(): Promise<DemoAccountProfile | null> {
      return loadAccountDirectory(this.storage, storeKey, parse, null);
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
