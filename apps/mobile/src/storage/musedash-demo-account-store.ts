import { MUSEDASH_TEST_ACCOUNT_ID } from '@/domain/bound-account';
import { createDemoAccountStore, type DemoAccountProfile } from '@/storage/create-demo-account-store';

export type MuseDashDemoAccountProfile = DemoAccountProfile;

const { parse, Store } = createDemoAccountStore({
  storeKey: 'rranker.musedash-demo-account.v1',
  isTestAccountId: isMuseDashDemoAccountId,
  saveErrorMessage: '喵斯快跑示例账号名称不能为空',
});

export const DEFAULT_MUSEDASH_DEMO_PLAYER_NAME = '示例账号';

export function isMuseDashDemoAccountId(accountId: string): boolean {
  return accountId === MUSEDASH_TEST_ACCOUNT_ID;
}

export const parseMuseDashDemoAccountProfile = parse;
export const MuseDashDemoAccountStore = Store;

export const museDashDemoAccountStore = new MuseDashDemoAccountStore();
