import type { QueryClient } from '@tanstack/react-query';
import { ensureRizlineCatalog } from './rizline-catalog-query';
import { ensurePhigrosCatalog } from './phigros-catalog-query';
import { ensureChunithmCatalog } from './chunithm-catalog-query';
import { ensureMaimaiCatalog } from './maimai-catalog-query';
import { ensureMuseDashAlbums, ensureMuseDashDiffdiff } from './muse-dash-query';
import type { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import type { DetailedCatalogProvider } from '@/providers/contracts';
/** 查询适配层提供的曲库端口；加载器不接触查询客户端。 */
export function gameDataCatalogQueries(client: QueryClient) {
  return {
    rizline: () => ensureRizlineCatalog(client),
    phigros: (provider: PhigrosCatalogProvider) => ensurePhigrosCatalog(client, provider),
    chunithm: () => ensureChunithmCatalog(client),
    maimai: (provider: DetailedCatalogProvider) => ensureMaimaiCatalog(client, provider),
    museDashAlbums: () => ensureMuseDashAlbums(client),
    museDashDiffdiff: () => ensureMuseDashDiffdiff(client),
  };
}
export type GameDataCatalogQueries = ReturnType<typeof gameDataCatalogQueries>;
