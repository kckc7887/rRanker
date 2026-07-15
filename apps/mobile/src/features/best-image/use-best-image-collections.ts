import { useQuery } from '@tanstack/react-query';
import { LxnsCatalogProvider } from '@/providers/lxns-catalog-provider';

const provider = new LxnsCatalogProvider();

/** 成绩图片自选素材：直接读取落雪公共头像、姓名框、称号和背景完整列表。 */
export function useBestImageCollections() {
  return useQuery({
    queryKey: ['best-image-collections', 'lxns', 'maimai'],
    queryFn: () => provider.getCollections({
      kinds: ['icon', 'plate', 'trophy', 'frame'],
      required: false,
    }),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: 2,
  });
}
