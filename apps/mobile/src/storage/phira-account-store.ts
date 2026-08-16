import { createAccountListStore } from '@/storage/create-account-list-store';

export type PhiraAccountProfile = { playerId: number; displayName: string; avatarUrl?: string | null };

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

// Phira 的 upsert 原实现不做任何清洗校验，故不传 normalize。
export const PhiraAccountStore = createAccountListStore<PhiraAccountProfile>({
  storeKey: 'rranker.phira-accounts.v1',
  parse: parsePhiraAccounts,
  keyOf: (account) => account.playerId,
}).Store;
export const phiraAccountStore = new PhiraAccountStore();
