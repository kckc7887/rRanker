import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import type { GameId, RemoteProviderId } from '@/domain/game-bind-options';
import {
  CHUNITHM_TEMP_ACCOUNT_ID,
  isLocalMaimaiAccountId,
  MAIMAI_TEST_ACCOUNT_ID,
  TEST_ACCOUNT_ID,
} from '@/domain/bound-account';
import { isMaimaiDemoAccountId } from '@/storage/demo-account-store';
import { isChunithmDemoAccountId } from '@/storage/chunithm-demo-account-store';
import type { ProviderSession } from '@/providers/contracts';
import { LargeSecureValueStore } from '@/storage/large-secure-value-store';
import { startTimer } from '@/utils/startup-timing';

const LEGACY_SESSION_KEY = 'rranker.diving-fish.session.v1';
const V2_VAULT_KEY = 'rranker.provider.sessions.v2';
const VAULT_KEY = 'rranker.provider.sessions.v3';
const INDEX_KEY = 'rranker.provider.sessions.index.v4';
const LEGACY_VAULT_KEYS = [VAULT_KEY, V2_VAULT_KEY, LEGACY_SESSION_KEY] as const;

export type StoredProviderCredential = {
  id: string;
  providerId: RemoteProviderId;
  session: ProviderSession;
};

export type StoredProviderAccount = {
  id: string;
  gameId: GameId;
  providerId: RemoteProviderId;
  credentialId: string;
  displayName: string;
  scoreDisplay: string;
  /** Phigros 课题模式分数；旧记录可缺省。 */
  challengeModeRank?: number | null;
  /** 中二节奏 Rating 领域；旧记录可缺省。 */
  ratingPossession?: string | null;
};

export type StoredProviderAccountInput = Omit<StoredProviderAccount, 'credentialId'> & {
  credentialId?: string;
  session: ProviderSession;
};

export type SessionVault = {
  version: 3;
  activeAccountId: string | null;
  credentials: StoredProviderCredential[];
  accounts: StoredProviderAccount[];
};

type V2StoredProviderAccount = Omit<StoredProviderAccount, 'credentialId'> & {
  session: ProviderSession;
};

type V2SessionVault = {
  version: 2;
  activeAccountId: string | null;
  accounts: V2StoredProviderAccount[];
};

type StoredCredentialIndex = {
  id: string;
  providerId: RemoteProviderId;
  secretRef: string;
};

type SessionIndex = {
  version: 4;
  activeAccountId: string | null;
  credentials: StoredCredentialIndex[];
  accounts: StoredProviderAccount[];
};

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

const EMPTY_VAULT: SessionVault = {
  version: 3,
  activeAccountId: null,
  credentials: [],
  accounts: [],
};

function isRemoteProviderId(value: unknown): value is RemoteProviderId {
  return value === 'diving-fish' || value === 'lxns' || value === 'phi-taptap';
}

function isGameId(value: unknown): value is GameId {
  return value === 'maimai'
    || value === 'chunithm'
    || value === 'phigros'
    || value === 'test';
}

function isPersistableSession(session: ProviderSession): session is ProviderSession & { persistable: true } {
  if (session.persistable !== true) return false;
  if (session.mode === 'jwt' || session.mode === 'import-token' || session.mode === 'phi-session') return true;
  if (session.mode === 'lxns-oauth') {
    return typeof session.accessToken === 'string'
      && typeof session.refreshToken === 'string'
      && typeof session.expiresAt === 'number';
  }
  return false;
}

function credentialIdForLegacyAccount(accountId: string): string {
  return `credential:${accountId}`;
}

function parseAccountMetadata(
  value: unknown,
  credentialProviders: ReadonlyMap<string, RemoteProviderId>,
): StoredProviderAccount | null {
  if (!value || typeof value !== 'object') return null;
  const account = value as Partial<StoredProviderAccount>;
  if (typeof account.id !== 'string'
    || typeof account.displayName !== 'string'
    || typeof account.scoreDisplay !== 'string'
    || typeof account.credentialId !== 'string'
    || !isGameId(account.gameId)
    || !isRemoteProviderId(account.providerId)
    || credentialProviders.get(account.credentialId) !== account.providerId) {
    return null;
  }
  return {
    id: account.id,
    gameId: account.gameId,
    providerId: account.providerId,
    credentialId: account.credentialId,
    displayName: account.displayName,
    scoreDisplay: account.scoreDisplay,
    challengeModeRank: account.challengeModeRank,
    ratingPossession: typeof account.ratingPossession === 'string'
      || account.ratingPossession === null
      ? account.ratingPossession
      : undefined,
  };
}

