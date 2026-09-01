export type CachePersistence = 'durable' | 'session-only' | 'temporary' | 'bounded-cache' | 'versioned-asset';

export const COMPRESSED_IMAGE_CACHE_DIRECTORY_NAME = 'rranker-remote-image-cache-v1';

/**
 * 公开数据与查询派生数据只在 React Query 会话内存活。
 * 这里同时作为升级清理、存储统计与后续持久化审计的唯一键表。
 */
const SESSION_ONLY_RESOURCE_KEYS = new Set([
  'detailed-catalog',
  'aliases',
  'plates',
  'collections',
  'dxrating-chart-tags',
  'chunithm-catalog',
  'chunithm-aliases',
  'phigros-kyou-aliases',
  'phigros-kyou-chart-tags',
  'musedash:albums',
  'musedash:ce',
  'musedash:diffdiff',
  'tuf:difficulties',
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

/** 统计、清理、升级迁移共同使用的缓存策略注册表。 */
export const CACHE_POLICY_REGISTRY: readonly CachePolicyRegistration[] = [
  { id: 'account-snapshots', persistence: 'durable', scope: '账号资料、核心成绩与个人曲库' },
  { id: 'public-query-data', persistence: 'session-only', scope: '公开曲库、别名、详情、分页与派生结果' },
  { id: 'task-files', persistence: 'temporary', scope: '成绩图与谱面确认会话文件' },
  { id: 'remote-images', persistence: 'bounded-cache', scope: '压缩后的歌曲封面与常用图片' },
  { id: 'runtime-assets', persistence: 'versioned-asset', scope: '当前版本字体与 UI 素材' },
] as const;

export function resourceCachePersistence(key: string): CachePersistence {
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
  return !isBoundedCacheEntry(name) && (name.startsWith('rranker-') || name.startsWith('rRanker-'));
}

export function isBoundedCacheEntry(name: string): boolean {
  return name === COMPRESSED_IMAGE_CACHE_DIRECTORY_NAME;
}
