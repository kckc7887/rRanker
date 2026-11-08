import type { BoundAccount } from '@rranker/sdk/account';
import type { AccountRemovalPlan } from '@rranker/sdk/plugins';
import { getDataSource } from '@rranker/sdk/registry';
import { SecureSessionStore } from '@rranker/sdk/storage/secure-session-store';
import { SqliteSnapshotRepository } from '@rranker/sdk/storage/sqlite-snapshot-repository';
import { UNBOUND_ACCOUNT_ID, useAccountStore } from '@rranker/sdk/state/account-store';

const sessions = new SecureSessionStore();
const snapshots = new SqliteSnapshotRepository();

export async function persistActiveAccountId(): Promise<void> {
  const id = useAccountStore.getState().selectedAccountId;
  await sessions.setActiveAccountId(!id || id === UNBOUND_ACCOUNT_ID ? null : id);
}

export async function clearBoundAccountData(account: BoundAccount, plan: AccountRemovalPlan): Promise<void> {
  const source = account.providerId ? getDataSource(account.providerId) : undefined;
  if (source?.removeAccount) await source.removeAccount(account, plan);
  else await plan.submit('凭据', () => sessions.removeAccount(account.id));
  await source?.cleanupAccount?.(account, plan.cleanup);
  await plan.cleanup('缓存', () => snapshots.clear(account.id));
}