export function parseSessionVault(raw: string): SessionVault | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SessionVault>;
    if (parsed.version !== 3
      || !Array.isArray(parsed.credentials)
      || !Array.isArray(parsed.accounts)) {
      return null;
    }
    const credentials = parsed.credentials.flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const credential = value as Partial<StoredProviderCredential>;
      if (typeof credential.id !== 'string'
        || !isRemoteProviderId(credential.providerId)
        || !credential.session
        || !isPersistableSession(credential.session)) {
        return [];
      }
      return [{
        id: credential.id,
        providerId: credential.providerId,
        session: credential.session,
      }];
    });
    const credentialProviders = new Map(
      credentials.map((credential) => [credential.id, credential.providerId] as const),
    );
    const accounts = parsed.accounts.flatMap((value) => {
      const account = parseAccountMetadata(value, credentialProviders);
      return account ? [account] : [];
    });
    return {
      version: 3,
      activeAccountId: typeof parsed.activeAccountId === 'string'
        ? parsed.activeAccountId
        : accounts[0]?.id ?? null,
      credentials,
      accounts,
    };
  } catch {
    return null;
  }
}

function parseV2Vault(raw: string): V2SessionVault | null {
  try {
    const parsed = JSON.parse(raw) as Partial<V2SessionVault>;
    if (parsed.version !== 2 || !Array.isArray(parsed.accounts)) return null;
    const accounts = parsed.accounts.flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const account = value as Partial<V2StoredProviderAccount>;
      if (typeof account.id !== 'string'
        || typeof account.displayName !== 'string'
        || typeof account.scoreDisplay !== 'string'
        || !isGameId(account.gameId)
        || !isRemoteProviderId(account.providerId)
        || !account.session
        || !isPersistableSession(account.session)) {
        return [];
      }
      return [{
        id: account.id,
        gameId: account.gameId,
        providerId: account.providerId,
        displayName: account.displayName,
        scoreDisplay: account.scoreDisplay,
        challengeModeRank: account.challengeModeRank,
        ratingPossession: account.ratingPossession,
        session: account.session,
      }];
    });
    return {
      version: 2,
      activeAccountId: typeof parsed.activeAccountId === 'string'
        ? parsed.activeAccountId
        : accounts[0]?.id ?? null,
      accounts,
    };
  } catch {
    return null;
  }
}

function migrateV2Vault(vault: V2SessionVault): SessionVault {
  return {
    version: 3,
    activeAccountId: vault.activeAccountId,
    credentials: vault.accounts.map((account) => ({
      id: credentialIdForLegacyAccount(account.id),
      providerId: account.providerId,
      session: account.session,
    })),
    accounts: vault.accounts.map(({ session: _session, ...account }) => ({
      ...account,
      credentialId: credentialIdForLegacyAccount(account.id),
    })),
  };
}

function sanitizeVault(vault: SessionVault): SessionVault {
  const credentials = vault.credentials.filter((credential) => (
    isRemoteProviderId(credential.providerId)
    && isPersistableSession(credential.session)
  ));
  const credentialProviders = new Map(
    credentials.map((credential) => [credential.id, credential.providerId] as const),
  );
  const accounts = vault.accounts.filter((account) => (
    credentialProviders.get(account.credentialId) === account.providerId
    && isRemoteProviderId(account.providerId)
    && isGameId(account.gameId)
  ));
  const usedCredentialIds = new Set(accounts.map((account) => account.credentialId));
  return {
    version: 3,
    activeAccountId: vault.activeAccountId,
    credentials: credentials.filter((credential) => usedCredentialIds.has(credential.id)),
    accounts,
  };
}

function parseSessionIndex(raw: string): SessionIndex | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SessionIndex>;
    if (parsed.version !== 4
      || !Array.isArray(parsed.credentials)
      || !Array.isArray(parsed.accounts)) {
      return null;
    }
    const credentials = parsed.credentials.flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const credential = value as Partial<StoredCredentialIndex>;
      if (typeof credential.id !== 'string'
        || !isRemoteProviderId(credential.providerId)
        || typeof credential.secretRef !== 'string'
        || !credential.secretRef) {
        return [];
      }
      return [{
        id: credential.id,
        providerId: credential.providerId,
        secretRef: credential.secretRef,
      }];
    });
    const credentialProviders = new Map(
      credentials.map((credential) => [credential.id, credential.providerId] as const),
    );
    const accounts = parsed.accounts.flatMap((value) => {
      const account = parseAccountMetadata(value, credentialProviders);
      return account ? [account] : [];
    });
    return {
      version: 4,
      activeAccountId: typeof parsed.activeAccountId === 'string'
        ? parsed.activeAccountId
        : accounts[0]?.id ?? null,
      credentials,
      accounts,
    };
  } catch {
    return null;
  }
}

