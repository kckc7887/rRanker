import { PinnedChunithmCollectionCards } from '@/components/chunithm/ChunithmOverviewPins';
import { PinnedPlateCards } from '@/components/maimai/MaimaiOverviewPins';
import { overviewDisplayName,overviewRatingCard,syncProviderHint } from '@/features/game-content/adapters/overview-presentation';
import { overviewStyles as styles } from '@/features/overview/overview-styles';
import { useOverviewOperation } from '@/hooks/use-overview-operation';
import { useOverviewSync } from '@/hooks/use-overview-sync';
import { useOverviewUpload } from '@/hooks/use-overview-upload';

import { AccountSwitchSheet } from '@/components/AccountSwitchSheet';
import { useNotification } from '@/components/AppNotification';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { ChunithmSyncGuideSheet } from '@/components/chunithm/ChunithmSyncGuideSheet';
import { DxRatingCard } from '@/components/DxRatingCard';
import { EmptyDataView } from '@/components/EmptyDataView';
import { MaimaiSyncGuideContent } from '@/components/maimai/MaimaiSyncGuideSheet';
import { MaimaiUploadTabs } from '@/components/maimai/MaimaiUploadTabs';
import { OsuRatingTag } from '@/components/osu/OsuRatingTag';
import { QueryStateView } from '@/components/QueryStateView';
import { UploadDataSheet } from '@/components/UploadDataSheet';
import { router,type Href } from 'expo-router';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { InteractionManager,Pressable,RefreshControl,ScrollView,Text,View } from 'react-native';

import type { BoundAccount } from '@/domain/bound-account';

import { type GameDataBundle } from '@/domain/game-data';
import { selectGameTools,summarizeGameTools } from '@/domain/game-toolbox';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useGameData } from '@/hooks/use-game-data';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';

import { notifyAccountSwitchError,switchBoundAccount } from '@/services/switch-bound-account';

import { compactUploadPhaseLabel } from '@/services/upload-maimai-from-friend-code';

import { useUserLibrary } from '@/hooks/use-user-library';
import { useGamePickerUi } from '@/state/game-picker-ui';

import { applyLxnsTokenRotation,UNBOUND_ACCOUNT_ID,useSession } from '@/state/session-store';
import { useToolboxPins } from '@/state/toolbox-pins';

import { isOsuGameId } from '@/domain/game-mode-family';
import { useAppTheme } from '@/theme/app-theme';

export default function OverviewTabScreen() {
  return <CachedTabScreen><OverviewScreen /></CachedTabScreen>;
}

export function OverviewScreen() {
  return <PublicOverviewScreen />;
}

