import * as SecureStore from 'expo-secure-store';
import Storage from '@/storage/key-value-storage';
import { LargeSecureValueStore } from '@/storage/large-secure-value-store';
import { enqueueKeyMutation } from '@/storage/create-account-list-store';
import { SessionPersistenceError } from '@/domain/session-vault';

const ACCOUNT_KEY_V1 = 'rranker.scorehub.account.v1';
const ACCOUNT_KEY_V2 = 'rranker.scorehub.account.v2';
const ACCOUNT_INDEX_KEY = 'rranker.scorehub.accounts.v3';
const LEGACY_ACCOUNT_KEYS = [ACCOUNT_KEY_V2, ACCOUNT_KEY_V1] as const;

/** 兼容旧调用：当前 active 账号的扁平视图。 */
export type ScoreHubAccountState = {
  friendCode: string;
  hasCabinetBound: boolean;
  token?: string;
};

export type ScoreHubAccountEntry = {
  friendCode: string;
  token: string;
  hasCabinetBound: boolean;
  updatedAt: number;
};

export type ScoreHubAccountsState = {
  activeFriendCode: string;
  accounts: Record<string, ScoreHubAccountEntry>;
};

type StoredScoreHubAccountEntry = Omit<ScoreHubAccountEntry, 'token'> & {
  tokenRef: string;
};

type ScoreHubAccountIndex = {
  version: 3;
  activeFriendCode: string;
  accounts: Record<string, StoredScoreHubAccountEntry>;
};

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

const EMPTY_ALL: ScoreHubAccountsState = {
  activeFriendCode: '',
  accounts: {},
};

function activeView(state: ScoreHubAccountsState): ScoreHubAccountState {
  const code = state.activeFriendCode.trim();
  const entry = code ? state.accounts[code] : undefined;
  if (!entry) {
    return { friendCode: code, hasCabinetBound: false };
  }
  return {
    friendCode: entry.friendCode,
    hasCabinetBound: entry.hasCabinetBound,
    token: entry.token,
  };
}

function resolveActiveFriendCode(requested: unknown, accounts: Record<string, unknown>, keepMissing = false): string {
  const code = typeof requested === 'string' ? requested.trim() : '';
  return code && accounts[code] ? code : (Object.keys(accounts)[0] ?? (keepMissing ? code : ''));
}

function parseIndex(raw: string): ScoreHubAccountIndex | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ScoreHubAccountIndex>;
    if (parsed.version !== 3 || typeof parsed.activeFriendCode !== 'string'
      || !parsed.accounts || typeof parsed.accounts !== 'object' || Array.isArray(parsed.accounts)) {
      return null;
    }
    const accounts: Record<string, StoredScoreHubAccountEntry> = {};
    for (const [key, value] of Object.entries(parsed.accounts)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const friendCode = typeof value.friendCode === 'string'
        ? value.friendCode.trim()
        : key.trim();
      if (!friendCode || accounts[friendCode] || typeof value.tokenRef !== 'string' || !value.tokenRef) return null;
      accounts[friendCode] = {
        friendCode,
        tokenRef: value.tokenRef,
        hasCabinetBound: value.hasCabinetBound === true,
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
      };
    }
    return {
      version: 3,
      activeFriendCode: resolveActiveFriendCode(parsed.activeFriendCode, accounts, true),
      accounts,
    };
  } catch {
    return null;
  }
}

function parseV2(raw: string): ScoreHubAccountsState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ScoreHubAccountsState>;
    const accounts: Record<string, ScoreHubAccountEntry> = {};
    if (typeof parsed.activeFriendCode !== 'string'
      || !parsed.accounts || typeof parsed.accounts !== 'object' || Array.isArray(parsed.accounts)) return null;
    if (parsed.accounts) {
      for (const [key, value] of Object.entries(parsed.accounts)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const friendCode = typeof value.friendCode === 'string' ? value.friendCode.trim() : key.trim();
        const token = typeof value.token === 'string' ? value.token : '';
        if (!friendCode || !token || accounts[friendCode]) return null;
        accounts[friendCode] = {
          friendCode,
          token,
          hasCabinetBound: value.hasCabinetBound === true,
          updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
        };
      }
    }
    return { activeFriendCode: resolveActiveFriendCode(parsed.activeFriendCode, accounts), accounts };
  } catch {
    return null;
  }
}