function parseStoredSession(raw: string | null): ProviderSession | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as ProviderSession;
    return isPersistableSession(session) ? session : null;
  } catch {
    return null;
  }
}

function vaultFingerprint(vault: SessionVault): string {
  return JSON.stringify({
    activeAccountId: vault.activeAccountId,
    credentials: [...vault.credentials]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((credential) => [
        credential.id,
        credential.providerId,
        credential.session,
      ]),
    accounts: [...vault.accounts]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((account) => [
        account.id,
        account.gameId,
        account.providerId,
        account.credentialId,
        account.displayName,
        account.scoreDisplay,
        account.challengeModeRank ?? null,
      ]),
  });
}

async function deleteLegacyVaultKeys(): Promise<void> {
  for (const key of LEGACY_VAULT_KEYS) {
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
  }
}

/** 多账号凭据库：游戏账号只引用凭据，LXNS 跨游戏共享同一份 token。 */
export class SecureSessionStore {
  constructor(
    private readonly storage: KeyValueStore = Storage,
    private readonly secrets = new LargeSecureValueStore(),
  ) {}

  private async loadIndexedVault(index: SessionIndex): Promise<SessionVault> {
    const credentials: StoredProviderCredential[] = [];
    for (const item of index.credentials) {
      const stop = startTimer(`secure.read.${item.id}`);
      const session = parseStoredSession(await this.secrets.read(item.secretRef));
      stop();
      if (!session) continue;
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
      await this.saveVault(expected);
      const raw = await this.storage.getItem(INDEX_KEY);
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

  async loadVault(): Promise<SessionVault> {
    const stopIndex = startTimer('vault.index.read');
    const indexRaw = await this.storage.getItem(INDEX_KEY);
    stopIndex();
    if (indexRaw) {
      const index = parseSessionIndex(indexRaw);
      if (index) return this.loadIndexedVault(index);
      await this.storage.removeItem(INDEX_KEY);
    }

    const vaultRaw = await SecureStore.getItemAsync(VAULT_KEY);
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
      await SecureStore.deleteItemAsync(VAULT_KEY);
    }

    const v2Raw = await SecureStore.getItemAsync(V2_VAULT_KEY);
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
      await SecureStore.deleteItemAsync(V2_VAULT_KEY);
    }

    const legacy = await SecureStore.getItemAsync(LEGACY_SESSION_KEY);
    if (!legacy) return { ...EMPTY_VAULT, credentials: [], accounts: [] };

    const session = parseStoredSession(legacy);
    if (!session) {
      await SecureStore.deleteItemAsync(LEGACY_SESSION_KEY);
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

  async saveVault(vault: SessionVault): Promise<void> {
    const sanitized = sanitizeVault(vault);
    const currentRaw = await this.storage.getItem(INDEX_KEY);
    const current = currentRaw ? parseSessionIndex(currentRaw) : null;
    const nextCredentials: StoredCredentialIndex[] = [];
    const newSecretRefs: string[] = [];

    try {
      for (const credential of sanitized.credentials) {
        const previous = current?.credentials.find((item) => (
          item.id === credential.id && item.providerId === credential.providerId
        ));
        const previousSession = previous
          ? parseStoredSession(await this.secrets.read(previous.secretRef))
          : null;
        if (previous
          && previousSession
          && JSON.stringify(previousSession) === JSON.stringify(credential.session)) {
          nextCredentials.push(previous);
          continue;
        }
        const secretRef = this.secrets.createReference('provider-session');
        await this.secrets.write(secretRef, JSON.stringify(credential.session));
        newSecretRefs.push(secretRef);
        nextCredentials.push({
          id: credential.id,
          providerId: credential.providerId,
          secretRef,
        });
      }

      const index: SessionIndex = {
        version: 4,
        activeAccountId: sanitized.activeAccountId,
        credentials: nextCredentials,
        accounts: sanitized.accounts,
      };
      await this.storage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch (error) {
      for (const secretRef of newSecretRefs) {
        await this.secrets.delete(secretRef).catch(() => undefined);
      }
      throw error;
    }

    const retained = new Set(nextCredentials.map((item) => item.secretRef));
    for (const previous of current?.credentials ?? []) {
      if (!retained.has(previous.secretRef)) {
        await this.secrets.delete(previous.secretRef).catch(() => undefined);
      }
    }
  }

  async upsertAccount(account: StoredProviderAccountInput): Promise<string> {
    if (!isPersistableSession(account.session)) return '';
    const vault = await this.loadVault();
    const credentialId = account.credentialId
      ?? credentialIdForLegacyAccount(account.id);
    const nextCredential: StoredProviderCredential = {
      id: credentialId,
      providerId: account.providerId,
      session: account.session,
    };
    const nextAccount: StoredProviderAccount = {
      id: account.id,
      gameId: account.gameId,
      providerId: account.providerId,
      credentialId,
      displayName: account.displayName,
      scoreDisplay: account.scoreDisplay,
      challengeModeRank: account.challengeModeRank,
      ratingPossession: account.ratingPossession,
    };
    await this.saveVault({
      version: 3,
      activeAccountId: account.id,
      credentials: [
        ...vault.credentials.filter((item) => item.id !== credentialId),
        nextCredential,
      ],
      accounts: [
        ...vault.accounts.filter((item) => item.id !== account.id),
        nextAccount,
      ],
    });
    return credentialId;
  }

  /** 按账号解析共享凭据并轮换 token，不改变 activeAccountId。 */
  async updateAccountSession(accountId: string, session: ProviderSession): Promise<void> {
    if (!isPersistableSession(session)) return;
    const vault = await this.loadVault();
    const existing = vault.accounts.find((account) => account.id === accountId);
    if (!existing) return;
    await this.saveVault({
      ...vault,
      credentials: vault.credentials.map((credential) => (
        credential.id === existing.credentialId
          ? { ...credential, session }
          : credential
      )),
    });
  }

  /** 更新展示元数据而不改变凭据或当前账号。 */
  async updateAccountMetadata(
    accountId: string,
    metadata: Pick<StoredProviderAccount, 'displayName' | 'scoreDisplay'>
      & Partial<Pick<StoredProviderAccount, 'challengeModeRank' | 'ratingPossession'>>,
  ): Promise<void> {
    const vault = await this.loadVault();
    if (!vault.accounts.some((account) => account.id === accountId)) return;
    await this.saveVault({
      ...vault,
      accounts: vault.accounts.map((account) => (
        account.id === accountId ? { ...account, ...metadata } : account
      )),
    });
  }

  async removeAccount(accountId: string): Promise<void> {
    const vault = await this.loadVault();
    const accounts = vault.accounts.filter((item) => item.id !== accountId);
    const activeAccountId = vault.activeAccountId === accountId
      ? (accounts[0]?.id ?? null)
      : vault.activeAccountId;
    await this.saveVault({
      ...vault,
      activeAccountId,
      accounts,
    });
  }

  async setActiveAccountId(accountId: string | null): Promise<void> {
    const vault = await this.loadVault();
    if (accountId === null) {
      await this.saveVault({ ...vault, activeAccountId: null });
      return;
    }
    const builtin = isLocalMaimaiAccountId(accountId)
      || isMaimaiDemoAccountId(accountId)
      || isChunithmDemoAccountId(accountId)
      || accountId === MAIMAI_TEST_ACCOUNT_ID
      || accountId === CHUNITHM_TEMP_ACCOUNT_ID
      || accountId === TEST_ACCOUNT_ID;
    if (!builtin && !vault.accounts.some((account) => account.id === accountId)) return;
    await this.saveVault({ ...vault, activeAccountId: accountId });
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
    const vault = await this.loadVault();
    if (vault.activeAccountId) {
      const existing = vault.accounts.find((account) => account.id === vault.activeAccountId);
      if (existing) {
        await this.upsertAccount({
          ...existing,
          session,
        });
        return;
      }
    }
    await this.upsertAccount({
      id: 'maimai:diving-fish:pending',
      gameId: 'maimai',
      providerId: 'diving-fish',
      displayName: '水鱼账号',
      scoreDisplay: '—',
      session,
    });
  }

  async clear(): Promise<void> {
    await this.clearIndexedVault();
    await SecureStore.deleteItemAsync(VAULT_KEY);
    await SecureStore.deleteItemAsync(V2_VAULT_KEY);
    await SecureStore.deleteItemAsync(LEGACY_SESSION_KEY);
  }

  private async clearIndexedVault(): Promise<void> {
    const raw = await this.storage.getItem(INDEX_KEY);
    const index = raw ? parseSessionIndex(raw) : null;
    for (const credential of index?.credentials ?? []) {
      await this.secrets.delete(credential.secretRef).catch(() => undefined);
    }
    await this.storage.removeItem(INDEX_KEY);
  }
}
