import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { LargeSecureValueStore } from '@/storage/large-secure-value-store';

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

function parseIndex(raw: string): ScoreHubAccountIndex | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ScoreHubAccountIndex>;
    if (parsed.version !== 3 || !parsed.accounts || typeof parsed.accounts !== 'object') {
      return null;
    }
    const accounts: Record<string, StoredScoreHubAccountEntry> = {};
    for (const [key, value] of Object.entries(parsed.accounts)) {
      if (!value || typeof value !== 'object') continue;
      const friendCode = typeof value.friendCode === 'string'
        ? value.friendCode.trim()
        : key.trim();
      if (!friendCode || typeof value.tokenRef !== 'string' || !value.tokenRef) continue;
      accounts[friendCode] = {
        friendCode,
        tokenRef: value.tokenRef,
        hasCabinetBound: value.hasCabinetBound === true,
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
      };
    }
    const requestedActive = typeof parsed.activeFriendCode === 'string'
      ? parsed.activeFriendCode.trim()
      : '';
    return {
      version: 3,
      activeFriendCode: requestedActive && accounts[requestedActive]
        ? requestedActive
        : (Object.keys(accounts)[0] ?? requestedActive),
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
    if (parsed.accounts && typeof parsed.accounts === 'object') {
      for (const [key, value] of Object.entries(parsed.accounts)) {
        if (!value || typeof value !== 'object') continue;
        const friendCode = typeof value.friendCode === 'string' ? value.friendCode.trim() : key.trim();
        const token = typeof value.token === 'string' ? value.token : '';
        if (!friendCode || !token) continue;
        accounts[friendCode] = {
          friendCode,
          token,
          hasCabinetBound: value.hasCabinetBound === true,
          updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
        };
      }
    }
    const activeFriendCode = typeof parsed.activeFriendCode === 'string'
      ? parsed.activeFriendCode.trim()
      : '';
    const resolvedActive = activeFriendCode && accounts[activeFriendCode]
      ? activeFriendCode
      : (Object.keys(accounts)[0] ?? '');
    return { activeFriendCode: resolvedActive, accounts };
  } catch {
    return null;
  }
}

