import { useQuery } from '@tanstack/react-query';
import type { DataSource } from '@/domain/models';
import { cacheFirstLoad } from '@/services/cache-first';

interface Sourced {
  source: DataSource;
}

/**
 * 「主曲库 + 别名资源」合并后的 source 组装公共口径：
 * 任一资源以缓存兜底时打缓存标（kind=cache、isStale=true 并追加 stale 后缀）；
 * 别名拉取失败时仅追加 aliasMissing 后缀；其余保持主资源 source 原样。
 * includeCatalogStale=false 时主资源自身的 isStale 不参与判定（Phigros 现状口径）。
 */
export function aliasedCatalogSource<TCatalog extends Sourced, TAlias extends Sourced>(
  catalog: TCatalog,
  aliasSnapshot: TAlias | undefined,
  labels: { stale: string; aliasMissing: string },
  options?: { includeCatalogStale?: boolean },
): DataSource {
  if ((options?.includeCatalogStale !== false && catalog.source.isStale) || aliasSnapshot?.source.isStale) {
    return { ...catalog.source, kind: 'cache', isStale: true, label: `${catalog.source.label}${labels.stale}` };
  }
  if (!aliasSnapshot) {
    return { ...catalog.source, label: `${catalog.source.label}${labels.aliasMissing}` };
  }
  return catalog.source;
}

/**
 * 「主曲库 + 别名资源」查询的公共骨架：缓存优先渲染（cacheFirstLoad），
 * 后台拉取主曲库与别名并合并；别名失败仅降级打标，主曲库失败照常抛错。
 * 各游戏差异（资源 key/版本、queryKey、别名形态与合并函数、source 文案）全部由参数表达。
 */
export type AliasedCatalogOptions<TCatalog extends Sourced, TAlias extends Sourced, TData> = {
  queryKey: readonly unknown[];
  enabled?: boolean;
  /** 本地缓存读取（可含别名缓存合并）；返回 null 时直接走网络。 */
  loadCached: () => Promise<TCatalog | null>;
  /** 主曲库新鲜加载（含持久化回写与网络失败兜底，由各游戏自行组合）。 */
  loadCatalog: (signal?: AbortSignal) => Promise<TCatalog>;
  /** 别名资源新鲜加载；失败时主曲库照常返回并打「别名暂不可用」标。 */
  loadAliases: (signal?: AbortSignal) => Promise<TAlias>;
  /** 把别名合并进曲库（缓存与新鲜两条路径共用）。 */
  mergeAliases: (catalog: TCatalog, aliasSnapshot: TAlias | undefined) => TCatalog;
  /** source 组装（缓存兜底/别名缺失打标文案由各游戏传入）。 */
  composeSource: (catalog: TCatalog, aliasSnapshot: TAlias | undefined) => DataSource;
  /** 查询数据包装（如 Phigros 附加 provider 实例）；缺省恒等。 */
  wrapData?: (catalog: TCatalog) => TData;
  /** 后台刷新成功后的静默回写。 */
  onFresh: (data: TData) => void;
};

export async function loadAliasedCatalog<
  TCatalog extends Sourced,
  TAlias extends Sourced,
  TData = TCatalog,
>(
  options: AliasedCatalogOptions<TCatalog, TAlias, TData>,
  signal?: AbortSignal,
): Promise<TData> {
  const loadFresh = async (): Promise<TCatalog> => {
    const catalog = await options.loadCatalog(signal);
    const aliasResult = await Promise.allSettled([options.loadAliases(signal)]);
    const aliasSnapshot = aliasResult[0].status === 'fulfilled' ? aliasResult[0].value : undefined;
    const merged = options.mergeAliases(catalog, aliasSnapshot);
    return { ...merged, source: options.composeSource(catalog, aliasSnapshot) };
  };
  // 缺省 wrapData 时调用方未包装，TData 恒为 TCatalog 本身，此断言运行时为恒等。
  const wrapData = options.wrapData ?? ((catalog: TCatalog) => catalog as unknown as TData);
  const catalog = await cacheFirstLoad({
    loadCached: options.loadCached,
    loadFresh,
    onFresh: (fresh) => options.onFresh(wrapData(fresh)),
    signal,
  });
  return wrapData(catalog);
}

export function useAliasedCatalog<TCatalog extends Sourced, TAlias extends Sourced, TData = TCatalog>(
  options: AliasedCatalogOptions<TCatalog, TAlias, TData>,
) {
  return useQuery({
    enabled: options.enabled,
    queryKey: options.queryKey,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) => loadAliasedCatalog(options, signal),
  });
}
