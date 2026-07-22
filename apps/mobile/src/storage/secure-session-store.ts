import * as SecureStore from 'expo-secure-store';
import type { GameId, RemoteProviderId } from '@/domain/game-bind-options';
import { isLocalMaimaiAccountId, MAIMAI_TEST_ACCOUNT_ID, TEST_ACCOUNT_ID } from '@/domain/bound-account';
import { isMaimaiDemoAccountId } from '@/storage/demo-account-store';
import type { ProviderSession } from '@/providers/contracts';

const LEGACY_SESSION_KEY = 'rranker.diving-fish.session.v1';
const VAULT_KEY = 'rranker.provider.sessions.v2';

export type StoredProviderAccount = {
  id: string;
  gameId: GameId;
  providerId: RemoteProviderId;
  displayName: string;
  scoreDisplay: string;
  /** Phigros 课题模式分数；旧 v2 记录可缺省。 */
  challengeModeRank?: number | null;
  session: ProviderSession;
};

export type SessionVault = {
  version: 2;
  activeAccountId: string | null;
  accounts: StoredProviderAccount[];
};

const EMPTY_VAULT: SessionVault = { version: 2, activeAccountId: null, accounts: [] };

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

function parseVault(raw: string): SessionVault | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SessionVault>;
    if (parsed.version !== 2 || !Array.isArray(parsed.accounts)) return null;
    const accounts = parsed.accounts.filter((account): account is StoredProviderAccount => {
      if (!account || typeof account !== 'object') return false;
      if (typeof account.id !== 'string' || typeof account.displayName !== 'string') return false;
      if (account.gameId !== 'maimai' && account.gameId !== 'phigros' && account.gameId !== 'test') return false;
      if (account.providerId !== 'diving-fish' && account.providerId !== 'lxns' && account.providerId !== 'phi-taptap') return false;
      return isPersistableSession(account.session);
    });
    return {
      version: 2,
      activeAccountId: typeof parsed.activeAccountId === 'string' ? parsed.activeAccountId : accounts[0]?.id ?? null,
      accounts,
    };
  } catch {
    return null;
  }
}

/** 多账号凭据库：按 bound account id 存 ProviderSession，仅 SecureStore。 */
export class SecureSessionStore {
  async loadVault(): Promise<SessionVault> {
    const vaultRaw = await SecureStore.getItemAsync(VAULT_KEY);
    if (vaultRaw) {
      const vault = parseVault(vaultRaw);
      if (vault) return vault;
      await SecureStore.deleteItemAsync(VAULT_KEY);
    }

    const legacy = await SecureStore.getItemAsync(LEGACY_SESSION_KEY);
    if (!legacy) return { ...EMPTY_VAULT, accounts: [] };

    try {
      const session = JSON.parse(legacy) as ProviderSession;
      if (!isPersistableSession(session)) {
        await SecureStore.deleteItemAsync(LEGACY_SESSION_KEY);
        return { ...EMPTY_VAULT, accounts: [] };
      }
      const migrated: SessionVault = {
        version: 2,
        activeAccountId: 'maimai:diving-fish:migrated',
        accounts: [{
          id: 'maimai:diving-fish:migrated',
          gameId: 'maimai',
          providerId: 'diving-fish',
          displayName: '水鱼账号',
          scoreDisplay: '—',
          session,
        }],
      };
      await this.saveVault(migrated);
      await SecureStore.deleteItemAsync(LEGACY_SESSION_KEY);
      return migrated;
    } catch {
      await SecureStore.deleteItemAsync(LEGACY_SESSION_KEY);
      return { ...EMPTY_VAULT, accounts: [] };
    }
  }

  async saveVault(vault: SessionVault): Promise<void> {
    const sanitized: SessionVault = {
      version: 2,
      activeAccountId: vault.activeAccountId,
      accounts: vault.accounts.filter((account) => isPersistableSession(account.session)),
    };
    await SecureStore.setItemAsync(VAULT_KEY, JSON.stringify(sanitized), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async upsertAccount(account: StoredProviderAccount): Promise<void> {
    if (!isPersistableSession(account.session)) return;
    const vault = await this.loadVault();
    const others = vault.accounts.filter((item) => item.id !== account.id);
    await this.saveVault({
      version: 2,
      activeAccountId: account.id,
      accounts: [...others, account],
    });
  }

  /** 仅刷新已存在账号的会话凭据（如 OAuth refresh 轮换），不改变 activeAccountId。 */
  async updateAccountSession(accountId: string, session: ProviderSession): Promise<void> {
    if (!isPersistableSession(session)) return;
    const vault = await this.loadVault();
    const existing = vault.accounts.find((account) => account.id === accountId);
    if (!existing) return;
    await this.saveVault({
      version: 2,
      activeAccountId: vault.activeAccountId,
      accounts: vault.accounts.map((account) => (
        account.id === accountId ? { ...account, session } : account
      )),
    });
  }

  /** 更新展示元数据而不改变凭据或当前账号。 */
  async updateAccountMetadata(
    accountId: string,
    metadata: Pick<StoredProviderAccount, 'displayName' | 'scoreDisplay'>
      & Partial<Pick<StoredProviderAccount, 'challengeModeRank'>>,
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
    await this.saveVault({ version: 2, activeAccountId, accounts });
  }

  async setActiveAccountId(accountId: string | null): Promise<void> {
    const vault = await this.loadVault();
    if (accountId === null) {
      await this.saveVault({ ...vault, activeAccountId: null });
      return;
    }
    const builtin = isLocalMaimaiAccountId(accountId)
      || isMaimaiDemoAccountId(accountId)
      || accountId === MAIMAI_TEST_ACCOUNT_ID
      || accountId === TEST_ACCOUNT_ID;
    if (!builtin && !vault.accounts.some((account) => account.id === accountId)) return;
    await this.saveVault({ ...vault, activeAccountId: accountId });
  }

  /** @deprecated 兼容旧单会话调用；新代码请用 loadVault。 */
  async load(): Promise<ProviderSession | null> {
    const vault = await this.loadVault();
    const active = vault.accounts.find((account) => account.id === vault.activeAccountId)
      ?? vault.accounts[0];
    return active?.session ?? null;
  }

  /** @deprecated 兼容旧单会话；新登录请用 upsertAccount。 */
  async save(session: ProviderSession): Promise<void> {
    if (!isPersistableSession(session)) return;
    const vault = await this.loadVault();
    if (vault.activeAccountId) {
      const existing = vault.accounts.find((account) => account.id === vault.activeAccountId);
      if (existing) {
        await this.upsertAccount({ ...existing, session });
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
    await SecureStore.deleteItemAsync(VAULT_KEY);
    await SecureStore.deleteItemAsync(LEGACY_SESSION_KEY);
  }
}
