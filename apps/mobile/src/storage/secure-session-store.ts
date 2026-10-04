import type { SessionVault, StoredProviderAccount, StoredProviderCredential } from '@/domain/session-vault';
import { SessionPersistenceError } from '@/domain/session-vault';
import type { ProviderSession } from '@/providers/contracts';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import Storage from '@/storage/key-value-storage';
import { LargeSecureValueStore } from '@/storage/large-secure-value-store';
import { deleteRizlinePassword } from '@/storage/rizline-password-store';
import { credentialIdForAccount, isOAuthRefreshSession, parseSessionIndex, parseStoredSession, sessionMatchesExpected, type SessionIndex } from '@/storage/secure-session-codec';
import { commitSessionVault } from '@/storage/secure-session-commit';
import { enqueueStorageMutation, INDEX_KEY, persistenceFailure, persistenceOperation, type KeyValueStore } from '@/storage/secure-session-index';
import { startTimer } from '@/utils/startup-timing';

export type StoredProviderAccountInput = Omit<StoredProviderAccount, 'credentialId'> & {
  credentialId?: string;
  session: ProviderSession;
};

export type CredentialSessionWriteResult = 'applied' | 'stale' | 'missing';

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

export class SecureSessionStore {
  private readonly indexIo: KeyValueStore;
  private readonly credentialIo: Pick<LargeSecureValueStore, 'read' | 'write' | 'delete' | 'createReference'>;
  constructor(
    private readonly storage: KeyValueStore = Storage,
    secrets: Pick<LargeSecureValueStore, 'read' | 'write' | 'delete' | 'createReference'> = new LargeSecureValueStore(),
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
    const parsed = parseSessionIndex(raw);
    if (parsed) return parsed;
    const index: SessionIndex = { version: 4, activeAccountId: null, credentials: [], accounts: [] };
    await this.indexIo.setItem(INDEX_KEY, JSON.stringify(index));
    return index;
  }

  private async loadOrCreateIndexUnlocked(): Promise<SessionIndex> {
    const raw = await this.indexIo.getItem(INDEX_KEY);
    return raw !== null ? this.parseStoredIndex(raw)
      : { version: 4, activeAccountId: null, credentials: [], accounts: [] };
  }

  private async loadIndexedVault(index: SessionIndex): Promise<SessionVault> {
    const credentials: StoredProviderCredential[] = [];
    const referenced = new Set(index.accounts.map(account => account.credentialId));
    const unsupported = new Set<string>();
    for (const item of index.credentials) {
      if (!referenced.has(item.id)) continue;
      const stop = startTimer(`secure.read.${item.id}`);
      const session = parseStoredSession(await this.credentialIo.read(item.secretRef));
      stop();
      if (session) credentials.push({ id: item.id, providerId: item.providerId, session });
      else unsupported.add(item.id);
    }
    const accounts = index.accounts.filter(account => !unsupported.has(account.credentialId));
    const removedActive = index.accounts.some(account => account.id === index.activeAccountId && unsupported.has(account.credentialId));
    const activeAccountId = removedActive ? accounts[0]?.id ?? null : index.activeAccountId;
    if (unsupported.size) {
      const next = { ...index, activeAccountId, accounts, credentials: index.credentials.filter(item => !unsupported.has(item.id)) };
      await this.indexIo.setItem(INDEX_KEY, JSON.stringify(next));
      for (const item of index.credentials) {
        if (unsupported.has(item.id)) await this.credentialIo.delete(item.secretRef);
      }
    }
    return { version: 3, activeAccountId, credentials, accounts };
  }

  async loadVault(): Promise<SessionVault> {
    return this.enqueueMutation(() => this.loadVaultUnlocked());
  }

  private async loadVaultUnlocked(): Promise<SessionVault> {
    const stop = startTimer('vault.index.read');
    const raw = await this.indexIo.getItem(INDEX_KEY);
    stop();
    return raw !== null ? this.loadIndexedVault(await this.parseStoredIndex(raw))
      : { ...EMPTY_VAULT, credentials: [], accounts: [] };
  }

  private saveVaultUnlocked(vault: SessionVault, signal?: AbortSignal, assertCurrent?: () => void): Promise<readonly string[]> {
    return commitSessionVault({ index: this.indexIo, credentials: this.credentialIo }, vault, signal, assertCurrent);
  }

  private async upsertAccountUnlocked(account: StoredProviderAccountInput, signal?: AbortSignal): Promise<string> {
    const credentialId = account.credentialId
      ?? credentialIdForAccount(account.id);
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
    const nextCredentials = new Map(vault.credentials.map(credential => [credential.id, credential]));
    const nextAccounts = new Map(vault.accounts.map(account => [account.id, account]));
    for (const account of accounts) {
      const credentialId = account.credentialId ?? credentialIdForAccount(account.id);
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

  async upsertAccounts(accounts: readonly StoredProviderAccountInput[], options: {
    activeAccountId: string;
    signal?: AbortSignal;
    assertCurrent?: () => void;
  }): Promise<void> {
    if (!accounts.every(account => account.session.persistable)) throw new SessionPersistenceError('credential_storage');
    await this.enqueueMutation(() => this.upsertAccountsUnlocked(accounts, options));
  }

  async upsertAccount(account: StoredProviderAccountInput, signal?: AbortSignal): Promise<string> {
    if (!account.session.persistable) return '';
    return this.enqueueMutation(() => this.upsertAccountUnlocked(account, signal));
  }

  async updateAccountSession(accountId: string, session: ProviderSession, options?: {
    signal?: AbortSignal;
    expected?: ProviderSession;
  }): Promise<CredentialSessionWriteResult> {
    if (!session.persistable) return 'missing';
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

  async updateCredentialSession(
    credentialId: string,
    session: ProviderSession,
    options?: { acceptedRefreshTokens?: readonly string[] },
  ): Promise<CredentialSessionWriteResult> {
    if (!session.persistable) return 'missing';
    return this.enqueueMutation(async () => {
      const vault = await this.loadVaultUnlocked();
      const credential = vault.credentials.find(item => item.id === credentialId);
      if (!credential) return 'missing';
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

  async removeAccount(accountId: string): Promise<RemoveAccountResult> {
    return this.enqueueMutation(async () => {
      const vault = await this.loadVaultUnlocked();
      const accounts = vault.accounts.filter((item) => item.id !== accountId);
      const activeAccountId = vault.activeAccountId === accountId
        ? (accounts[0]?.id ?? null)
        : vault.activeAccountId;
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

  async clear(): Promise<RemoveAccountResult & { committed: true }> {
    return this.enqueueMutation(async () => {
      const index = await this.loadOrCreateIndexUnlocked();
      await this.indexIo.setItem(INDEX_KEY, JSON.stringify({ version: 4, activeAccountId: null, credentials: [], accounts: [] } satisfies SessionIndex));
      const cleanupFailures: string[] = [];
      const cleanup = async (label: string, operation: () => Promise<unknown>) => {
        try { await operation(); } catch (error) {
          cleanupFailures.push(label);
          recordRuntimeError('session-persistence', error, false, { phase: 'clear-cleanup' });
        }
      };
      for (const credential of index.credentials) await cleanup('登录凭据', () => this.credentialIo.delete(credential.secretRef));
      for (const account of index.accounts) {
        if (account.providerId === 'rizline-official') await cleanup('密码', () => deleteRizlinePassword(account.id));
      }
      return { committed: true, cleanupFailures: [...new Set(cleanupFailures)] };
    });
  }
}
