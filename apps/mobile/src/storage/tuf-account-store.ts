import Storage from 'expo-sqlite/kv-store';

export type TufAccountProfile = { playerId: number; displayName: string; avatarUrl?: string | null };
type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};
type StoredTufAccountsV1 = { version: 1; accounts: TufAccountProfile[] };
const STORE_KEY = 'rranker.tuf-accounts.v1';

export function parseTufAccounts(value: unknown): TufAccountProfile[] {
  if (!value || typeof value !== 'object') return [];
  const raw = value as { version?: unknown; accounts?: unknown };
  if (raw.version !== 1 || !Array.isArray(raw.accounts)) return [];
  const seen = new Set<number>();
  return raw.accounts.flatMap((entry): TufAccountProfile[] => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as { playerId?: unknown; displayName?: unknown; avatarUrl?: unknown };
    const displayName = typeof item.displayName === 'string' ? item.displayName.trim() : '';
    if (!Number.isSafeInteger(item.playerId) || Number(item.playerId) <= 0 || !displayName) return [];
    const playerId = Number(item.playerId);
    if (seen.has(playerId)) return [];
    seen.add(playerId);
    return [{ playerId, displayName, avatarUrl: typeof item.avatarUrl === 'string' ? item.avatarUrl : null }];
  });
}

export class TufAccountStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}
  async load(): Promise<TufAccountProfile[]> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw ? parseTufAccounts(JSON.parse(raw)) : [];
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return [];
    }
  }
  private async save(accounts: TufAccountProfile[]): Promise<void> {
    const value: StoredTufAccountsV1 = { version: 1, accounts };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }
  async upsert(account: TufAccountProfile): Promise<TufAccountProfile[]> {
    const displayName = account.displayName.trim();
    if (!Number.isSafeInteger(account.playerId) || account.playerId <= 0 || !displayName) throw new Error('TUF 玩家信息无效');
    const next = [...(await this.load()).filter((item) => item.playerId !== account.playerId), { ...account, displayName }];
    await this.save(next);
    return next;
  }
  async remove(playerId: number): Promise<TufAccountProfile[]> {
    const next = (await this.load()).filter((item) => item.playerId !== playerId);
    if (next.length === 0) await this.storage.removeItem(STORE_KEY); else await this.save(next);
    return next;
  }
}
export const tufAccountStore = new TufAccountStore();
