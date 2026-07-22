/** 本地舞萌账号成绩只存在本机 SQLite，不可当作可清缓存。 */
const LOCAL_PREFIX = 'maimai:local';

export function isDurableMaimaiAccountId(accountId: string): boolean {
  return accountId === LOCAL_PREFIX || accountId.startsWith(`${LOCAL_PREFIX}:`);
}
