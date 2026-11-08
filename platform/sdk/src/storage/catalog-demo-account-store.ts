import { createDemoAccountStore } from '@rranker/sdk/storage/create-demo-account-store';

export function catalogDemoAccountStore(gameId: string) {
  const { Store } = createDemoAccountStore({
    storeKey: `rranker.${gameId}-demo-account.v1`,
    isTestAccountId: id => id === `${gameId}:test`,
    saveErrorMessage: '示例账号名称不能为空',
  });
  return new Store();
}
