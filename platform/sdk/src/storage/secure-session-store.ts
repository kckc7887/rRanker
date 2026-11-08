import type { Credential } from '@rranker/sdk/credentials';
import type { SessionVault, StoredProviderAccount, StoredProviderCredential } from '@rranker/sdk/domain/session-vault';
import { SessionPersistenceError } from '@rranker/sdk/domain/session-vault';

import { recordRuntimeError } from '@rranker/sdk/services/runtime-diagnostics-recorder';
import Storage from '@rranker/sdk/storage/key-value-storage';
import { LargeSecureValueStore } from '@rranker/sdk/storage/large-secure-value-store';
import { getDataSource } from '@rranker/sdk/registry';
import { credentialIdForAccount, parseSessionIndex, parseStoredSession, sessionMatchesExpected, type SessionIndex } from '@rranker/sdk/storage/secure-session-codec';
import { commitSessionVault } from '@rranker/sdk/storage/secure-session-commit';
import { enqueueStorageMutation, INDEX_KEY, persistenceFailure, persistenceOperation, type KeyValueStore } from '@rranker/sdk/storage/secure-session-index';
import { startTimer } from '@rranker/sdk/utils/startup-timing';

export type StoredProviderAccountInput = Omit<StoredProviderAccount, 'credentialId'> & {
  credentialId?: string;
  session: Credential;
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
      const session = parseStoredSession(item.providerId, await this.credentialIo.read(item.secretRef));
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
        displayData: account.displayData,
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

  async updateAccountSession(accountId: string, session: Credential, options?: {
    signal?: AbortSignal;
    expected?: Credential;
  }): Promise<CredentialSessionWriteResult> {
    if (!session.persistable) return 'missing';
    return this.enqueueMutation(async () => {
      if (options?.signal?.aborted) throw options.signal.reason;
      const vault = await this.loadVaultUnlocked();
      const existing = vault.accounts.find((account) => account.id === accountId);
      if (!existing) return 'missing';
      const credential = vault.credentials.find(item => item.id === existing.credentialId);
      if (!credential) return 'missing';
      if (options?.expected && !sessionMatchesExpected(existing.providerId, credential.session, options.expected)) return 'stale';
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
    session: Credential,
    options?: { expected?: Credential; assertCurrent?: () => void },
  ): Promise<CredentialSessionWriteResult> {
    if (!session.persistable) return 'missing';
    return this.enqueueMutation(async () => {
      const vault = await this.loadVaultUnlocked();
      const credential = vault.credentials.find(item => item.id === credentialId);
      if (!credential) return 'missing';
      if (!vault.accounts.some(account => account.credentialId === credentialId)) return 'missing';
      options?.assertCurrent?.();
      if (!sessionMatchesExpected(credential.providerId, credential.session, options?.expected)) return 'stale';
      await this.saveVaultUnlocked({
        ...vault,
        credentials: vault.credentials.map((item) => (
          item.id === credentialId ? { ...item, session } : item
        )),
      }, undefined, options?.assertCurrent);
      return 'applied';
    });
  }

  async updateAccountMetadata(
    accountId: string,
    metadata: Pick<StoredProviderAccount, 'displayName' | 'scoreDisplay'>
      & Partial<Pick<StoredProviderAccount, 'displayData'>>,
    assertCurrent?: () => void,
  ): Promise<void> {
    await this.enqueueMutation(async () => {
      assertCurrent?.();
      const index = await this.loadOrCreateIndexUnlocked();
      assertCurrent?.();
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
      const index = await this.loadOrCreateIndexUnlocked();
      const accounts = index.accounts.filter((item) => item.id !== accountId);
      const activeAccountId = index.activeAccountId === accountId
        ? (accounts[0]?.id ?? null)
        : index.activeAccountId;
      const referenced = new Set(accounts.map((item) => item.credentialId));
      const credentials = index.credentials.filter((item) => referenced.has(item.id));
      const removed = index.credentials.filter((item) => !referenced.has(item.id));
      const cleanupFailures: string[] = [];
      if (accounts.length !== index.accounts.length || removed.length > 0 || activeAccountId !== index.activeAccountId) {
        await this.indexIo.setItem(INDEX_KEY, JSON.stringify({ ...index, activeAccountId, accounts, credentials }));
        const retained = new Set(credentials.map((item) => item.secretRef));
        for (const reference of new Set(removed.map((item) => item.secretRef))) {
          if (retained.has(reference)) continue;
          try { await this.credentialIo.delete(reference); } catch (error) {
            cleanupFailures.push('登录凭据');
            recordRuntimeError('session-persistence', error, false, { phase: 'credential-cleanup' });
          }
        }
      }
      const removedAccount = index.accounts.find(item => item.id === accountId);
      await (removedAccount && getDataSource(removedAccount.providerId)?.cleanupCredential?.(accountId, async (label, action) => {
        try { await action(); } catch (error) {
          cleanupFailures.push(label);
          recordRuntimeError('session-persistence', error, false, { phase: 'credential-cleanup' });
        }
      }));
      return { committed: true, cleanupFailures: [...new Set(cleanupFailures)] };
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
        await getDataSource(account.providerId)?.cleanupCredential?.(account.id, cleanup);
      }
      return { committed: true, cleanupFailures: [...new Set(cleanupFailures)] };
    });
  }
}
