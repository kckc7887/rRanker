import * as SecureStore from 'expo-secure-store';

const ACCOUNT_KEY_V1 = 'rranker.scorehub.account.v1';
const ACCOUNT_KEY_V2 = 'rranker.scorehub.account.v2';

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

const EMPTY_ALL: ScoreHubAccountsState = {
  activeFriendCode: '',
  accounts: {},
};

const STORE_OPTS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
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

export class ScoreHubAccountStore {
  private async readAll(): Promise<ScoreHubAccountsState> {
    const rawV2 = await SecureStore.getItemAsync(ACCOUNT_KEY_V2);
    if (rawV2) {
      const parsed = parseV2(rawV2);
      if (parsed) return parsed;
      await SecureStore.deleteItemAsync(ACCOUNT_KEY_V2);
    }

    const rawV1 = await SecureStore.getItemAsync(ACCOUNT_KEY_V1);
    if (rawV1) {
      const migrated = parseV1(rawV1);
      if (migrated) {
        await this.writeAll(migrated);
        await SecureStore.deleteItemAsync(ACCOUNT_KEY_V1);
        return migrated;
      }
      await SecureStore.deleteItemAsync(ACCOUNT_KEY_V1);
    }
    return { ...EMPTY_ALL, accounts: {} };
  }

  private async writeAll(state: ScoreHubAccountsState): Promise<void> {
    await SecureStore.setItemAsync(ACCOUNT_KEY_V2, JSON.stringify(state), STORE_OPTS);
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
}

export const scoreHubAccountStore = new ScoreHubAccountStore();
