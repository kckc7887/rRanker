import { PHIGROS_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import { createDemoAccountStore, type DemoAccountProfile } from '@/storage/create-demo-account-store';

export type PhigrosDemoAccountProfile = DemoAccountProfile;

const { Store } = createDemoAccountStore({
  storeKey: 'rranker.phigros-demo-account.v1',
  isTestAccountId: isPhigrosDemoAccountId,
  saveErrorMessage: 'Phigros 示例账号名称不能为空',
});

export function isPhigrosDemoAccountId(accountId: string): boolean {
  return accountId === PHIGROS_TEST_ACCOUNT_ID;
}

export const PhigrosDemoAccountStore = Store;