function PublicOverviewScreen() {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const gameQuery = useGameData();
  const { data, isLoading, isError, error, refetch, profile } = gameQuery;
  const library = useUserLibrary();
  const catalogQuery = useDetailedCatalog();
  const { data: catalogData, refetch: refetchCatalog } = catalogQuery;
  const requestUploadCatalog = useCallback(async () => (
    catalogData ?? (await refetchCatalog()).data
  ), [catalogData, refetchCatalog]);
  const tabBottomInset = useNativeTabBottomInset();
  const boundAccounts = useSession((s) => s.boundAccounts);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const activeGameId = useSession((s) => s.activeGameId);
  const activeSession = useSession((s) => s.session);
  const sessionsByAccountId = useSession((s) => s.sessionsByAccountId);
  const { busy: syncBusy, operation } = useOverviewOperation();
  const { syncData, refreshing } = useOverviewSync({ boundAccounts, activeAccountId, activeGameId, activeSession, catalogQuery, gameQuery, operation });
  const { uploadVisible, maimaiUploadPage, setMaimaiUploadPage, maimaiSourceAccountId, setMaimaiSourceAccountId,
    maimaiTransferTargetIds, setMaimaiTransferTargetIds, chunithmSyncGuideVisible, setChunithmSyncGuideVisible,
    uploadPhase, setUploadPhase, maimaiLxnsSources, maimaiTransferTargets, maimaiLxnsGuideAvailable,
    friendCodeUploadBusy, showingMaimaiSyncGuide, currentUploadSelection, finishUpload, syncMaimaiFromLxns,
    openUpload, closeUpload, openChunithmUpload } = useOverviewUpload({ boundAccounts, activeAccountId, activeGameId,
      sessionsByAccountId, catalogQuery, ratingDigits: profile.ratingDigits, syncBusy, operation });
  const isUnbound = activeAccountId === UNBOUND_ACCOUNT_ID;
  const expandedGameId = useGamePickerUi((s) => s.expandedGameId);
  const setExpandedGameId = useGamePickerUi((s) => s.setExpandedGameId);
  const toggleExpandedGameId = useGamePickerUi((s) => s.toggleExpandedGameId);
  const [pickerVisible, setPickerVisible] = useState(false);
  const accountSwitchTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);
  const renderableData = data?.payload && typeof data.payload === 'object' ? data : undefined;
  const favorites = library.data?.filter((item) => item.kind === 'song' && item.favorite).length ?? 0;
  const practice = library.data?.filter((item) => item.kind === 'chart' && item.practice).length ?? 0;
  const toolboxGameId = data?.gameId ?? activeGameId;
  const pinnedToolIds = useToolboxPins((s) => s.pinnedToolIdsByGame[toolboxGameId]);
  const pinnedPlateIds = useToolboxPins((s) => s.pinnedPlateIdsByGame[toolboxGameId]);
  const pinnedCollectionIds = useToolboxPins((s) => s.pinnedCollectionIdsByGame[toolboxGameId]);
  const hydratePins = useToolboxPins((s) => s.hydrate);
  const pinnedTools = useMemo(
    () => selectGameTools(toolboxGameId, pinnedToolIds),
    [pinnedToolIds, toolboxGameId],
  );

  useEffect(() => {
    void hydratePins();
  }, [hydratePins]);

  useEffect(() => () => {
    accountSwitchTaskRef.current?.cancel();
    accountSwitchTaskRef.current = null;
  }, []);

  const openSwitchSheet = () => {
    const active = boundAccounts.find((account) => account.id === activeAccountId);
    setExpandedGameId(active?.gameId ?? null);
    setPickerVisible(true);
  };

  const onSelectAccount = (account: BoundAccount) => {
    setPickerVisible(false);
    accountSwitchTaskRef.current?.cancel();
    accountSwitchTaskRef.current = InteractionManager.runAfterInteractions(() => {
      accountSwitchTaskRef.current = null;
      // 已在总览账号页：弹层退场后复用目标账号缓存并切换。
      void Promise.resolve(switchBoundAccount(account.id, { navigateToOverview: false }))
        .catch(error => notifyAccountSwitchError(error, showNotification));
    });
  };

  if (isUnbound) {
    return <EmptyDataView title="暂无绑定账号" detail="请先在设置 → 游戏管理中绑定账号" showBindAction />;
  }

  return (
    <View collapsable={false} style={[styles.page, { backgroundColor: theme.background }]}>
      <QueryStateView<GameDataBundle>
        isLoading={isLoading}
        isError={isError}
        isEmpty={Boolean(data && !renderableData)}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        emptyText={activeGameId === 'adofai'
          ? '请在游戏管理中绑定 TUF 玩家'
          : activeGameId === 'musedash'
            ? '请在游戏管理中绑定喵斯快跑玩家'
            : '暂无数据'}
        data={renderableData}
        renderData={(bundle) => (
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            style={styles.scroll}
            testID="overview-scroll"
            alwaysBounceVertical
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (
              bundle.providerId === 'local' ? openUpload() : void syncData()
            )}
              tintColor={theme.accent} colors={[theme.accent]} />}
            contentContainerStyle={[styles.content, { paddingBottom: tabBottomInset + 20 }]}
            scrollIndicatorInsets={{ bottom: tabBottomInset }}
          >
            <Text style={styles.eyebrow}>{bundle.profile.title} · 玩家概览</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`当前玩家 ${overviewDisplayName(bundle)}，点击切换账号`}
              onPress={openSwitchSheet}
              style={({ pressed }) => [styles.nameRow, pressed && styles.nameRowPressed]}
            >
              <Text style={[styles.name, { color: theme.text }]}>{overviewDisplayName(bundle)}</Text>
              <Text style={styles.switchHint}>·点击切换·</Text>
            </Pressable>

            <DxRatingCard {...overviewRatingCard(bundle)} />

            {bundle.payload.kind === 'maimai' && bundle.providerId === 'local' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`同步本地查分器数据，${compactUploadPhaseLabel(uploadPhase)}`}
                onPress={openUpload}
                style={({ pressed }) => [styles.syncButton, { backgroundColor: theme.accent }, pressed && styles.syncPressed]}
              >
                <Text style={[styles.syncText, { color: theme.onAccent }]}>同步数据</Text>
                <Text style={[styles.actionHint, { color: theme.onAccent, opacity: 0.75 }]}>{compactUploadPhaseLabel(uploadPhase)}</Text>
              </Pressable>
            ) : bundle.payload.kind === 'maimai' ? (
              <View style={[styles.actionRow, { backgroundColor: theme.accent }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`上传数据，${compactUploadPhaseLabel(uploadPhase)}`}
                  onPress={openUpload}
                  style={({ pressed }) => [styles.actionHalf, pressed && styles.syncPressed]}
                >
                  <Text style={[styles.syncText, { color: theme.onAccent }]}>上传数据</Text>
                  <Text style={[styles.actionHint, { color: theme.onAccent, opacity: 0.75 }]}>{compactUploadPhaseLabel(uploadPhase)}</Text>
                </Pressable>
                <View style={[styles.actionDivider, { backgroundColor: theme.onAccent, opacity: 0.35 }]} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`同步数据，当前 ${syncProviderHint(bundle.providerId)}`}
                  disabled={syncBusy}
                  onPress={() => void syncData()}
                  style={({ pressed }) => [
                    styles.actionHalf,
                    pressed && styles.syncPressed,
                    syncBusy && styles.syncDisabled,
                  ]}
                >
                  <Text style={[styles.syncText, { color: theme.onAccent }]}>{syncBusy ? '同步中…' : '同步数据'}</Text>
                  <Text style={[styles.actionHint, { color: theme.onAccent, opacity: 0.75 }]}>{syncProviderHint(bundle.providerId)}</Text>
                </Pressable>
              </View>
            ) : bundle.payload.kind === 'chunithm' ? (
              <View style={[styles.actionRow, { backgroundColor: theme.accent }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="上传数据，打开同步引导"
                  onPress={openChunithmUpload}
                  style={({ pressed }) => [styles.actionHalf, pressed && styles.syncPressed]}
                >
                  <Text style={[styles.syncText, { color: theme.onAccent }]}>上传数据</Text>
                  <Text style={[styles.actionHint, { color: theme.onAccent, opacity: 0.75 }]}>同步引导</Text>
                </Pressable>
                <View style={[styles.actionDivider, { backgroundColor: theme.onAccent, opacity: 0.35 }]} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`同步数据，当前 ${syncProviderHint(bundle.providerId)}`}
                  disabled={syncBusy}
                  onPress={() => void syncData()}
                  style={({ pressed }) => [
                    styles.actionHalf,
                    pressed && styles.syncPressed,
                    syncBusy && styles.syncDisabled,
                  ]}
                >
                  <Text style={[styles.syncText, { color: theme.onAccent }]}>{syncBusy ? '同步中…' : '同步数据'}</Text>
                  <Text style={[styles.actionHint, { color: theme.onAccent, opacity: 0.75 }]}>{syncProviderHint(bundle.providerId)}</Text>
                </Pressable>
              </View>
            ) : bundle.gameId === 'chunithm' ? (
              <View style={[styles.card, { backgroundColor: theme.surface }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>请绑定落雪账号</Text>
                <Text style={[styles.body, { color: theme.textSecondary }]}>前往游戏管理绑定后，即可同步中二节奏成绩。</Text>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`同步数据，当前 ${syncProviderHint(bundle.providerId)}`}
                disabled={syncBusy}
                onPress={() => void syncData()}
                style={({ pressed }) => [styles.syncButton, { backgroundColor: theme.accent }, pressed && styles.syncPressed, syncBusy && styles.syncDisabled]}
              >
                <Text style={[styles.syncText, { color: theme.onAccent }]}>{syncBusy ? '同步中…' : '同步数据'}</Text>
                <Text style={[styles.actionHint, { color: theme.onAccent, opacity: 0.75 }]}>{syncProviderHint(bundle.providerId)}</Text>
              </Pressable>
            )}

            {bundle.payload.kind === 'rizline' && bundle.payload.requiresLogin ? (
              <Text style={[styles.body, { color: theme.textSecondary }]}>登录已失效，请在游戏管理中重新绑定账号。</Text>
            ) : null}

            {bundle.payload.kind === 'maimai' && pinnedPlateIds.length ? (
              <PinnedPlateCards plateIds={pinnedPlateIds} records={bundle.payload.records} />
            ) : null}

            {bundle.payload.kind === 'chunithm' && pinnedCollectionIds.length ? (
              <PinnedChunithmCollectionCards pinned={pinnedCollectionIds} scores={bundle.payload.scores} />
            ) : null}

            {pinnedTools.map((tool) => (
              <Pressable
                key={tool.id}
                testID={`overview-pinned-tool-${tool.id}`}
                accessibilityRole="button"
                accessibilityLabel={`打开置顶工具 ${tool.title}`}
                onPress={() => router.push(tool.href as Href)}
              >
                <View style={[styles.card, styles.pinnedToolCard, { backgroundColor: theme.surface }]}>
                  <Text style={styles.pinnedToolEyebrow}>置顶工具</Text>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>{tool.title}</Text>
                  <Text style={[styles.body, { color: theme.textSecondary }]}>{tool.detail}</Text>
                  <Text style={[styles.toolLink, { color: theme.accent }]}>打开 →</Text>
                </View>
              </Pressable>
            ))}

            {bundle.profile.capabilities.hasTools ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/tools' as Href)}>
                <View style={[styles.card, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>工具箱</Text>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.body, { color: theme.textSecondary }]}>
                    {summarizeGameTools(bundle.gameId)}
                  </Text>
                  <Text style={[styles.toolLink, { color: theme.accent }]}>打开工具箱 →</Text>
                </View>
              </Pressable>
            ) : null}

            <Pressable accessibilityRole="button" onPress={() => router.push('/library' as Href)}>
              <View style={[styles.card, { backgroundColor: theme.surface }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>我的曲库</Text>
                <Text style={[styles.body, { color: theme.textSecondary }]}>
                  {bundle.payload.kind === 'maimai'
                    || bundle.payload.kind === 'phigros'
                    || bundle.payload.kind === 'chunithm'
                    || bundle.payload.kind === 'adofai'
                    || bundle.payload.kind === 'musedash'
                    || bundle.payload.kind === 'rizline'
              || bundle.payload.kind === 'majdata-net'
                    || bundle.payload.kind === 'phira'
                    || bundle.payload.kind === 'osu'
                    ? (library.isError
                        ? '个人数据暂不可用'
                        : bundle.payload.kind === 'adofai' || bundle.payload.kind === 'phira'
                          ? `收藏 ${favorites} 首`
                          : `收藏 ${favorites} 首 · 练习 ${practice} 张`)
                    : '当前游戏暂未开放个人曲库'}
                </Text>
                <Text style={[styles.toolLink, { color: theme.accent }]}>打开收藏与练习清单 →</Text>
              </View>
            </Pressable>

          </ScrollView>
        )}
      />

      <AccountSwitchSheet
        visible={pickerVisible}
        accounts={boundAccounts}
        expandedGameId={expandedGameId}
        activeAccountId={activeAccountId}
        onClose={() => setPickerVisible(false)}
        onToggleGame={toggleExpandedGameId}
        onSelectAccount={onSelectAccount}
        renderRatingTag={(account) => (
          account.providerId === 'osu' && isOsuGameId(account.gameId)
            ? <OsuRatingTag display={account.scoreDisplay} />
            : null
        )}
      />

      <UploadDataSheet
        visible={uploadVisible}
        accounts={boundAccounts}
        sessionsByAccountId={sessionsByAccountId}
        catalog={catalogData}
        requestCatalog={requestUploadCatalog}
        onClose={closeUpload}
        onPhaseChange={setUploadPhase}
        onFinished={finishUpload}
        temporarySelectedAccountIds={currentUploadSelection}
        onLxnsTokensRotated={applyLxnsTokenRotation}
        headerAccessory={maimaiLxnsGuideAvailable ? (
          <MaimaiUploadTabs
            value={maimaiUploadPage}
            disabled={friendCodeUploadBusy || syncBusy}
            onChange={setMaimaiUploadPage}
          />
        ) : undefined}
        contentOverride={showingMaimaiSyncGuide ? (
          <MaimaiSyncGuideContent
            syncing={syncBusy}
            sourceAccounts={maimaiLxnsSources}
            targets={maimaiTransferTargets}
            selectedSourceAccountId={maimaiSourceAccountId}
            selectedTargetAccountIds={maimaiTransferTargetIds}
            onSelectSource={(accountId) => {
              setMaimaiSourceAccountId(accountId);
              setMaimaiTransferTargetIds((ids) => ids.filter((id) => id !== accountId));
            }}
            onToggleTarget={(accountId) => {
              setMaimaiTransferTargetIds((ids) => (
                ids.includes(accountId)
                  ? ids.filter((id) => id !== accountId)
                  : [...ids, accountId]
              ));
            }}
            onClose={closeUpload}
            onSync={syncMaimaiFromLxns}
          />
        ) : undefined}
        uploadMethod={maimaiLxnsGuideAvailable && maimaiUploadPage === 'qr' ? 'qr' : 'friend_code'}
        externalBusy={showingMaimaiSyncGuide && syncBusy}
      />
      <ChunithmSyncGuideSheet
        visible={chunithmSyncGuideVisible}
        syncing={syncBusy}
        onClose={() => setChunithmSyncGuideVisible(false)}
        onSync={syncData}
      />
    </View>
  );
}