function parseV1(raw: string): ScoreHubAccountsState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ScoreHubAccountState>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.friendCode !== 'string'
      || (parsed.token !== undefined && typeof parsed.token !== 'string')) return null;
    const friendCode = typeof parsed.friendCode === 'string' ? parsed.friendCode.trim() : '';
    const token = typeof parsed.token === 'string' && parsed.token ? parsed.token : '';
    if (!friendCode || !token) {
      return { activeFriendCode: friendCode, accounts: {} };
    }
    return {
      activeFriendCode: friendCode,
      accounts: {
        [friendCode]: {
          friendCode,
          token,
          hasCabinetBound: parsed.hasCabinetBound === true,
          updatedAt: Date.now(),
        },
      },
    };
  } catch {
    return null;
  }
}

async function deleteLegacyAccountKeys(): Promise<void> {
  for (const key of LEGACY_ACCOUNT_KEYS) {
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
  }
}

export class ScoreHubAccountStore {
  private readonly indexIo: KeyValueStore;
  private readonly credentialIo: Pick<LargeSecureValueStore, 'read' | 'write' | 'delete' | 'createReference'>;
  constructor(
    private readonly storage: KeyValueStore = Storage,
    secrets = new LargeSecureValueStore(),
  ) {
    const io = async <T>(code: SessionPersistenceError['code'], operation: () => Promise<T>): Promise<T> => {
      try { return await operation(); } catch (cause) {
        if (cause instanceof SessionPersistenceError) throw cause;
        throw new SessionPersistenceError(code, { cause });
      }
    };
    this.indexIo = {
      getItem: key => io('local_commit', () => storage.getItem(key)),
      setItem: (key, value) => io('local_commit', () => storage.setItem(key, value)),
      removeItem: key => io('local_commit', () => storage.removeItem(key)),
    };
    this.credentialIo = {
      read: ref => io('credential_storage', () => secrets.read(ref)),
      write: (ref, value) => io('credential_storage', () => secrets.write(ref, value)),
      delete: ref => io('credential_storage', () => secrets.delete(ref)),
      createReference: namespace => {
        try { return secrets.createReference(namespace); }
        catch (cause) { throw new SessionPersistenceError('credential_storage', { cause }); }
      },
    };
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    return enqueueKeyMutation(this.storage, ACCOUNT_INDEX_KEY, operation);
  }

  private parseExistingIndex(raw: string): ScoreHubAccountIndex {
    const parsed = parseIndex(raw);
    if (!parsed) throw new SessionPersistenceError('local_commit');
    return parsed;
  }

  private async loadIndexedState(index: ScoreHubAccountIndex): Promise<ScoreHubAccountsState> {
    const accounts: Record<string, ScoreHubAccountEntry> = {};
    for (const item of Object.values(index.accounts)) {
      const token = await this.credentialIo.read(item.tokenRef);
      if (!token) throw new SessionPersistenceError('credential_storage');
      accounts[item.friendCode] = {
        friendCode: item.friendCode,
        token,
        hasCabinetBound: item.hasCabinetBound,
        updatedAt: item.updatedAt,
      };
    }
    return {
      activeFriendCode: resolveActiveFriendCode(index.activeFriendCode, accounts, true),
      accounts,
    };
  }

  private async migrateLegacyState(state: ScoreHubAccountsState): Promise<ScoreHubAccountsState | null> {
    try {
      await this.writeAll(state);
      const raw = await this.indexIo.getItem(ACCOUNT_INDEX_KEY);
      const index = raw !== null ? this.parseExistingIndex(raw) : null;
      const verified = index ? await this.loadIndexedState(index) : null;
      if (!verified || JSON.stringify(verified) !== JSON.stringify(state)) {
        return null;
      }
      return verified;
    } catch {
      return null;
    }
  }

