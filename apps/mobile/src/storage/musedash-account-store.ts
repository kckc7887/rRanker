import { assertAccountListEnvelope } from '@/storage/create-demo-account-store';
import { createAccountListStore } from '@/storage/create-account-list-store';

export type MuseDashAccountProfile = { userId: string; displayName: string };

function parseMuseDashAccounts(value: unknown): MuseDashAccountProfile[] {
  const { accounts } = assertAccountListEnvelope(value);
  const seen = new Set<string>();
  return accounts.flatMap((entry): MuseDashAccountProfile[] => {
    if (!entry || typeof entry !== 'object') throw new TypeError('不支持的账号目录');
    const item = entry as { userId?: unknown; displayName?: unknown };
    const displayName = typeof item.displayName === 'string' ? item.displayName.trim() : '';
    if (typeof item.userId !== 'string' || !item.userId.trim() || !displayName) throw new TypeError('不支持的账号目录');
    const userId = item.userId.trim();
    if (seen.has(userId)) throw new TypeError('不支持的账号目录');
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
