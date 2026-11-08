import { getGameAdapter, getGameDefinition, isGameAvailable, usePluginRevision } from '@rranker/sdk';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useVisibleBoundAccounts } from '@rranker/sdk/hooks/use-visible-bound-accounts';
import { useDebugStore } from '@rranker/sdk/state/debug-store';
import { useSession } from '@rranker/sdk/state/session-store';
import { EmptyDataView } from '@rranker/sdk/components/EmptyDataView';
import { AccountSwitchSheet } from '@rranker/sdk/components/AccountSwitchSheet';
import { QueryStateView } from '@rranker/sdk/components/QueryStateView';
import { useNotification } from '@rranker/sdk/components/AppNotification';
import { StackScreenActivityScope } from '@rranker/sdk/components/CachedTabScreen';
import { findGame, type GameId } from '@rranker/sdk/domain/game-bind-options';
import { switchBoundAccount, notifyAccountSwitchError } from '@rranker/sdk/services/switch-bound-account';

export default function SongDetailScreen() {
  return <StackScreenActivityScope><SongDetailContent /></StackScreenActivityScope>;
}

function SongDetailContent() {
  usePluginRevision();
  const activeGameId = useSession(state => state.activeGameId);
  const accountId = useSession(state => state.activeAccountId);
  const examplesEnabled = useDebugStore(state => state.hydrated && state.testAccountsEnabled);
  const raw = useLocalSearchParams<Record<string, string | string[]>>();
  const params: Record<string, string> = {};
  let duplicated = false;
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      if (value.length !== 1) duplicated = true;
      else params[key] = value[0];
    } else if (value !== undefined) params[key] = value;
  }
  const { gameId, ...target } = params;
  const adapter = gameId ? getGameAdapter(gameId) : undefined;
  const resolved = !duplicated && adapter ? adapter.parseDetailParams(gameId, target) : null;
  if (!resolved) return <EmptyDataView title="无法打开谱面" detail="这一条谱面定位信息无法识别，请返回列表重新进入。" />;
  if (!isGameAvailable(gameId) || (getGameDefinition(gameId)?.fixture && !examplesEnabled)) {
    return <EmptyDataView title="游戏适配器不可用" detail="请在插件管理中启用游戏适配器。" />;
  }
  if (gameId !== activeGameId) return <DetailGameSwitch gameId={gameId} />;
  const Page = adapter?.pages?.detail;
  return Page ? <Page gameId={gameId} accountId={accountId} params={resolved} />
    : <EmptyDataView title="无法打开谱面" detail="当前游戏尚未提供详情页。" />;
}

function DetailGameSwitch({ gameId }: { gameId: GameId }) {
  const accounts = useVisibleBoundAccounts().filter(account => account.gameId === gameId);
  const activeAccountId = useSession(state => state.activeAccountId);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState<GameId | null>(gameId);
  const { showNotification } = useNotification();
  if (!accounts.length) return <EmptyDataView title="需要绑定游戏账号"
    detail={`此链接属于${findGame(gameId)?.title ?? gameId}，绑定该游戏账号后可继续打开。`} showBindAction />;
  return <>
    <QueryStateView isLoading={false} isError={false} isEmpty data={undefined} renderData={() => <></>}
      emptyText={`此链接属于${findGame(gameId)?.title ?? gameId}，请选择该游戏账号继续。`}
      emptyActionLabel="选择账号继续" onEmptyAction={() => setVisible(true)} />
    <AccountSwitchSheet visible={visible} accounts={accounts} expandedGameId={expanded} activeAccountId={activeAccountId}
      onClose={() => setVisible(false)} onToggleGame={id => setExpanded(current => current === id ? null : id)}
      onSelectAccount={account => {
        setVisible(false);
        void switchBoundAccount(account.id, { navigateToOverview: false })
          .catch(error => notifyAccountSwitchError(error, showNotification));
      }} />
  </>;
}
