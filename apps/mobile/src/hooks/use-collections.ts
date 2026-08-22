import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/state/session-store';

/** 落雪称号/头像/姓名框/背景完整列表（含 required，账号无关的全局公开资源）。 */
export function useCollections() {
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  const queryKey = ['collections', activeAccountId, activeGameId];
  return useQuery({
    enabled: activeGameId === 'maimai',
    queryKey,
    queryFn: () => provider.getCollections(),
  });
}
