import { MAIMAI_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import { assertAccountListEnvelope } from '@/storage/create-demo-account-store';
import { createAccountListStore } from '@/storage/create-account-list-store';

export type DemoAccountProfile = {
  id: string;
  displayName: string;
};

export function isMaimaiDemoAccountId(accountId: string): boolean {
  return accountId === MAIMAI_TEST_ACCOUNT_ID
    || accountId.startsWith(`${MAIMAI_TEST_ACCOUNT_ID}:`);
}

function parseDemoAccountProfiles(value: unknown): DemoAccountProfile[] {
  const { accounts } = assertAccountListEnvelope(value);
  const seen = new Set<string>();
  const profiles: DemoAccountProfile[] = [];
  for (const candidate of accounts) {
    if (!candidate || typeof candidate !== 'object') throw new TypeError('不支持的账号目录');
    const account = candidate as { id?: unknown; displayName?: unknown };
    if (typeof account.id !== 'string' || !isMaimaiDemoAccountId(account.id) || seen.has(account.id)) throw new TypeError('不支持的账号目录');
    const displayName = typeof account.displayName === 'string' ? account.displayName.trim() : '';
    if (!displayName) throw new TypeError('不支持的账号目录');
    seen.add(account.id);
    profiles.push({ id: account.id, displayName });
  }
  return profiles;
}

export const DemoAccountStore = createAccountListStore<DemoAccountProfile>({
  storeKey: 'rranker.maimai-demo-accounts.v1',
  parse: parseDemoAccountProfiles,
  keyOf: profile => profile.id,
  normalize: profile => {
    const displayName = profile.displayName.trim();
    if (!isMaimaiDemoAccountId(profile.id) || !displayName) throw new Error('示例账号名称不能为空');
    return { id: profile.id, displayName };
  },
}).Store;
