import { CHUNITHM_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import { createDemoAccountStore, type DemoAccountProfile } from '@/storage/create-demo-account-store';

export type ChunithmDemoAccountProfile = DemoAccountProfile;

const { parse, Store } = createDemoAccountStore({
  storeKey: 'rranker.chunithm-demo-account.v1',
  isTestAccountId: isChunithmDemoAccountId,
  saveErrorMessage: '中二节奏示例账号名称不能为空',
});

export const DEFAULT_CHUNITHM_DEMO_PLAYER_NAME = '示例账号';

export function isChunithmDemoAccountId(accountId: string): boolean {
  return accountId === CHUNITHM_TEST_ACCOUNT_ID;
}

export const parseChunithmDemoAccountProfile = parse;
export const ChunithmDemoAccountStore = Store;

export const chunithmDemoAccountStore = new ChunithmDemoAccountStore();
