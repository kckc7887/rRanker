import Storage from 'expo-sqlite/kv-store';

export type MuseDashAccountProfile = { userId: string; displayName: string };
type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};
type StoredMuseDashAccountsV1 = { version: 1; accounts: MuseDashAccountProfile[] };
const STORE_KEY = 'rranker.musedash-accounts.v1';

export function parseMuseDashAccounts(value: unknown): MuseDashAccountProfile[] {
  if (!value || typeof value !== 'object') return [];
  const raw = value as { version?: unknown; accounts?: unknown };
  if (raw.version !== 1 || !Array.isArray(raw.accounts)) return [];
  const seen = new Set<string>();
  return raw.accounts.flatMap((entry): MuseDashAccountProfile[] => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as { userId?: unknown; displayName?: unknown };
    const displayName = typeof item.displayName === 'string' ? item.displayName.trim() : '';
    if (typeof item.userId !== 'string' || !item.userId.trim() || !displayName) return [];
    const userId = item.userId.trim();
    if (seen.has(userId)) return [];
    seen.add(userId);
    return [{ userId, displayName }];
  });
}

export class MuseDashAccountStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}
  async load(): Promise<MuseDashAccountProfile[]> {
    try {
      const raw = await this.storage.getItem(STORE_KEY);
      return raw ? parseMuseDashAccounts(JSON.parse(raw)) : [];
    } catch {
      await this.storage.removeItem(STORE_KEY).catch(() => undefined);
      return [];
    }
  }
  private async save(accounts: MuseDashAccountProfile[]): Promise<void> {
    const value: StoredMuseDashAccountsV1 = { version: 1, accounts };
    await this.storage.setItem(STORE_KEY, JSON.stringify(value));
  }
  async upsert(account: MuseDashAccountProfile): Promise<MuseDashAccountProfile[]> {
    const displayName = account.displayName.trim();
    if (!account.userId.trim() || !displayName) throw new Error('喵斯快跑玩家信息无效');
    const next = [...(await this.load()).filter((item) => item.userId !== account.userId), { userId: account.userId.trim(), displayName }];
    await this.save(next);
    return next;
  }
  async remove(userId: string): Promise<MuseDashAccountProfile[]> {
    const next = (await this.load()).filter((item) => item.userId !== userId);
    if (next.length === 0) await this.storage.removeItem(STORE_KEY); else await this.save(next);
    return next;
  }
}
export const museDashAccountStore = new MuseDashAccountStore();
