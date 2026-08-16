import { createAccountListStore } from '@/storage/create-account-list-store';

export type MuseDashAccountProfile = { userId: string; displayName: string };

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

export const MuseDashAccountStore = createAccountListStore<MuseDashAccountProfile>({
  storeKey: 'rranker.musedash-accounts.v1',
  parse: parseMuseDashAccounts,
  keyOf: (account) => account.userId,
  normalize: (account) => {
    const displayName = account.displayName.trim();
    if (!account.userId.trim() || !displayName) throw new Error('喵斯快跑玩家信息无效');
    return { userId: account.userId.trim(), displayName };
  },
}).Store;
export const museDashAccountStore = new MuseDashAccountStore();
