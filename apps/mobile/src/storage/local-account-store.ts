import { isLocalMaimaiAccountId } from '@/domain/bound-account';
import { assertAccountListEnvelope } from '@/storage/create-demo-account-store';
import { createAccountListStore } from '@/storage/create-account-list-store';

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

function parseLocalAccountProfiles(value: unknown): LocalAccountProfile[] {
  const { accounts } = assertAccountListEnvelope(value);
  const seen = new Set<string>();
  const profiles: LocalAccountProfile[] = [];
  for (const candidate of accounts) {
    if (!candidate || typeof candidate !== 'object') throw new TypeError('不支持的账号目录');
    const account = candidate as { id?: unknown; displayName?: unknown };
    if (typeof account.id !== 'string' || !isLocalMaimaiAccountId(account.id) || seen.has(account.id)) throw new TypeError('不支持的账号目录');
    const displayName = typeof account.displayName === 'string'
      ? normalizeLocalPlayerName(account.displayName)
      : null;
    if (!displayName) throw new TypeError('不支持的账号目录');
    seen.add(account.id);
    profiles.push({ id: account.id, displayName });
  }
  return profiles;
}

export const LocalAccountStore = createAccountListStore<LocalAccountProfile>({
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
}).Store;