  private async readAll(): Promise<ScoreHubAccountsState> {
    const indexRaw = await this.indexIo.getItem(ACCOUNT_INDEX_KEY);
    if (indexRaw !== null) {
      return this.loadIndexedState(this.parseExistingIndex(indexRaw));
    }

    const rawV2 = await this.readLegacyKey(ACCOUNT_KEY_V2);
    if (rawV2 !== null) {
      const parsed = parseV2(rawV2);
      if (parsed) {
        const migrated = await this.migrateLegacyState(parsed);
        if (migrated) {
          await deleteLegacyAccountKeys();
          return migrated;
        }
        return parsed;
      }
      throw new SessionPersistenceError('local_commit');
    }

    const rawV1 = await this.readLegacyKey(ACCOUNT_KEY_V1);
    if (rawV1 !== null) {
      const migrated = parseV1(rawV1);
      if (migrated) {
        const stored = await this.migrateLegacyState(migrated);
        if (stored) {
          await deleteLegacyAccountKeys();
          return stored;
        }
        return migrated;
      }
      throw new SessionPersistenceError('local_commit');
    }
    return { ...EMPTY_ALL, accounts: {} };
  }

  private async readLegacyKey(key: string): Promise<string | null> {
    try { return await SecureStore.getItemAsync(key); }
    catch (cause) { throw new SessionPersistenceError('credential_storage', { cause }); }
  }

  private async writeAll(state: ScoreHubAccountsState): Promise<void> {
    const currentRaw = await this.indexIo.getItem(ACCOUNT_INDEX_KEY);
    const current = currentRaw !== null ? this.parseExistingIndex(currentRaw) : null;
    const accounts: Record<string, StoredScoreHubAccountEntry> = {};
    const newSecretRefs: string[] = [];
    let indexWriteStarted = false;

    try {
      for (const entry of Object.values(state.accounts)) {
        const previous = current?.accounts[entry.friendCode];
        const previousToken = previous ? await this.credentialIo.read(previous.tokenRef) : null;
        if (previous && !previousToken) throw new SessionPersistenceError('credential_storage');
        let tokenRef = previous?.tokenRef;
        if (!tokenRef || previousToken !== entry.token) {
          tokenRef = this.credentialIo.createReference('scorehub-token');
          newSecretRefs.push(tokenRef);
          await this.credentialIo.write(tokenRef, entry.token);
          if (await this.credentialIo.read(tokenRef) !== entry.token) throw new SessionPersistenceError('credential_storage');
        }
        accounts[entry.friendCode] = {
          friendCode: entry.friendCode,
          tokenRef,
          hasCabinetBound: entry.hasCabinetBound,
          updatedAt: entry.updatedAt,
        };
      }
      const index: ScoreHubAccountIndex = {
        version: 3,
        activeFriendCode: state.activeFriendCode,
        accounts,
      };
      indexWriteStarted = true;
      await this.indexIo.setItem(ACCOUNT_INDEX_KEY, JSON.stringify(index));
    } catch (error) {
      await this.discardUnreferencedSecrets(newSecretRefs, indexWriteStarted).catch(() => undefined);
      throw error;
    }

    const retained = new Set(Object.values(accounts).map((item) => item.tokenRef));
    for (const previous of Object.values(current?.accounts ?? {})) {
      if (!retained.has(previous.tokenRef)) {
        await this.credentialIo.delete(previous.tokenRef).catch(() => undefined);
      }
    }
  }

  private async discardUnreferencedSecrets(secretRefs: readonly string[], indexWriteStarted: boolean): Promise<void> {
    let referenced = new Set<string>();
    if (indexWriteStarted) {
      // 写入抛错不代表尚未提交；读回失败时保留所有可能已被引用的凭据。
      const actualRaw = await this.indexIo.getItem(ACCOUNT_INDEX_KEY);
      const actual = actualRaw !== null ? this.parseExistingIndex(actualRaw) : null;
      referenced = new Set(Object.values(actual?.accounts ?? {}).map(item => item.tokenRef));
    }
    for (const secretRef of secretRefs) {
      if (!referenced.has(secretRef)) await this.credentialIo.delete(secretRef).catch(() => undefined);
    }
  }

  /** 当前 active 账号扁平视图（兼容旧调用）。 */
  async load(): Promise<ScoreHubAccountState> {
    return this.enqueue(async () => activeView(await this.readAll()));
  }

