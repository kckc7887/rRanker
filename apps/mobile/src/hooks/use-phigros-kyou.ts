import { useQuery } from '@tanstack/react-query';
import {
  PHIGROS_KYOU_TAGS_RESOURCE_KEY,
} from '@/domain/phigros-kyou';
import { PhigrosKyouProvider } from '@/providers/phigros-kyou-provider';
import { useSession } from '@/state/session-store';
import { useCachedTabActive } from '@/components/CachedTabScreen';

const provider = new PhigrosKyouProvider();
const KYOU_STALE_TIME_MS = 60 * 60 * 1000;
let aliasesLoadedAt = 0;
let aliasesPromise: ReturnType<PhigrosKyouProvider['getAliases']> | null = null;

export function loadPhigrosKyouAliases() {
  if (aliasesPromise && Date.now() - aliasesLoadedAt < KYOU_STALE_TIME_MS) return aliasesPromise;
  aliasesPromise = provider.getAliases();
  aliasesLoadedAt = Date.now();
  aliasesPromise.catch(() => {
    aliasesPromise = null;
    aliasesLoadedAt = 0;
  });
  return aliasesPromise;
}

/** 清缓存后重置模块级别名缓存，避免旧 promise 在 1 小时 stale 期内继续返回已清掉的数据。 */
export function resetPhigrosKyouAliasesCache(): void {
  aliasesPromise = null;
  aliasesLoadedAt = 0;
}

export function usePhigrosKyouChartTags(enabled = true) {
  const tabActive = useCachedTabActive();
  const activeGameId = useSession((state) => state.activeGameId);
  return useQuery({
    enabled: enabled && tabActive && activeGameId === 'phigros',
    queryKey: [PHIGROS_KYOU_TAGS_RESOURCE_KEY],
    queryFn: () => provider.getChartTags(),
    staleTime: KYOU_STALE_TIME_MS,
  });
}
