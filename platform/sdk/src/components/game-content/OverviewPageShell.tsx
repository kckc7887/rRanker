import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { getDataSource, getGameTools, getOverviewActions, getOverviewCards, usePluginRevision } from '@rranker/sdk';
import type { GameDataBundle } from '@rranker/sdk/data';
import type { BoundAccount } from '@rranker/sdk/account';
import { AccountSwitchSheet } from '@rranker/sdk/components/AccountSwitchSheet';
import { RatingCard } from '@rranker/sdk/components/RatingCard';
import { QueryStateView } from '@rranker/sdk/components/QueryStateView';
import { useNotification } from '@rranker/sdk/components/AppNotification';
import { selectGameTools, summarizeGameTools } from '@rranker/sdk/domain/game-toolbox';
import { overviewStyles as styles } from '@rranker/sdk/features/overview/overview-styles';
import type { useGameData } from '@rranker/sdk/hooks/use-game-data';
import { useNativeTabBottomInset } from '@rranker/sdk/hooks/use-native-tab-bottom-inset';
import { useOverviewOperation } from '@rranker/sdk/hooks/use-overview-operation';
import { useOverviewSync } from '@rranker/sdk/hooks/use-overview-sync';
import { useUserLibrary } from '@rranker/sdk/hooks/use-user-library';
import { useVisibleBoundAccounts } from '@rranker/sdk/hooks/use-visible-bound-accounts';
import { notifyAccountSwitchError, switchBoundAccount } from '@rranker/sdk/services/switch-bound-account';
import { scheduleIdleTask } from '@rranker/sdk/state/app-lifecycle';
import { useGamePickerUi } from '@rranker/sdk/state/game-picker-ui';
import { useSession } from '@rranker/sdk/state/session-store';
import { useToolboxPins } from '@rranker/sdk/state/toolbox-pins';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';

export type OverviewPresentation = {
  displayName: string;
  ratingCard?: ComponentProps<typeof RatingCard>;
  librarySummary?: 'songs' | 'charts';
  notice?: string;
  emptyText?: string;
  isEmpty?: boolean;
};

