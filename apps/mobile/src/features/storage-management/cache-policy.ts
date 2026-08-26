export type CachePersistence = 'durable' | 'session-only' | 'temporary' | 'versioned-asset';

const DURABLE_PUBLIC_RESOURCE_KEYS = new Set([
  'aliases',
  'dxrating-chart-tags',
  'chunithm-catalog',
  'chunithm-alias',
  'phigros-catalog',
  'phigros-kyou-aliases',
  'phigros-kyou-chart-tags',
  'musedash:albums',
  'musedash:ce',
  'musedash:diffdiff',
  'tuf:difficulties',
  'tuf:levels:home',
  'phira:charts:ranked:0:',
]);

const DURABLE_PUBLIC_RESOURCE_PREFIXES = [
  'osu-catalog-home:',
] as const;

/**
 * 搜索、后续分页、详情与查询派生数据只在 React Query 会话内存活。
 * 这里同时作为升级清理、存储统计与后续持久化审计的唯一键表。
 */
const SESSION_ONLY_RESOURCE_KEYS = new Set([
  'detailed-catalog',
  'plates',
  'collections',
]);

const SESSION_ONLY_RESOURCE_PREFIXES = [
  'chunithm-song-detail:',
  'chunithm-collections:',
  'tuf:passes:',
  'tuf:levels:',
  'tuf:level:',
  'musedash:detail:',
  'phira:charts:',
  'phira:chart:',
  'phira:notes:',
] as const;

export type CachePolicyRegistration = {
  id: string;
  persistence: CachePersistence;
  scope: string;
};

/** 统计、清理、升级迁移共同使用的四类策略注册表。 */
export const CACHE_POLICY_REGISTRY: readonly CachePolicyRegistration[] = [
  { id: 'account-snapshots', persistence: 'durable', scope: '账号资料、核心成绩与个人曲库' },
  { id: 'catalog-home', persistence: 'durable', scope: '曲库首页与列表展示所需资源' },
  { id: 'public-query-data', persistence: 'session-only', scope: '搜索、后续分页、详情与派生结果' },
  { id: 'task-files', persistence: 'temporary', scope: '成绩图与谱面确认会话文件' },
  { id: 'runtime-assets', persistence: 'versioned-asset', scope: '当前版本字体与 UI 素材' },
] as const;

export function resourceCachePersistence(key: string): CachePersistence {
  if (DURABLE_PUBLIC_RESOURCE_KEYS.has(key)
    || DURABLE_PUBLIC_RESOURCE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return 'durable';
  }
  if (SESSION_ONLY_RESOURCE_KEYS.has(key)) return 'session-only';
  if (SESSION_ONLY_RESOURCE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return 'session-only';
  }
  return 'durable';
}

export function isSessionOnlyResourceKey(key: string): boolean {
  return resourceCachePersistence(key) === 'session-only';
}

/** rRanker 自有的会话文件；异常退出时允许下次启动直接回收。 */
export function isTemporaryCacheEntry(name: string): boolean {
  return name.startsWith('rranker-') || name.startsWith('rRanker-');
}
