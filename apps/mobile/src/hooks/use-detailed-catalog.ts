import { useQuery } from '@tanstack/react-query';
import type { CatalogSnapshot } from '@/domain/models';
import { ResourceService } from '@/services/resource-service';
import { useSession } from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();

export function useDetailedCatalog() {
  const session = useSession((state) => state.session);
  const provider = useSession((state) => state.catalogProvider);
  return useQuery({
    queryKey: ['detailed-catalog', session?.mode ?? 'fixture'],
    queryFn: async (): Promise<CatalogSnapshot> => {
      const service = new ResourceService(session ? repository : undefined);
      const catalog = await service.load('detailed-catalog', 2, () => provider.getDetailedCatalog());
      const aliasResult = await Promise.allSettled([
        service.load('aliases', 1, () => provider.getAliases()),
      ]);
      const aliasSnapshot = aliasResult[0].status === 'fulfilled' ? aliasResult[0].value : undefined;
      const aliases = new Map(aliasSnapshot?.aliases.map((item) => [item.songId, item.aliases]) ?? []);
      return {
        ...catalog,
        songs: catalog.songs.map((song) => ({ ...song, aliases: aliases.get(song.id) ?? [] })),
        source: catalog.source.isStale || aliasSnapshot?.source.isStale
          ? { ...catalog.source, kind: 'cache', isStale: true, label: `${catalog.source.label}（含缓存资源）` }
          : !aliasSnapshot ? { ...catalog.source, label: `${catalog.source.label}（别名暂不可用）` } : catalog.source,
      };
    },
  });
}
