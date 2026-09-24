import { assertAccountListEnvelope } from '@/storage/create-demo-account-store';
import { createAccountListStore } from '@/storage/create-account-list-store';

export type PhiraAccountProfile = { playerId: number; displayName: string; avatarUrl?: string | null };

export function parsePhiraAccounts(value: unknown): PhiraAccountProfile[] {
  const { accounts } = assertAccountListEnvelope(value);
  const seen = new Set<number>();
  return accounts.flatMap((entry): PhiraAccountProfile[] => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as { playerId?: unknown; displayName?: unknown; avatarUrl?: unknown };
    const playerId = Number(item.playerId);
    const displayName = typeof item.displayName === 'string' ? item.displayName.trim() : '';
    if (!Number.isSafeInteger(playerId) || playerId <= 0 || !displayName || seen.has(playerId)) return [];
    seen.add(playerId);
    return [{ playerId, displayName, avatarUrl: typeof item.avatarUrl === 'string' ? item.avatarUrl : null }];
  });
}

export const PhiraAccountStore = createAccountListStore<PhiraAccountProfile>({
  storeKey: 'rranker.phira-accounts.v1',
  parse: parsePhiraAccounts,
  keyOf: (account) => account.playerId,
}).Store;
export const phiraAccountStore = new PhiraAccountStore();
