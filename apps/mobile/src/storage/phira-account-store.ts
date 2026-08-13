import Storage from 'expo-sqlite/kv-store';

export type PhiraAccountProfile = { playerId: number; displayName: string; avatarUrl?: string | null };
type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};
const STORE_KEY = 'rranker.phira-accounts.v1';

export function parsePhiraAccounts(value: unknown): PhiraAccountProfile[] {
  if (!value || typeof value !== 'object') return [];
  const raw = value as { version?: unknown; accounts?: unknown };
  if (raw.version !== 1 || !Array.isArray(raw.accounts)) return [];
  const seen = new Set<number>();
  return raw.accounts.flatMap((entry): PhiraAccountProfile[] => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as { playerId?: unknown; displayName?: unknown; avatarUrl?: unknown };
    const playerId = Number(item.playerId);
    const displayName = typeof item.displayName === 'string' ? item.displayName.trim() : '';
    if (!Number.isSafeInteger(playerId) || playerId <= 0 || !displayName || seen.has(playerId)) return [];
    seen.add(playerId);
    return [{ playerId, displayName, avatarUrl: typeof item.avatarUrl === 'string' ? item.avatarUrl : null }];
  });
}

export class PhiraAccountStore {
  constructor(private readonly storage: KeyValueStore = Storage) {}
  async load() {
    try { const raw = await this.storage.getItem(STORE_KEY); return raw ? parsePhiraAccounts(JSON.parse(raw)) : []; }
    catch { await this.storage.removeItem(STORE_KEY).catch(() => undefined); return []; }
  }
  private save(accounts: PhiraAccountProfile[]) {
    return this.storage.setItem(STORE_KEY, JSON.stringify({ version: 1, accounts }));
  }
  async upsert(account: PhiraAccountProfile) {
    const current = await this.load();
    const next = [...current.filter((item) => item.playerId !== account.playerId), account];
    await this.save(next); return next;
  }
  async remove(playerId: number) {
    const next = (await this.load()).filter((item) => item.playerId !== playerId);
    if (next.length) await this.save(next); else await this.storage.removeItem(STORE_KEY);
    return next;
  }
}
export const phiraAccountStore = new PhiraAccountStore();
