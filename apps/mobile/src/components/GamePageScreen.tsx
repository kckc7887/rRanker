import { getGameAdapter, getGameDefinition, isGameAvailable, usePluginRevision, type GamePage } from '@rranker/sdk';
import { EmptyDataView } from '@rranker/sdk/components/EmptyDataView';
import { useSession, UNBOUND_ACCOUNT_ID } from '@rranker/sdk/state/session-store';
import { useDebugStore } from '@rranker/sdk/state/debug-store';

export function GamePageScreen({ page }: { page: GamePage }) {
  usePluginRevision();
  const gameId = useSession(state => state.activeGameId);
  const accountId = useSession(state => state.activeAccountId);
  const examplesEnabled = useDebugStore(state => state.hydrated && state.testAccountsEnabled);
  if (page !== 'library' && accountId === UNBOUND_ACCOUNT_ID) return <EmptyDataView title="暂无绑定账号" detail="请先在设置 → 游戏管理中绑定账号" showBindAction />;
  if (!isGameAvailable(gameId) || (getGameDefinition(gameId)?.fixture && !examplesEnabled)) {
    return <EmptyDataView title="游戏适配器不可用" detail="请在插件管理中启用游戏适配器。" />;
  }
  const Page = getGameAdapter(gameId)?.pages?.[page];
  return Page ? <Page gameId={gameId} accountId={accountId} params={{}} />
    : <EmptyDataView title="暂无内容" detail="当前游戏尚未提供此页面。" />;
}