export function OverviewPageShell({ query, displayName, ratingCard, librarySummary = 'charts', notice, emptyText = '暂无数据', isEmpty = false }:
  OverviewPresentation & { query: ReturnType<typeof useGameData> }) {
  usePluginRevision();
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const { busy: syncBusy, operation } = useOverviewOperation();
  const { syncData, refreshing } = useOverviewSync({ gameQuery: query, operation });
  const library = useUserLibrary();
  const tabBottomInset = useNativeTabBottomInset();
  const accounts = useVisibleBoundAccounts();
  const gameId = useSession(state => state.activeGameId);
  const activeAccountId = useSession(state => state.activeAccountId);
  const expandedGameId = useGamePickerUi(state => state.expandedGameId);
  const setExpandedGameId = useGamePickerUi(state => state.setExpandedGameId);
  const toggleExpandedGameId = useGamePickerUi(state => state.toggleExpandedGameId);
  const pinnedToolIds = useToolboxPins(state => state.pinsByGame)[gameId] ?? [];
  const hydratePins = useToolboxPins(state => state.hydrate);
  const pinnedTools = selectGameTools(gameId, pinnedToolIds ?? []);
  const [pickerVisible, setPickerVisible] = useState(false);
  const accountSwitchTask = useRef<(() => void) | null>(null);
  const refreshAction = useRef<(() => void) | null>(null);
  const registerRefresh = useCallback((action: () => void) => {
    refreshAction.current = action;
    return () => { if (refreshAction.current === action) refreshAction.current = null; };
  }, []);
  useEffect(() => { void hydratePins(); }, [hydratePins]);
  useEffect(() => () => { accountSwitchTask.current?.(); }, []);
  const openSwitchSheet = () => {
    setExpandedGameId(accounts.find(account => account.id === activeAccountId)?.gameId ?? null);
    setPickerVisible(true);
  };
  const onSelectAccount = (account: BoundAccount) => {
    setPickerVisible(false);
    accountSwitchTask.current?.();
    accountSwitchTask.current = scheduleIdleTask(() => {
      accountSwitchTask.current = null;
      void switchBoundAccount(account.id, { navigateToOverview: false })
        .catch(error => notifyAccountSwitchError(error, showNotification));
    });
  };
  const favorites = library.data?.filter(item => item.kind === 'song' && item.favorite).length ?? 0;
  const practice = library.data?.filter(item => item.kind === 'chart' && item.practice).length ?? 0;
  const Actions = getOverviewActions(gameId);
  const cards = getOverviewCards(gameId);
  const source = query.data?.providerId ? getDataSource(query.data.providerId) : undefined;
  const sourceHint = source?.bindingKind === 'fixture' ? '示例查分器' : source?.title ?? '本地';
  return <View collapsable={false} style={[styles.page, { backgroundColor: theme.background }]}>
    <QueryStateView<GameDataBundle> isLoading={query.isLoading} isError={query.isError} error={query.error}
      isEmpty={isEmpty} onRetry={() => void query.refetch()} emptyText={emptyText} data={isEmpty ? undefined : query.data}
      renderData={bundle => <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.scroll} testID="overview-scroll"
        alwaysBounceVertical refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          if (refreshAction.current) refreshAction.current(); else void syncData();
        }} tintColor={theme.accent} colors={[theme.accent]} />}
        contentContainerStyle={[styles.content, { paddingBottom: tabBottomInset + 20 }]} scrollIndicatorInsets={{ bottom: tabBottomInset }}>
        <Text style={styles.eyebrow}>{bundle.profile.title} · 玩家概览</Text>
        <Pressable accessibilityLabel={`当前玩家 ${displayName}，点击切换账号`} onPress={openSwitchSheet}
          style={({ pressed }) => [styles.nameRow, pressed && styles.nameRowPressed]}>
          <Text style={[styles.name, { color: theme.text }]}>{displayName}</Text><Text style={styles.switchHint}>·点击切换·</Text>
        </Pressable>
        <RatingCard {...(ratingCard ?? { label: bundle.profile.ratingLabel, display: '—', meta: '当前游戏暂未提供评分' })} />
        {Actions ? <Actions bundle={bundle} syncBusy={syncBusy} onSync={syncData} operation={operation} registerRefresh={registerRefresh} />
          : <Pressable accessibilityLabel={`同步数据，当前 ${sourceHint}`} disabled={syncBusy} onPress={() => void syncData()}
            style={({ pressed }) => [styles.syncButton, { backgroundColor: theme.accent }, pressed && styles.syncPressed, syncBusy && styles.syncDisabled]}>
            <Text style={[styles.syncText, { color: theme.onAccent }]}>{syncBusy ? '同步中…' : '同步数据'}</Text>
            <Text style={[styles.actionHint, { color: theme.onAccent, opacity: 0.75 }]}>{sourceHint}</Text>
          </Pressable>}
        {notice ? <Text style={[styles.body, { color: theme.textSecondary }]}>{notice}</Text> : null}
        {cards.map((Cards, index) => <Cards key={index} bundle={bundle} />)}
        {pinnedTools.map(tool => <Pressable key={tool.id} testID={`overview-pinned-tool-${tool.id}`}
          accessibilityLabel={`打开置顶工具 ${tool.title}`} onPress={() => router.push(tool.href as Href)}>
          <View style={[styles.card, styles.pinnedToolCard, { backgroundColor: theme.surface }]}>
            <Text style={styles.pinnedToolEyebrow}>置顶工具</Text><Text style={[styles.cardTitle, { color: theme.text }]}>{tool.title}</Text>
            <Text style={[styles.body, { color: theme.textSecondary }]}>{tool.detail}</Text><Text style={[styles.toolLink, { color: theme.accent }]}>打开 →</Text>
          </View>
        </Pressable>)}
        {getGameTools(gameId).length ? <Pressable onPress={() => router.push('/tools' as Href)}>
          <View style={[styles.card, { backgroundColor: theme.surface }]}><Text style={[styles.cardTitle, { color: theme.text }]}>工具箱</Text>
            <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.body, { color: theme.textSecondary }]}>{summarizeGameTools(gameId)}</Text>
            <Text style={[styles.toolLink, { color: theme.accent }]}>打开工具箱 →</Text>
          </View>
        </Pressable> : null}
        <Pressable onPress={() => router.push('/library' as Href)}><View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>我的曲库</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{library.isError ? '个人数据暂不可用' : librarySummary === 'songs'
            ? `收藏 ${favorites} 首` : `收藏 ${favorites} 首 · 练习 ${practice} 张`}</Text>
          <Text style={[styles.toolLink, { color: theme.accent }]}>打开收藏与练习清单 →</Text>
        </View></Pressable>
      </ScrollView>} />
    <AccountSwitchSheet visible={pickerVisible} accounts={accounts} expandedGameId={expandedGameId} activeAccountId={activeAccountId}
      onClose={() => setPickerVisible(false)} onToggleGame={toggleExpandedGameId} onSelectAccount={onSelectAccount} />
  </View>;
}
