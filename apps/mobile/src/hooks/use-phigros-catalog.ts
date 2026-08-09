import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CatalogSnapshot } from '@/domain/models';
import { mapPhigrosKyouAliases } from '@/domain/phigros-kyou';
import { loadPhigrosKyouAliases } from '@/hooks/use-phigros-kyou';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { normalizeSearchText } from '@/utils/search';

function mergeAliases(existing: readonly string[] | undefined, incoming: readonly string[] | undefined): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const alias of [...(existing ?? []), ...(incoming ?? [])]) {
    const normalized = normalizeSearchText(alias.normalize('NFKC').trim());
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(alias.normalize('NFKC').trim());
  }
  return result;
}

export function usePhigrosCatalog() {
  const provider = useMemo(() => new PhigrosCatalogProvider(), []);
  return useQuery({
    queryKey: ['phigros-catalog'],
    queryFn: async (): Promise<{ snapshot: CatalogSnapshot; provider: PhigrosCatalogProvider }> => {
      provider.resetCatalogCache();
      const snapshot = await provider.getCatalog();
      try {
        const aliasSnapshot = await loadPhigrosKyouAliases();
        const aliases = new Map(mapPhigrosKyouAliases(aliasSnapshot, snapshot).aliases
          .map((item) => [item.songId, item.aliases]));
        return {
          snapshot: {
            ...snapshot,
            songs: snapshot.songs.map((song) => ({
              ...song,
              aliases: mergeAliases(song.aliases, aliases.get(song.id)),
            })),
            source: aliasSnapshot.source.isStale
              ? { ...snapshot.source, kind: 'cache', isStale: true, label: `${snapshot.source.label}（含缓存别名）` }
              : snapshot.source,
          },
          provider,
        };
      } catch {
        return {
          snapshot: { ...snapshot, source: { ...snapshot.source, label: `${snapshot.source.label}（别名暂不可用）` } },
          provider,
        };
      }
    },
  });
}
