import Storage from '@/storage/key-value-storage';
import { LargeSecureValueStore } from '@/storage/large-secure-value-store';
import { enqueueKeyMutation } from '@/storage/create-account-list-store';
import { SessionPersistenceError } from '@/domain/session-vault';

const ACCOUNT_INDEX_KEY = 'rranker.scorehub.accounts.v3';

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
      if (typeof value.friendCode !== 'string' || value.friendCode !== key || !key
        || typeof value.tokenRef !== 'string' || !value.tokenRef
        || typeof value.hasCabinetBound !== 'boolean'
        || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)) return null;
      const friendCode = value.friendCode;
      accounts[friendCode] = {
        friendCode,
        tokenRef: value.tokenRef,
        hasCabinetBound: value.hasCabinetBound,
        updatedAt: value.updatedAt,
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

export class ScoreHubAccountStore {
  private readonly indexIo: KeyValueStore;
  private readonly credentialIo: Pick<LargeSecureValueStore, 'read' | 'write' | 'delete' | 'createReference'>;
  constructor(
    private readonly storage: KeyValueStore = Storage,
    secrets: Pick<LargeSecureValueStore, 'read' | 'write' | 'delete' | 'createReference'> = new LargeSecureValueStore(),
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

  private async parseExistingIndex(raw: string): Promise<ScoreHubAccountIndex> {
    const parsed = parseIndex(raw);
    if (parsed) return parsed;
    const empty: ScoreHubAccountIndex = { version: 3, activeFriendCode: '', accounts: {} };
    await this.indexIo.setItem(ACCOUNT_INDEX_KEY, JSON.stringify(empty));
    return empty;
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

  private async readAll(): Promise<ScoreHubAccountsState> {
    const raw = await this.indexIo.getItem(ACCOUNT_INDEX_KEY);
    if (raw === null) return { ...EMPTY_ALL, accounts: {} };
    return this.loadIndexedState(await this.parseExistingIndex(raw));
  }

  private async writeAll(state: ScoreHubAccountsState): Promise<void> {
    const currentRaw = await this.indexIo.getItem(ACCOUNT_INDEX_KEY);
    const current = currentRaw !== null ? await this.parseExistingIndex(currentRaw) : null;
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
      /** 写入抛错仍可能已提交；读回失败时保留可能已被引用的凭据。 */
      const actualRaw = await this.indexIo.getItem(ACCOUNT_INDEX_KEY);
      const actual = actualRaw !== null ? parseIndex(actualRaw) : null;
      if (actualRaw !== null && !actual) throw new SessionPersistenceError('local_commit');
      referenced = new Set(Object.values(actual?.accounts ?? {}).map(item => item.tokenRef));
    }
    for (const secretRef of secretRefs) {
      if (!referenced.has(secretRef)) await this.credentialIo.delete(secretRef).catch(() => undefined);
    }
  }

  async load(): Promise<ScoreHubAccountState> {
    return this.enqueue(async () => activeView(await this.readAll()));
  }

  async loadAll(): Promise<ScoreHubAccountsState> {
    return this.enqueue(() => this.readAll());
  }

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

  async clear(): Promise<void> {
    await this.enqueue(async () => {
      await this.removeIndexedAccounts();
    });
  }

  /** 删除指定好友码的本地 JWT 条目。 */
  async remove(friendCode: string): Promise<void> {
    return this.enqueue(() => this.removeIndexedAccounts(friendCode.trim()));
  }

  private async removeIndexedAccounts(code?: string): Promise<void> {
    const raw = await this.indexIo.getItem(ACCOUNT_INDEX_KEY);
    if (raw === null) {
      const state = await this.readAll();
      if (code === undefined) {
        await this.writeAll({ ...EMPTY_ALL, accounts: {} });
        return;
      }
      if (code && state.accounts[code]) delete state.accounts[code];
      if (state.activeFriendCode === code) state.activeFriendCode = Object.keys(state.accounts)[0] ?? '';
      await this.writeAll(state);
      return;
    }
    const index = await this.parseExistingIndex(raw);
    const removed = Object.values(index.accounts).filter(entry => code === undefined || entry.friendCode === code);
    for (const entry of removed) delete index.accounts[entry.friendCode];
    index.activeFriendCode = resolveActiveFriendCode(index.activeFriendCode, index.accounts);
    await this.indexIo.setItem(ACCOUNT_INDEX_KEY, JSON.stringify(index));
    const retained = new Set(Object.values(index.accounts).map(entry => entry.tokenRef));
    for (const entry of removed) {
      if (!retained.has(entry.tokenRef)) await this.credentialIo.delete(entry.tokenRef).catch(() => undefined);
    }
  }
}

export const scoreHubAccountStore = new ScoreHubAccountStore();
