import type { DataSource } from '@/domain/models';
import { cacheFirstLoad } from '@/services/cache-first';

interface Sourced {
  source: DataSource;
}

export function aliasedCatalogSource<TCatalog extends Sourced, TAlias extends Sourced>(
  catalog: TCatalog,
  aliasSnapshot: TAlias | undefined,
  labels: { stale: string; aliasMissing: string },
  options?: { includeCatalogStale?: boolean },
): DataSource {
  if ((options?.includeCatalogStale !== false && catalog.source.isStale) || aliasSnapshot?.source.isStale) {
    return { ...catalog.source, isStale: true, label: `${catalog.source.label}${labels.stale}` };
  }
  if (!aliasSnapshot) {
    return { ...catalog.source, label: `${catalog.source.label}${labels.aliasMissing}` };
  }
  return catalog.source;
}

export type AliasedCatalogOptions<TCatalog extends Sourced, TAlias extends Sourced, TData> = {
  queryKey: readonly unknown[];
  enabled?: boolean;
  retry?: boolean;
  loadCached: () => Promise<TCatalog | null>;
  loadCatalog: (signal?: AbortSignal) => Promise<TCatalog>;
  loadAliases: (signal?: AbortSignal) => Promise<TAlias>;
  mergeAliases: (catalog: TCatalog, aliasSnapshot: TAlias | undefined) => TCatalog;
  composeSource: (catalog: TCatalog, aliasSnapshot: TAlias | undefined) => DataSource;
  wrapData?: (catalog: TCatalog) => TData;
  onFresh: (data: TData) => unknown;
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
    const [catalog, aliasResult] = await Promise.all([
      options.loadCatalog(signal),
      Promise.allSettled([options.loadAliases(signal)]),
    ]);
    const aliasSnapshot = aliasResult[0].status === 'fulfilled' ? aliasResult[0].value : undefined;
    const merged = options.mergeAliases(catalog, aliasSnapshot);
    return { ...merged, source: options.composeSource(catalog, aliasSnapshot) };
  };
  const wrapData = options.wrapData ?? ((catalog: TCatalog) => catalog as unknown as TData);
  const catalog = await cacheFirstLoad({
    loadCached: options.loadCached,
    loadFresh,
    onFresh: (fresh) => options.onFresh(wrapData(fresh)),
    signal,
  });
  return wrapData(catalog);
}
