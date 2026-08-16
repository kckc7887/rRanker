import { createAccountListStore } from '@/storage/create-account-list-store';

export type TufAccountProfile = { playerId: number; displayName: string; avatarUrl?: string | null };

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

export const TufAccountStore = createAccountListStore<TufAccountProfile>({
  storeKey: 'rranker.tuf-accounts.v1',
  parse: parseTufAccounts,
  keyOf: (account) => account.playerId,
  normalize: (account) => {
    const displayName = account.displayName.trim();
    if (!Number.isSafeInteger(account.playerId) || account.playerId <= 0 || !displayName) throw new Error('TUF 玩家信息无效');
    return { ...account, displayName };
  },
}).Store;
export const tufAccountStore = new TufAccountStore();