function parseV1(raw: string): ScoreHubAccountsState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ScoreHubAccountState>;
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
  constructor(
    private readonly storage: KeyValueStore = Storage,
    private readonly secrets = new LargeSecureValueStore(),
  ) {}

  private async loadIndexedState(index: ScoreHubAccountIndex): Promise<ScoreHubAccountsState> {
    const accounts: Record<string, ScoreHubAccountEntry> = {};
    for (const item of Object.values(index.accounts)) {
      const token = await this.secrets.read(item.tokenRef);
      if (!token) continue;
      accounts[item.friendCode] = {
        friendCode: item.friendCode,
        token,
        hasCabinetBound: item.hasCabinetBound,
        updatedAt: item.updatedAt,
      };
    }
    return {
      activeFriendCode: index.activeFriendCode && accounts[index.activeFriendCode]
        ? index.activeFriendCode
        : (Object.keys(accounts)[0] ?? index.activeFriendCode),
      accounts,
    };
  }

  private async migrateLegacyState(state: ScoreHubAccountsState): Promise<ScoreHubAccountsState | null> {
    try {
      await this.writeAll(state);
      const raw = await this.storage.getItem(ACCOUNT_INDEX_KEY);
      const index = raw ? parseIndex(raw) : null;
      const verified = index ? await this.loadIndexedState(index) : null;
      if (!verified || JSON.stringify(verified) !== JSON.stringify(state)) {
        await this.clearIndexedState();
        return null;
      }
      return verified;
    } catch {
      await this.clearIndexedState().catch(() => undefined);
      return null;
    }
  }

  private async readAll(): Promise<ScoreHubAccountsState> {
    const indexRaw = await this.storage.getItem(ACCOUNT_INDEX_KEY);
    if (indexRaw) {
      const index = parseIndex(indexRaw);
      if (index) return this.loadIndexedState(index);
      await this.storage.removeItem(ACCOUNT_INDEX_KEY);
    }

    const rawV2 = await SecureStore.getItemAsync(ACCOUNT_KEY_V2);
    if (rawV2) {
      const parsed = parseV2(rawV2);
      if (parsed) {
        const migrated = await this.migrateLegacyState(parsed);
        if (migrated) {
          await deleteLegacyAccountKeys();
          return migrated;
        }
        return parsed;
      }
      await SecureStore.deleteItemAsync(ACCOUNT_KEY_V2);
    }

    const rawV1 = await SecureStore.getItemAsync(ACCOUNT_KEY_V1);
    if (rawV1) {
      const migrated = parseV1(rawV1);
      if (migrated) {
        const stored = await this.migrateLegacyState(migrated);
        if (stored) {
          await deleteLegacyAccountKeys();
          return stored;
        }
        return migrated;
      }
      await SecureStore.deleteItemAsync(ACCOUNT_KEY_V1);
    }
    return { ...EMPTY_ALL, accounts: {} };
  }

  private async writeAll(state: ScoreHubAccountsState): Promise<void> {
    const currentRaw = await this.storage.getItem(ACCOUNT_INDEX_KEY);
    const current = currentRaw ? parseIndex(currentRaw) : null;
    const accounts: Record<string, StoredScoreHubAccountEntry> = {};
    const newSecretRefs: string[] = [];

    try {
      for (const entry of Object.values(state.accounts)) {
        const previous = current?.accounts[entry.friendCode];
        const previousToken = previous ? await this.secrets.read(previous.tokenRef) : null;
        let tokenRef = previous?.tokenRef;
        if (!tokenRef || previousToken !== entry.token) {
          tokenRef = this.secrets.createReference('scorehub-token');
          await this.secrets.write(tokenRef, entry.token);
          newSecretRefs.push(tokenRef);
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
      await this.storage.setItem(ACCOUNT_INDEX_KEY, JSON.stringify(index));
    } catch (error) {
      for (const secretRef of newSecretRefs) {
        await this.secrets.delete(secretRef).catch(() => undefined);
      }
      throw error;
    }

    const retained = new Set(Object.values(accounts).map((item) => item.tokenRef));
    for (const previous of Object.values(current?.accounts ?? {})) {
      if (!retained.has(previous.tokenRef)) {
        await this.secrets.delete(previous.tokenRef).catch(() => undefined);
      }
    }
  }

  /** 当前 active 账号扁平视图（兼容旧调用）。 */
  async load(): Promise<ScoreHubAccountState> {
    return activeView(await this.readAll());
  }

  async loadAll(): Promise<ScoreHubAccountsState> {
    return this.readAll();
  }

  /** 列出所有已存 JWT 的好友码（按最近更新倒序）。 */
  async listWithToken(): Promise<ScoreHubAccountEntry[]> {
    const state = await this.readAll();
    return Object.values(state.accounts)
      .filter((entry) => Boolean(entry.token))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getByFriendCode(friendCode: string): Promise<ScoreHubAccountEntry | null> {
    const code = friendCode.trim();
    if (!code) return null;
    const state = await this.readAll();
    return state.accounts[code] ?? null;
  }

  async select(friendCode: string): Promise<ScoreHubAccountState> {
    const code = friendCode.trim();
    const state = await this.readAll();
    if (code && state.accounts[code]) {
      state.activeFriendCode = code;
    } else {
      state.activeFriendCode = code;
    }
    await this.writeAll(state);
    return activeView(state);
  }

  /** 写入/更新某好友码条目，并设为 active。 */
  async upsert(partial: {
    friendCode: string;
    token?: string;
    hasCabinetBound?: boolean;
  }): Promise<ScoreHubAccountState> {
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
    const current = await this.load();
    const friendCode = typeof partial.friendCode === 'string'
      ? partial.friendCode.trim()
      : current.friendCode;
    const token = partial.token !== undefined
      ? (partial.token || undefined)
      : current.token;
    const hasCabinetBound = typeof partial.hasCabinetBound === 'boolean'
      ? partial.hasCabinetBound
      : current.hasCabinetBound;

    return this.upsert({
      friendCode,
      token,
      hasCabinetBound,
    });
  }

  async clear(): Promise<void> {
    await this.clearIndexedState();
    await SecureStore.deleteItemAsync(ACCOUNT_KEY_V2);
    await SecureStore.deleteItemAsync(ACCOUNT_KEY_V1);
  }

  /** 删除指定好友码的本地 JWT 条目。 */
  async remove(friendCode: string): Promise<ScoreHubAccountsState> {
    const code = friendCode.trim();
    const state = await this.readAll();
    if (code && state.accounts[code]) {
      delete state.accounts[code];
    }
    if (state.activeFriendCode === code) {
      state.activeFriendCode = Object.keys(state.accounts)[0] ?? '';
    }
    await this.writeAll(state);
    return state;
  }

  private async clearIndexedState(): Promise<void> {
    const raw = await this.storage.getItem(ACCOUNT_INDEX_KEY);
    const index = raw ? parseIndex(raw) : null;
    for (const account of Object.values(index?.accounts ?? {})) {
      await this.secrets.delete(account.tokenRef).catch(() => undefined);
    }
    await this.storage.removeItem(ACCOUNT_INDEX_KEY);
  }
}

export const scoreHubAccountStore = new ScoreHubAccountStore();
