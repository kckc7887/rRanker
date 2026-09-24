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

/** 解析器发现版本或顶层结构无法识别。loadAccountDirectory 会改写成带原文的错误。 */
export class AccountDirectoryEnvelopeError extends Error {
  readonly name = 'AccountDirectoryEnvelopeError';

  constructor(readonly reason: 'unsupported-version' | 'invalid-structure') {
    super(reason === 'unsupported-version' ? '账号目录版本无法识别' : '账号目录结构无法识别');
  }
}

/** 未知版本或顶层结构错误。原键保留，副本写在 unrecognized 键上，后续写入不得覆盖原键。 */
export class AccountDirectoryUnrecognizedError extends Error {
  readonly name = 'AccountDirectoryUnrecognizedError';

  constructor(
    readonly storeKey: string,
    readonly preservedRaw: string,
    readonly reason: 'unsupported-version' | 'invalid-structure',
  ) {
    super(reason === 'unsupported-version' ? `账号目录版本无法识别：${storeKey}` : `账号目录结构无法识别：${storeKey}`);
  }
}

export function accountDirectoryCorruptKey(storeKey: string): string {
  return `${storeKey}.corrupt`;
}

export function accountDirectoryUnrecognizedKey(storeKey: string): string {
  return `${storeKey}.unrecognized`;
}

/** v1 列表信封。坏条目由各解析器跳过；版本或 accounts 不是数组时抛出信封错误。 */
export function assertAccountListEnvelope(value: unknown): { version: 1; accounts: unknown[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AccountDirectoryEnvelopeError('invalid-structure');
  }
  const raw = value as { version?: unknown; accounts?: unknown };
  if (typeof raw.version === 'number' && raw.version !== 1) {
    throw new AccountDirectoryEnvelopeError('unsupported-version');
  }
  if (raw.version !== 1 || !Array.isArray(raw.accounts)) {
    throw new AccountDirectoryEnvelopeError('invalid-structure');
  }
  return { version: 1, accounts: raw.accounts };
}

async function preserveAccountDirectoryCopy(storage: KeyValueStore, key: string, raw: string): Promise<void> {
  try {
    await storage.setItem(key, raw);
  } catch {
    // 副本写失败时原键仍然保留。
  }
}

/**
 * 读取账号目录原文。键不存在时返回 empty。
 * I/O 失败不删除原键。JSON 无法解析时保留原文并另存 corrupt 副本。
 * 未知版本或顶层结构错误时保留原文并另存 unrecognized 副本，不把它当成空目录。
 * 解析函数返回的空列表或 null 只表示结构可识别但没有账号。
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
    if (cause instanceof AccountDirectoryEnvelopeError) {
      await preserveAccountDirectoryCopy(storage, accountDirectoryUnrecognizedKey(storeKey), raw);
      throw new AccountDirectoryUnrecognizedError(storeKey, raw, cause.reason);
    }
    await preserveAccountDirectoryCopy(storage, accountDirectoryCorruptKey(storeKey), raw);
    throw new AccountDirectoryCorruptError(storeKey, raw, { cause });
  }
}

/** 读取损坏或无法识别时保留的原文。没有副本时返回 null。 */
export async function readPreservedAccountDirectory(
  storage: KeyValueStore,
  storeKey: string,
): Promise<string | null> {
  return (await storage.getItem(accountDirectoryUnrecognizedKey(storeKey)))
    ?? (await storage.getItem(accountDirectoryCorruptKey(storeKey)));
}

/**
 * 只有重新解析通过才写回原键。未知版本不会自动迁成空的 v1。
 * 解析失败时原键保持不动。
 */
export async function restoreAccountDirectory<T>(
  storage: KeyValueStore,
  storeKey: string,
  raw: string,
  parse: (value: unknown) => T,
): Promise<T> {
  let parsed: T;
  try {
    parsed = parse(JSON.parse(raw));
  } catch (cause) {
    const reason = cause instanceof AccountDirectoryEnvelopeError ? cause.reason : 'invalid-structure';
    throw new AccountDirectoryUnrecognizedError(storeKey, raw, reason);
  }
  await storage.setItem(storeKey, raw);
  return parsed;
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
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new AccountDirectoryEnvelopeError('invalid-structure');
    }
    const raw = value as { version?: unknown; account?: unknown };
    if (typeof raw.version === 'number' && raw.version !== 1) {
      throw new AccountDirectoryEnvelopeError('unsupported-version');
    }
    if (raw.version !== 1 || !raw.account || typeof raw.account !== 'object' || Array.isArray(raw.account)) {
      throw new AccountDirectoryEnvelopeError('invalid-structure');
    }
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
      await this.load();
      const value: StoredDemoAccountV1 = {
        version: 1,
        account: { id: profile.id, displayName },
      };
      await this.storage.setItem(storeKey, JSON.stringify(value));
    }

    async remove(): Promise<void> {
      await this.load();
      await this.storage.removeItem(storeKey);
    }
  };

  return { parse, Store };
}
