import type { SessionVault, StoredProviderAccount, StoredProviderCredential } from '@/domain/session-vault';
import { SessionPersistenceError } from '@/domain/session-vault';
import type { ProviderSession } from '@/providers/contracts';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import Storage from '@/storage/key-value-storage';
import { LargeSecureValueStore } from '@/storage/large-secure-value-store';
import { deleteRizlinePassword } from '@/storage/rizline-password-store';
import { credentialIdForLegacyAccount, isOAuthRefreshSession, isPersistableSession, migrateV2Vault, parseSessionIndex, parseSessionIndexOrThrow, parseSessionVault, parseStoredSession, parseV2Vault, sanitizeVault, SessionIndexCorruptError, SessionIndexUnrecognizedError, sessionMatchesExpected, vaultFingerprint, type SessionIndex } from '@/storage/secure-session-codec';
import { commitSessionVault } from '@/storage/secure-session-commit';
import { enqueueStorageMutation, INDEX_CORRUPT_KEY, INDEX_KEY, INDEX_UNRECOGNIZED_KEY, LEGACY_SESSION_KEY, LEGACY_VAULT_KEYS, persistenceFailure, persistenceOperation, V2_VAULT_KEY, VAULT_KEY, type KeyValueStore } from '@/storage/secure-session-index';
import { startTimer } from '@/utils/startup-timing';
import * as SecureStore from 'expo-secure-store';
export { credentialIdsMapFromVault, sessionsMapFromVault } from '@/domain/session-vault';
export type { SessionVault, StoredProviderAccount, StoredProviderCredential } from '@/domain/session-vault';
export { parseSessionVault, SessionIndexCorruptError, SessionIndexUnrecognizedError } from '@/storage/secure-session-codec';
export { readPreservedSessionIndex, restorePreservedSessionIndex } from '@/storage/secure-session-index';

export type StoredProviderAccountInput = Omit<StoredProviderAccount, 'credentialId'> & {
  credentialId?: string;
  session: ProviderSession;
};

/**
 * 凭据会话提交结果：'stale' 表示当前凭据不属于本次提交的轮换世代，
 * 'missing' 表示凭据已不存在或已没有账号引用。
 */
export type CredentialSessionWriteResult = 'applied' | 'stale' | 'missing';

/**
 * 解绑结果：committed 表示凭据索引已提交（磁盘上账号与凭据已删除，或本来就已不存在）；
 * cleanupFailures 是提交之后的附属清理失败项，不能用它反推账号仍在。
 */
export type RemoveAccountResult = {
  committed: boolean;
  cleanupFailures: readonly string[];
};

const EMPTY_VAULT: SessionVault = {
  version: 3,
  activeAccountId: null,
  credentials: [],
  accounts: [],
};

async function deleteLegacyVaultKeys(): Promise<void> {
  for (const key of LEGACY_VAULT_KEYS) {
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
  }
}

/** 多账号凭据库：游戏账号只引用凭据，LXNS 跨游戏共享同一份 token。 */
export class SecureSessionStore {
  private readonly indexIo: KeyValueStore;
  private readonly credentialIo: Pick<LargeSecureValueStore, 'read' | 'write' | 'delete' | 'createReference'>;
  constructor(
    private readonly storage: KeyValueStore = Storage,
    secrets = new LargeSecureValueStore(),
  ) {
    this.indexIo = {
      getItem: (key) => persistenceOperation('local_commit', () => storage.getItem(key)),
      setItem: (key, value) => persistenceOperation('local_commit', () => storage.setItem(key, value)),
      removeItem: (key) => persistenceOperation('local_commit', () => storage.removeItem(key)),
    };
    this.credentialIo = {
      read: (reference) => persistenceOperation('credential_storage', () => secrets.read(reference)),
      write: (reference, value) => persistenceOperation('credential_storage', () => secrets.write(reference, value)),
      delete: (reference) => persistenceOperation('credential_storage', () => secrets.delete(reference)),
      createReference: (namespace) => {
        try { return secrets.createReference(namespace); } catch (cause) { return persistenceFailure('credential_storage', cause); }
      },
    };
  }