  async loadAll(): Promise<ScoreHubAccountsState> {
    return this.enqueue(() => this.readAll());
  }

  /** 列出所有已存 JWT 的好友码（按最近更新倒序）。 */
  async listWithToken(): Promise<ScoreHubAccountEntry[]> {
    return this.enqueue(async () => Object.values((await this.readAll()).accounts)
      .filter((entry) => Boolean(entry.token))
      .sort((a, b) => b.updatedAt - a.updatedAt));
  }

  async getByFriendCode(friendCode: string): Promise<ScoreHubAccountEntry | null> {
    const code = friendCode.trim();
    if (!code) return null;
    return this.enqueue(async () => (await this.readAll()).accounts[code] ?? null);
  }

  async select(friendCode: string): Promise<ScoreHubAccountState> {
    return this.enqueue(async () => {
      const state = await this.readAll();
      state.activeFriendCode = friendCode.trim();
      await this.writeAll(state);
      return activeView(state);
    });
  }

  /** 写入/更新某好友码条目，并设为 active。 */
  async upsert(partial: {
    friendCode: string;
    token?: string;
    hasCabinetBound?: boolean;
  }): Promise<ScoreHubAccountState> {
    return this.enqueue(() => this.upsertUnlocked(partial));
  }

  private async upsertUnlocked(partial: { friendCode: string; token?: string; hasCabinetBound?: boolean }): Promise<ScoreHubAccountState> {
    const friendCode = partial.friendCode.trim();
    const state = await this.readAll();
    const existing = friendCode ? state.accounts[friendCode] : undefined;
    const token = (typeof partial.token === 'string' && partial.token
      ? partial.token
      : existing?.token) ?? '';

    if (friendCode && token) {
      state.accounts[friendCode] = {
        friendCode,
        token,
        hasCabinetBound: typeof partial.hasCabinetBound === 'boolean'
          ? partial.hasCabinetBound
          : (existing?.hasCabinetBound === true),
        updatedAt: Date.now(),
      };
      state.activeFriendCode = friendCode;
    } else if (friendCode) {
      state.activeFriendCode = friendCode;
      if (existing && typeof partial.hasCabinetBound === 'boolean') {
        state.accounts[friendCode] = {
          ...existing,
          hasCabinetBound: partial.hasCabinetBound,
          updatedAt: Date.now(),
        };
      }
    }

    await this.writeAll(state);
    return activeView(state);
  }

  async save(state: ScoreHubAccountState): Promise<void> {
    await this.upsert({
      friendCode: state.friendCode,
      token: state.token,
      hasCabinetBound: state.hasCabinetBound,
    });
  }

  /** 兼容旧 API：更新 active（若带 friendCode 则切到该码）。 */
  async patch(partial: Partial<ScoreHubAccountState>): Promise<ScoreHubAccountState> {
    return this.enqueue(async () => {
      const current = activeView(await this.readAll());
      const friendCode = typeof partial.friendCode === 'string'
        ? partial.friendCode.trim()
        : current.friendCode;
      const token = partial.token !== undefined
        ? (partial.token || undefined)
        : current.token;
      const hasCabinetBound = typeof partial.hasCabinetBound === 'boolean'
        ? partial.hasCabinetBound
        : current.hasCabinetBound;

      return this.upsertUnlocked({ friendCode, token, hasCabinetBound });
    });
  }

  async clear(): Promise<void> {
    await this.enqueue(async () => {
      await this.readAll();
      await this.writeAll({ ...EMPTY_ALL, accounts: {} });
      await deleteLegacyAccountKeys();
    });
  }

  /** 删除指定好友码的本地 JWT 条目。 */
  async remove(friendCode: string): Promise<ScoreHubAccountsState> {
    return this.enqueue(async () => {
      const code = friendCode.trim();
      const state = await this.readAll();
      if (code && state.accounts[code]) delete state.accounts[code];
      if (state.activeFriendCode === code) state.activeFriendCode = Object.keys(state.accounts)[0] ?? '';
      await this.writeAll(state);
      return state;
    });
  }
}

export const scoreHubAccountStore = new ScoreHubAccountStore();
