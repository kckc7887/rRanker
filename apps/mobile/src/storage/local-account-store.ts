import Storage from 'expo-sqlite/kv-store';
import { isLocalMaimaiAccountId } from '@/domain/bound-account';
import { createAccountListStore, type KeyValueStore } from '@/storage/create-account-list-store';

export type LocalAccountProfile = {
  id: string;
  displayName: string;
};

export const DEFAULT_LOCAL_PLAYER_NAME = '本地玩家';
export const LOCAL_PLAYER_NAME_MAX_LENGTH = 20;

export function normalizeLocalPlayerName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, LOCAL_PLAYER_NAME_MAX_LENGTH);
}

export function parseLocalAccountProfiles(value: unknown): LocalAccountProfile[] {
  if (!value || typeof value !== 'object') return [];
  const raw = value as { version?: unknown; accounts?: unknown };
  if (raw.version !== 1 || !Array.isArray(raw.accounts)) return [];
  const seen = new Set<string>();
  const profiles: LocalAccountProfile[] = [];
  for (const candidate of raw.accounts) {
    if (!candidate || typeof candidate !== 'object') continue;
    const account = candidate as { id?: unknown; displayName?: unknown };
    if (typeof account.id !== 'string' || !isLocalMaimaiAccountId(account.id) || seen.has(account.id)) continue;
    const displayName = typeof account.displayName === 'string'
      ? normalizeLocalPlayerName(account.displayName)
      : null;
    if (!displayName) continue;
    seen.add(account.id);
    profiles.push({ id: account.id, displayName });
  }
  return profiles;
}

const { Store } = createAccountListStore<LocalAccountProfile>({
  storeKey: 'rranker.local-maimai-accounts.v1',
  parse: parseLocalAccountProfiles,
  keyOf: (account) => account.id,
  normalize: (profile) => {
    const displayName = normalizeLocalPlayerName(profile.displayName);
    if (!isLocalMaimaiAccountId(profile.id) || !displayName) {
      throw new Error('本地玩家名称不能为空');
    }
    return { id: profile.id, displayName };
  },
});

/** 本地账号 store：基于公共工厂实例化，薄包装保持 upsert/remove 返回 void 的原方法签名。 */
export class LocalAccountStore {
  private readonly store: InstanceType<typeof Store>;

  constructor(private readonly storage: KeyValueStore = Storage) {
    this.store = new Store(storage);
  }

  load(): Promise<LocalAccountProfile[]> {
    return this.store.load();
  }

  async upsert(profile: LocalAccountProfile): Promise<void> {
    await this.store.upsert(profile);
  }

  async remove(accountId: string): Promise<void> {
    await this.store.remove(accountId);
  }
}

export const localAccountStore = new LocalAccountStore();
