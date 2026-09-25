import type { BoundAccount } from '@/domain/bound-account';
import type { AnyScoreProvider, DetailedCatalogProvider, ProviderSession } from '@/providers/contracts';
import type { LxnsTokenRotationUpdate } from '@/providers/lxns-oauth-request';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { EmptyCatalogProvider, EmptyScoreProvider } from '@/providers/empty-provider';
import { LxnsCatalogProvider } from '@/providers/lxns-catalog-provider';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { LocalMaimaiScoreProvider } from '@/providers/local-score-provider';
import { MaxedMaimaiTestProvider } from '@/providers/maxed-maimai-test-provider';
import { MaxedPhigrosTestProvider } from '@/providers/maxed-phigros-test-provider';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

/** 会话 Provider 对：成绩与详细曲库能力。 */
export type SessionProviders = { scoreProvider: AnyScoreProvider; catalogProvider: DetailedCatalogProvider };
/** 落雪轮换提交入口：账号 + 本次轮换消费的旧会话与结果，由凭据提交协调器校验世代后落盘。 */
export type LxnsTokenRotation = (accountId: string, update: LxnsTokenRotationUpdate) => void | Promise<unknown>;

/**
 * 本机 SQLite 仓储的依赖只在真正需要本地玩家时才加载：
 * 会话状态模块因此不会传递性加载数据库入口。
 */
type LocalSnapshotRepository = Pick<SqliteSnapshotRepository, 'initialize' | 'getLatest' | 'save' | 'clear'>;
let localRepository: LocalSnapshotRepository | null = null;

export function localSnapshotRepository(): LocalSnapshotRepository {
  localRepository ??= new SqliteSnapshotRepository();
  return localRepository;
}

/**
 * Phigros 会话不登记舞萌曲库详细能力（歌曲详情、别名、姓名框、收藏品）。
 * Phigros 曲库经 `hooks/use-phigros-catalog` 与游戏数据加载器各自读取，
 * 会话槽位显式声明「无此能力」，不再用断言把普通曲库伪装成详细曲库。
 */
const noDetailedCatalog = new EmptyCatalogProvider();
const EMPTY_PROVIDERS: SessionProviders = Object.freeze({
  scoreProvider: new EmptyScoreProvider(),
  catalogProvider: new EmptyCatalogProvider(),
});

/**
 * 账号绑定适配器：游戏差异（Provider 组合与构造参数）只保留在这里。
 * Provider resolver 按「账号 + 凭据版本」缓存本函数的返回值；Store 不调用 Provider 构造路径。
 */
export function createSessionProviders(
  account: BoundAccount | null,
  session: ProviderSession | null,
  onLxnsTokenRotation: LxnsTokenRotation,
): SessionProviders {
  if (!account?.providerId) return EMPTY_PROVIDERS;
  if (account.gameId === 'maimai') {
    const catalogProvider = new LxnsCatalogProvider();
    switch (account.providerId) {
      case 'local':
        return { scoreProvider: new LocalMaimaiScoreProvider(localSnapshotRepository(), account.id, account.displayName), catalogProvider };
      case 'maimai-test':
        return { scoreProvider: new MaxedMaimaiTestProvider(account.id, account.displayName), catalogProvider };
      case 'lxns':
        if (session?.mode === 'lxns-oauth') {
          return { scoreProvider: new LxnsScoreProvider(session, (update) => onLxnsTokenRotation(account.id, update)), catalogProvider };
        }
        break;
      case 'diving-fish':
        if (session) return { scoreProvider: new DivingFishProvider(session), catalogProvider };
        break;
    }
  }
  if (account.gameId === 'phigros') {
    if (account.providerId === 'phigros-test') {
      return { scoreProvider: new MaxedPhigrosTestProvider(account.displayName), catalogProvider: noDetailedCatalog };
    }
    if (session?.mode === 'phi-session') {
      return { scoreProvider: new PhigrosScoreProvider(session), catalogProvider: noDetailedCatalog };
    }
  }
  return EMPTY_PROVIDERS;
}