  private enqueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
    return enqueueStorageMutation(this.storage, mutation);
  }

  private async parseStoredIndex(raw: string): Promise<SessionIndex> {
    try {
      return parseSessionIndexOrThrow(raw);
    } catch (error) {
      if (error instanceof SessionIndexCorruptError) {
        await this.indexIo.setItem(INDEX_CORRUPT_KEY, raw).catch(() => undefined);
      } else if (error instanceof SessionIndexUnrecognizedError) {
        await this.indexIo.setItem(INDEX_UNRECOGNIZED_KEY, raw).catch(() => undefined);
      }
      throw error;
    }
  }

  private async loadOrCreateIndexUnlocked(): Promise<SessionIndex> {
    const currentRaw = await this.indexIo.getItem(INDEX_KEY);
    const current = currentRaw ? await this.parseStoredIndex(currentRaw) : null;
    if (current) return current;

    const vault = await this.loadVaultUnlocked();
    const migratedRaw = await this.indexIo.getItem(INDEX_KEY);
    const migrated = migratedRaw ? parseSessionIndex(migratedRaw) : null;
    if (migrated) return migrated;

    await this.saveVaultUnlocked(vault);
    const createdRaw = await this.indexIo.getItem(INDEX_KEY);
    const created = createdRaw ? parseSessionIndex(createdRaw) : null;
    if (!created) throw new Error('无法建立本机会话索引');
    return created;
  }

  private async loadIndexedVault(index: SessionIndex): Promise<SessionVault> {
    const credentials: StoredProviderCredential[] = [];
    const referencedCredentialIds = new Set(index.accounts.map((account) => account.credentialId));
    for (const item of index.credentials) {
      if (!referencedCredentialIds.has(item.id)) continue;
      const stop = startTimer(`secure.read.${item.id}`);
      const session = parseStoredSession(await this.credentialIo.read(item.secretRef));
      stop();
      if (!session) throw new SessionPersistenceError('credential_storage');
      credentials.push({
        id: item.id,
        providerId: item.providerId,
        session,
      });
    }
    return sanitizeVault({
      version: 3,
      activeAccountId: index.activeAccountId,
      credentials,
      accounts: index.accounts,
    });
  }

  private async migrateLegacyVault(vault: SessionVault): Promise<SessionVault | null> {
    const expected = sanitizeVault(vault);
    try {
      await this.saveVaultUnlocked(expected);
      const raw = await this.indexIo.getItem(INDEX_KEY);
      const index = raw ? parseSessionIndex(raw) : null;
      const verified = index ? await this.loadIndexedVault(index) : null;
      if (!verified || vaultFingerprint(verified) !== vaultFingerprint(expected)) {
        await this.clearIndexedVault();
        return null;
      }
      return verified;
    } catch {
      await this.clearIndexedVault().catch(() => undefined);
      return null;
    }
  }

  /**
   * 索引存在但无法解析时保留原文并抛类型化错误，不回退旧键；
   * 旧版迁移源解析失败时跳过但不删除（凭据只有这一份，不得销毁）。
   */
  async loadVault(): Promise<SessionVault> {
    return this.enqueueMutation(() => this.loadVaultUnlocked());
  }

  private async loadVaultUnlocked(): Promise<SessionVault> {
    const stopIndex = startTimer('vault.index.read');
    const indexRaw = await this.indexIo.getItem(INDEX_KEY);
    stopIndex();
    if (indexRaw) {
      return this.loadIndexedVault(await this.parseStoredIndex(indexRaw));
    }

    const vaultRaw = await persistenceOperation('credential_storage', () => SecureStore.getItemAsync(VAULT_KEY));
    if (vaultRaw) {
      const vault = parseSessionVault(vaultRaw);
      if (vault) {
        const migrated = await this.migrateLegacyVault(vault);
        if (migrated) {
          await deleteLegacyVaultKeys();
          return migrated;
        }
        return vault;
      }
    }

    const v2Raw = await persistenceOperation('credential_storage', () => SecureStore.getItemAsync(V2_VAULT_KEY));
    if (v2Raw) {
      const v2 = parseV2Vault(v2Raw);
      if (v2) {
        const legacyVault = migrateV2Vault(v2);
        const migrated = await this.migrateLegacyVault(legacyVault);
        if (migrated) {
          await deleteLegacyVaultKeys();
          return migrated;
        }
        return legacyVault;
      }
    }

    const legacy = await persistenceOperation('credential_storage', () => SecureStore.getItemAsync(LEGACY_SESSION_KEY));
    if (!legacy) return { ...EMPTY_VAULT, credentials: [], accounts: [] };

    const session = parseStoredSession(legacy);
    if (!session) {
      return { ...EMPTY_VAULT, credentials: [], accounts: [] };
    }
    const accountId = 'maimai:diving-fish:migrated';
    const credentialId = credentialIdForLegacyAccount(accountId);
    const legacyVault: SessionVault = {
      version: 3,
      activeAccountId: accountId,
      credentials: [{
        id: credentialId,
        providerId: 'diving-fish',
        session,
      }],
      accounts: [{
        id: accountId,
        gameId: 'maimai',
        providerId: 'diving-fish',
        credentialId,
        displayName: '水鱼账号',
        scoreDisplay: '—',
      }],
    };
    const migrated = await this.migrateLegacyVault(legacyVault);
    if (migrated) {
      await deleteLegacyVaultKeys();
      return migrated;
    }
    return legacyVault;
  }

  private saveVaultUnlocked(vault: SessionVault, signal?: AbortSignal, assertCurrent?: () => void): Promise<readonly string[]> {
    return commitSessionVault({ index: this.indexIo, credentials: this.credentialIo, parseIndex: raw => this.parseStoredIndex(raw) }, vault, signal, assertCurrent);
  }

  async saveVault(vault: SessionVault): Promise<void> {
    await this.enqueueMutation(() => this.saveVaultUnlocked(vault));
  }

  private async upsertAccountUnlocked(account: StoredProviderAccountInput, signal?: AbortSignal): Promise<string> {
    const credentialId = account.credentialId
      ?? credentialIdForLegacyAccount(account.id);
    await this.upsertAccountsUnlocked([account], { activeAccountId: account.id, signal });
    return credentialId;
  }

  private async upsertAccountsUnlocked(accounts: readonly StoredProviderAccountInput[], options: {
    activeAccountId: string;
    signal?: AbortSignal;
    assertCurrent?: () => void;
  }): Promise<void> {
    const assertCurrent = () => {
      if (options.signal?.aborted) throw options.signal.reason;
      options.assertCurrent?.();
    };
    assertCurrent();
    const vault = await this.loadVaultUnlocked();
    assertCurrent();
    const nextCredentials = new Map(vault.credentials.map(credential => [credential.id, credential]));
    const nextAccounts = new Map(vault.accounts.map(account => [account.id, account]));
    for (const account of accounts) {
      const credentialId = account.credentialId ?? credentialIdForLegacyAccount(account.id);
      nextCredentials.delete(credentialId);
      nextCredentials.set(credentialId, { id: credentialId, providerId: account.providerId, session: account.session });
      nextAccounts.delete(account.id);
      nextAccounts.set(account.id, {
        id: account.id,
        gameId: account.gameId,
        providerId: account.providerId,
        credentialId,
        displayName: account.displayName,
        scoreDisplay: account.scoreDisplay,
        challengeModeRank: account.challengeModeRank,
        ratingPossession: account.ratingPossession,
      });
    }
    await this.saveVaultUnlocked({
      version: 3,
      activeAccountId: options.activeAccountId,
      credentials: [...nextCredentials.values()],
      accounts: [...nextAccounts.values()],
    }, options.signal, options.assertCurrent);
  }

  /** 验证完成后一次合并账号与共享凭据，索引和激活账号在同一次提交中保存。 */
  async upsertAccounts(accounts: readonly StoredProviderAccountInput[], options: {
    activeAccountId: string;
    signal?: AbortSignal;
    assertCurrent?: () => void;
  }): Promise<void> {
    if (!accounts.every(account => isPersistableSession(account.session))) throw new SessionPersistenceError('credential_storage');
    if (!accounts.some(account => account.id === options.activeAccountId)) throw new SessionPersistenceError('local_commit');
    await this.enqueueMutation(() => this.upsertAccountsUnlocked(accounts, options));
  }

  async upsertAccount(account: StoredProviderAccountInput, signal?: AbortSignal): Promise<string> {
    if (!isPersistableSession(account.session)) return '';
    return this.enqueueMutation(() => this.upsertAccountUnlocked(account, signal));
  }

  /** 按账号解析共享凭据并轮换 token，不改变 activeAccountId。 */
  async updateAccountSession(accountId: string, session: ProviderSession, options?: {
    signal?: AbortSignal;
    expected?: ProviderSession;
  }): Promise<CredentialSessionWriteResult> {
    if (!isPersistableSession(session)) return 'missing';
    return this.enqueueMutation(async () => {
      if (options?.signal?.aborted) throw options.signal.reason;
      const vault = await this.loadVaultUnlocked();
      const existing = vault.accounts.find((account) => account.id === accountId);
      if (!existing) return 'missing';
      const credential = vault.credentials.find(item => item.id === existing.credentialId);
      if (!credential) return 'missing';
      if (options?.expected && !sessionMatchesExpected(credential.session, options.expected)) return 'stale';
      await this.saveVaultUnlocked({
        ...vault,
        credentials: vault.credentials.map((credential) => (
          credential.id === existing.credentialId
            ? { ...credential, session }
            : credential
        )),
      }, options?.signal);
      return 'applied';
    });
  }

  /**
   * 按凭据提交轮换后的会话：只要该凭据仍被账号引用就更新共享凭据，
   * 发起账号已被解绑也不影响其它仍引用同一凭据的账号。
   * 给定 acceptedRefreshTokens 时，当前凭据会话必须属于该轮换世代，否则拒绝写入。
   */
  async updateCredentialSession(
    credentialId: string,
    session: ProviderSession,
    options?: { acceptedRefreshTokens?: readonly string[] },
  ): Promise<CredentialSessionWriteResult> {
    if (!isPersistableSession(session)) return 'missing';
    return this.enqueueMutation(async () => {
      const vault = await this.loadVaultUnlocked();
      const credential = vault.credentials.find(item => item.id === credentialId);
      if (!credential) return 'missing';
      // 没有账号引用的凭据会被 sanitize 丢弃，写入不可能生效。
      if (!vault.accounts.some(account => account.credentialId === credentialId)) return 'missing';
      if (options?.acceptedRefreshTokens) {
        const current = credential.session;
        if (!isOAuthRefreshSession(current)
          || !options.acceptedRefreshTokens.includes(current.refreshToken)) return 'stale';
      }
      await this.saveVaultUnlocked({
        ...vault,
        credentials: vault.credentials.map((item) => (
          item.id === credentialId ? { ...item, session } : item
        )),
      });
      return 'applied';
    });
  }

  /** 更新展示元数据而不改变凭据或当前账号。 */
  async updateAccountMetadata(
    accountId: string,
    metadata: Pick<StoredProviderAccount, 'displayName' | 'scoreDisplay'>
      & Partial<Pick<StoredProviderAccount, 'challengeModeRank' | 'ratingPossession'>>,
  ): Promise<void> {
    await this.enqueueMutation(async () => {
      const index = await this.loadOrCreateIndexUnlocked();
      const current = index.accounts.find((account) => account.id === accountId);
      if (!current || Object.entries(metadata).every(([key, value]) => current[key as keyof StoredProviderAccount] === value)) return;
      await this.indexIo.setItem(INDEX_KEY, JSON.stringify({
        ...index,
        accounts: index.accounts.map((account) => (
          account.id === accountId ? { ...account, ...metadata } : account
        )),
      }));
    });
  }

  /**
   * 解绑账号。提交点是凭据索引写盘：写盘成功即已解绑，之后才返回；
   * Rizline 密码引用等附属清理失败只记入 cleanupFailures，不影响已提交的事实，
   * 因此调用方不能把「附属清理失败」当成「账号还在」。
   * 账号本来就不在索引里时按幂等处理，同样视为已提交。
   */
  async removeAccount(accountId: string): Promise<RemoveAccountResult> {
    return this.enqueueMutation(async () => {
      const vault = await this.loadVaultUnlocked();
      const accounts = vault.accounts.filter((item) => item.id !== accountId);
      const activeAccountId = vault.activeAccountId === accountId
        ? (accounts[0]?.id ?? null)
        : vault.activeAccountId;
      // 提交点：这里抛出表示账号与凭据仍然完整，调用方可以保留界面账号并重试。
      const cleanupFailures = accounts.length === vault.accounts.length ? [] : [...await this.saveVaultUnlocked({
        ...vault,
        activeAccountId,
        accounts,
      })];
      try {
        await deleteRizlinePassword(accountId);
      } catch (error) {
        cleanupFailures.push('密码');
        recordRuntimeError('session-persistence', error, false, { phase: 'password-cleanup' });
      }
      return { committed: true, cleanupFailures };
    });
  }

  async setActiveAccountId(accountId: string | null): Promise<void> {
    await this.enqueueMutation(async () => {
      const index = await this.loadOrCreateIndexUnlocked();
      await this.indexIo.setItem(INDEX_KEY, JSON.stringify({
        ...index,
        activeAccountId: accountId,
      }));
    });
  }

  /** @deprecated 兼容旧单会话调用；新代码请用 loadVault。 */
  async load(): Promise<ProviderSession | null> {
    const vault = await this.loadVault();
    const account = vault.accounts.find((item) => item.id === vault.activeAccountId)
      ?? vault.accounts[0];
    if (!account) return null;
    return vault.credentials.find((credential) => credential.id === account.credentialId)?.session ?? null;
  }

  /** @deprecated 兼容旧单会话；新登录请用 upsertAccount。 */
  async save(session: ProviderSession): Promise<void> {
    if (!isPersistableSession(session)) return;
    await this.enqueueMutation(async () => {
      const vault = await this.loadVaultUnlocked();
      if (vault.activeAccountId) {
        const existing = vault.accounts.find((account) => account.id === vault.activeAccountId);
        if (existing) {
          await this.upsertAccountUnlocked({
            ...existing,
            session,
          });
          return;
        }
      }
      await this.upsertAccountUnlocked({
        id: 'maimai:diving-fish:pending',
        gameId: 'maimai',
        providerId: 'diving-fish',
        displayName: '水鱼账号',
        scoreDisplay: '—',
        session,
      });
    });
  }

  async clear(): Promise<RemoveAccountResult & { committed: true }> {
    return this.enqueueMutation(async () => {
      const secretRefs = new Set<string>();
      const passwordAccountIds = new Set<string>();
      const cleanupFailures: string[] = [];
      const collectAccounts = (accounts: readonly StoredProviderAccount[]) => {
        for (const account of accounts) {
          if (account.providerId === 'rizline-official') passwordAccountIds.add(account.id);
        }
      };
      const cleanup = async (label: string, operation: () => Promise<unknown>) => {
        try { await operation(); } catch (error) {
          cleanupFailures.push(label);
          recordRuntimeError('session-persistence', error, false, { phase: 'clear-cleanup' });
        }
      };
      for (const key of [INDEX_KEY, INDEX_CORRUPT_KEY, INDEX_UNRECOGNIZED_KEY]) {
        await cleanup('登录数据读取', async () => {
          const raw = await this.indexIo.getItem(key);
          const index = raw ? parseSessionIndex(raw) : null;
          for (const credential of index?.credentials ?? []) secretRefs.add(credential.secretRef);
          collectAccounts(index?.accounts ?? []);
        });
      }
      for (const key of LEGACY_VAULT_KEYS) {
        await cleanup('旧登录数据读取', async () => {
          const raw = await persistenceOperation('credential_storage', () => SecureStore.getItemAsync(key));
          if (!raw) return;
          const vault = key === VAULT_KEY ? parseSessionVault(raw)
            : key === V2_VAULT_KEY ? parseV2Vault(raw) : null;
          for (const account of vault?.accounts ?? []) {
            if (account.providerId === 'rizline-official') passwordAccountIds.add(account.id);
          }
        });
      }
      // 合法空索引是清空的提交点；它必须保留，避免旧来源清理失败后再次迁移。
      await this.indexIo.setItem(INDEX_KEY, JSON.stringify({ version: 4, activeAccountId: null, credentials: [], accounts: [] } satisfies SessionIndex));
      for (const reference of secretRefs) await cleanup('登录凭据', () => this.credentialIo.delete(reference));
      for (const accountId of passwordAccountIds) await cleanup('密码', () => deleteRizlinePassword(accountId));
      for (const key of [INDEX_CORRUPT_KEY, INDEX_UNRECOGNIZED_KEY]) await cleanup('登录数据副本', () => this.indexIo.removeItem(key));
      for (const key of LEGACY_VAULT_KEYS) {
        await cleanup('旧登录数据', () => persistenceOperation('credential_storage', () => SecureStore.deleteItemAsync(key)));
      }
      return { committed: true, cleanupFailures: [...new Set(cleanupFailures)] };
    });
  }

  private async clearIndexedVault(): Promise<void> {
    const raw = await this.indexIo.getItem(INDEX_KEY);
    const index = raw ? parseSessionIndex(raw) : null;
    // 迁移失败时移除候选索引，允许下次从保留的旧来源重新迁移；先断开引用再清理。
    await this.indexIo.removeItem(INDEX_KEY);
    for (const credential of index?.credentials ?? []) {
      await this.credentialIo.delete(credential.secretRef).catch(() => undefined);
    }
  }
}
