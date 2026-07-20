import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/state/session-store';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import type { PhigrosScoreEntry } from '@/domain/phigros';
import { buildSearchDocument } from '@/utils/search';

export type PhigrosRecordEntry = {
  entry: PhigrosScoreEntry;
  catalogTitle: string;
  searchDoc: { text: string; compact: string };
};

export function usePhigrosRecords() {
  const scoreProvider = useSession((s) => s.scoreProvider);

  return useQuery({
    queryKey: ['phigros-records'],
    queryFn: async (): Promise<PhigrosRecordEntry[]> => {
      if (!(scoreProvider instanceof PhigrosScoreProvider)) return [];

      const catalogProvider = new PhigrosCatalogProvider();
      const [b30, catalog] = await Promise.all([
        scoreProvider.getB30(),
        catalogProvider.getCatalog(),
      ]);

      const titleMap = new Map(catalog.songs.map((s) => [s.id, s.title]));

      const result: PhigrosRecordEntry[] = [];
      for (const entry of b30.best27) {
        const title = titleMap.get(entry.songId) ?? entry.songId;
        const document = buildSearchDocument([entry.songId, title]);
        result.push({ entry, catalogTitle: title, searchDoc: document });
      }
      return result;
    },
  });
}
