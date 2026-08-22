import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/state/session-store';

/** 仅舞萌姓名框（账号无关的全局公开资源，示例账号也命中缓存优先）。 */
export function usePlates(enabled = true) {
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  const queryKey = ['plates', activeAccountId, activeGameId];
  return useQuery({
    enabled: enabled && activeGameId === 'maimai',
    queryKey,
    queryFn: () => provider.getPlates(),
  });
}
