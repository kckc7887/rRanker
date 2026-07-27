import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { AccountSwitchSheet } from '@/components/AccountSwitchSheet';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { DxRatingCard } from '@/components/DxRatingCard';
import { PlateProgressCard } from '@/components/PlateProgressCard';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import { UploadDataSheet } from '@/components/UploadDataSheet';
import { ChunithmSyncGuideSheet } from '@/components/chunithm/ChunithmSyncGuideSheet';
import { useNotification } from '@/components/AppNotification';
import type { BoundAccount } from '@/domain/bound-account';
import { averageChunithmRating } from '@/domain/chunithm-score-presentation';
import { formatPlayerScore, type BestListSection, type GameDataBundle } from '@/domain/game-data';
import type { ProviderId } from '@/domain/game-bind-options';
import { formatPhigrosChallengeBadge, resolvePhigrosChallengeTheme } from '@/domain/phigros-challenge-theme';
import { selectGameTools, summarizeGameTools } from '@/domain/game-toolbox';
import { calculatePlateProgress } from '@/domain/plates';
import type { ScoreRecord } from '@/domain/models';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { useGameData } from '@/hooks/use-game-data';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { usePlates } from '@/hooks/use-plates';
import { invalidateAccountDataQueries } from '@/services/invalidate-account-data';
import { switchBoundAccount } from '@/services/switch-bound-account';
import { refreshDivingFishAccounts } from '@/services/refresh-diving-fish-accounts';
import {
  compactUploadPhaseLabel,
  type UploadPhase,
  type UploadResult,
} from '@/services/upload-maimai-from-friend-code';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useGamePickerUi } from '@/state/game-picker-ui';
import { queryClient } from '@/state/query-client';
import { applyLxnsTokenRotation, useSession } from '@/state/session-store';
import { useToolboxPins } from '@/state/toolbox-pins';
import { isMaimaiMaintenanceWindow, MAIMAI_MAINTENANCE_MESSAGE } from '@/domain/maimai-maintenance';
import { useAppTheme } from '@/theme/app-theme';

export default function OverviewTabScreen() {
  return <CachedTabScreen><OverviewScreen /></CachedTabScreen>;
}

export function OverviewScreen() {
  const { showNotification } = useNotification();
  const theme = useAppTheme();
  const { data, isLoading, isError, error, refetch, profile } = useGameData();
  const library = useUserLibrary();
  const { data: catalogData, error: catalogError, refetch: refetchCatalog } = useDetailedCatalog();
  const chunithmCatalog = useChunithmCatalog();
  const tabBottomInset = useNativeTabBottomInset();
  const boundAccounts = useSession((s) => s.boundAccounts);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const activeGameId = useSession((s) => s.activeGameId);
  const activeSession = useSession((s) => s.session);
  const sessionsByAccountId = useSession((s) => s.sessionsByAccountId);
  const updateBoundAccountScore = useSession((s) => s.updateBoundAccountScore);
  const expandedGameId = useGamePickerUi((s) => s.expandedGameId);
  const setExpandedGameId = useGamePickerUi((s) => s.setExpandedGameId);
  const toggleExpandedGameId = useGamePickerUi((s) => s.toggleExpandedGameId);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [uploadVisible, setUploadVisible] = useState(false);
  const [chunithmSyncGuideVisible, setChunithmSyncGuideVisible] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>({ kind: 'idle' });
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const refreshingRef = useRef(false);
  const favorites = library.data?.filter((item) => item.kind === 'song' && item.favorite).length ?? 0;
  const practice = library.data?.filter((item) => item.kind === 'chart' && item.practice).length ?? 0;
  const syncBusy = syncing;
  const currentUploadSelection = useMemo(() => [activeAccountId], [activeAccountId]);
  const toolboxGameId = data?.gameId ?? activeGameId;
  const pinnedToolIds = useToolboxPins((s) => s.pinnedToolIdsByGame[toolboxGameId]);
  const pinnedPlateIds = useToolboxPins((s) => s.pinnedPlateIdsByGame[toolboxGameId]);
  const hydratePins = useToolboxPins((s) => s.hydrate);
  const pinnedTools = useMemo(
    () => selectGameTools(toolboxGameId, pinnedToolIds),
    [pinnedToolIds, toolboxGameId],
  );

  useEffect(() => {
    void hydratePins();
  }, [hydratePins]);

  const syncData = useCallback(async (): Promise<boolean> => {
    if (refreshingRef.current) return false;
    refreshingRef.current = true;
    setRefreshing(true);
    setSyncing(true);
    try {
      // 用户主动同步优先，终止登录后仍可能在后台运行的同账号自动刷新。
      await queryClient.cancelQueries({ queryKey: ['game-data'] });
      const account = boundAccounts.find((item) => item.id === activeAccountId);
      if (account?.providerId === 'diving-fish'
        && activeSession?.mode === 'import-token') {
        const catalog = catalogData ?? (await refetchCatalog()).data;
        if (!catalog) throw catalogError ?? new Error('舞萌曲库尚未就绪，请稍后重试');
        const result = await refreshDivingFishAccounts({
          accounts: [account],
          sessionsByAccountId: { [account.id]: activeSession },
          catalog,
        });
        const refreshed = result.refreshed[0];
        if (!refreshed) throw result.failed[0]?.error ?? new Error('水鱼账号同步失败');
        updateBoundAccountScore(
          account.id,
          formatPlayerScore(refreshed.snapshot.best50.rating, profile.ratingDigits),
          refreshed.snapshot.player.displayName,
        );
      }
      // 先把相关页面标为过期但不并发请求，再只刷新当前总览一次。
      await invalidateAccountDataQueries(queryClient, 'none');
      const refreshed = await refetch();
      if (activeGameId === 'chunithm') {
        const payload = refreshed.data?.payload;
        const isFreshChunithmData = payload?.kind === 'chunithm'
          && payload.hasSyncedData
          && !payload.source.isStale;
        if (!isFreshChunithmData) {
          showNotification({
            title: '尚未读取到新数据',
            message: payload?.kind === 'chunithm' && payload.source.isStale
              ? '本次仅读取到缓存，请关闭代理并检查网络后重试。'
              : '请确认微信已提示上传完成、代理已经关闭，再重试同步。',
            variant: 'warning',
          });
          return false;
        }
      }
      return true;
    } catch (syncError) {
      showNotification({
        title: '同步失败',
        message: syncError instanceof Error ? syncError.message : '暂时无法同步成绩，请稍后重试。',
        variant: 'error',
      });
      return false;
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setSyncing(false);
    }
  }, [activeAccountId, activeGameId, activeSession, boundAccounts, catalogData, catalogError, profile.ratingDigits,
    refetch, refetchCatalog, showNotification, updateBoundAccountScore]);

  const finishUpload = useCallback(async (result: UploadResult) => {
    for (const refreshed of result.refreshedAccounts) {
      updateBoundAccountScore(
        refreshed.account.id,
        formatPlayerScore(refreshed.snapshot.best50.rating, profile.ratingDigits),
        refreshed.snapshot.player.displayName,
      );
    }
    // 刷新服务已先写入最新分账号快照；即使随后的网络读取失败，也会回退到这份新快照。
    await invalidateAccountDataQueries();
  }, [profile.ratingDigits, updateBoundAccountScore]);

  const openSwitchSheet = () => {
    const active = boundAccounts.find((account) => account.id === activeAccountId);
    setExpandedGameId(active?.gameId ?? null);
    setPickerVisible(true);
  };

  const onSelectAccount = (account: BoundAccount) => {
    setPickerVisible(false);
    // 已在总览账号页：只清缓存并切换，等待加载后展示。
    switchBoundAccount(account.id, { navigateToOverview: false });
  };

  const openUpload = () => {
    if (isMaimaiMaintenanceWindow()) {
      showNotification({ title: '游戏服务器维护中', message: MAIMAI_MAINTENANCE_MESSAGE, variant: 'warning' });
      return;
    }
    setUploadVisible(true);
  };

  const closeUpload = () => setUploadVisible(false);

  return (
    <View collapsable={false} style={[styles.page, { backgroundColor: theme.background }]}>
      <QueryStateView<GameDataBundle>
        isLoading={isLoading}
        isError={isError}
        isEmpty={false}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        data={data}
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
              accessibilityLabel={`当前玩家 ${displayName(bundle)}，点击切换账号`}
              onPress={openSwitchSheet}
              style={({ pressed }) => [styles.nameRow, pressed && styles.nameRowPressed]}
            >
              <Text style={[styles.name, { color: theme.text }]}>{displayName(bundle)}</Text>
              <Text style={styles.switchHint}>·点击切换·</Text>
            </Pressable>

            {bundle.payload.kind === 'maimai' || bundle.payload.kind === 'phigros' ? (
              <SourceStatus items={[
                { key: 'scores', label: bundle.payload.source.label, updatedAt: bundle.payload.source.updatedAt, state: bundle.payload.source.isStale ? 'cache' : 'live' },
                { key: 'catalog', label: bundle.payload.catalogSource.label, updatedAt: bundle.payload.catalogSource.updatedAt, state: bundle.payload.catalogSource.isStale ? 'cache' : 'live' },
              ]} />
            ) : bundle.payload.kind === 'chunithm' ? (
              <SourceStatus items={[
                {
                  key: 'scores',
                  label: bundle.payload.hasSyncedData
                    ? bundle.payload.source.label
                    : '落雪账号尚未同步中二数据',
                  updatedAt: bundle.payload.source.updatedAt,
                  state: bundle.payload.hasSyncedData
                    ? (bundle.payload.source.isStale ? 'cache' : 'live')
                    : 'unavailable',
                },
                {
                  key: 'catalog',
                  label: chunithmCatalog.data?.source.label
                    ?? (chunithmCatalog.isLoading
                      ? 'LXNS 中二节奏公共曲库加载中'
                      : 'LXNS 中二节奏公共曲库暂不可用'),
                  updatedAt: chunithmCatalog.data?.source.updatedAt,
                  state: chunithmCatalog.data
                    ? (chunithmCatalog.data.source.isStale ? 'cache' : 'live')
                    : 'unavailable',
                },
              ]} />
            ) : (
              <SourceStatus items={[
                {
                  key: 'scores',
                  label: bundle.gameId === 'chunithm' ? '成绩暂未接入' : '空',
                  state: 'unavailable',
                },
              ]} />
            )}

            {bundle.payload.kind === 'maimai'
              || bundle.payload.kind === 'phigros'
              || bundle.payload.kind === 'chunithm' ? (
              <DxRatingCard
                label={bundle.payload.playerScore.label}
                display={bundle.payload.playerScore.display}
                rating={bundle.payload.kind === 'chunithm' && !bundle.payload.hasSyncedData
                  ? null
                  : bundle.payload.playerScore.value}
                meta={bundle.payload.kind === 'chunithm'
                  ? formatChunithmBestMeta(bundle.payload.bestSections)
                  : formatBestSectionMeta(bundle.payload.bestSections, bundle.gameId)}
                themeOverride={bundle.payload.kind === 'phigros'
                  ? resolvePhigrosChallengeTheme(bundle.payload.challengeModeRank)
                  : undefined}
                sideBadge={bundle.payload.kind === 'phigros'
                  ? { title: '课题模式', value: formatPhigrosChallengeBadge(bundle.payload.challengeModeRank) }
                  : undefined}
              />
            ) : (
              <DxRatingCard
                label={profile.ratingLabel}
                display="—"
                rating={null}
                meta={bundle.gameId === 'chunithm' ? '临时账号不含成绩' : '当前游戏暂未提供评分'}
              />
            )}

            {bundle.payload.kind === 'maimai' && bundle.providerId === 'local' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`同步本地查分器数据，${compactUploadPhaseLabel(uploadPhase)}`}
                onPress={openUpload}
                style={({ pressed }) => [styles.syncButton, { backgroundColor: theme.accent }, pressed && styles.syncPressed]}
              >
                <Text style={styles.syncText}>同步数据</Text>
                <Text style={styles.actionHint}>{compactUploadPhaseLabel(uploadPhase)}</Text>
              </Pressable>
            ) : bundle.payload.kind === 'maimai' ? (
              <View style={[styles.actionRow, { backgroundColor: theme.accent }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`上传数据，${compactUploadPhaseLabel(uploadPhase)}`}
                  onPress={openUpload}
                  style={({ pressed }) => [styles.actionHalf, pressed && styles.syncPressed]}
                >
                  <Text style={styles.syncText}>上传数据</Text>
                  <Text style={styles.actionHint}>{compactUploadPhaseLabel(uploadPhase)}</Text>
                </Pressable>
                <View style={styles.actionDivider} />
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
                  <Text style={styles.syncText}>{syncBusy ? '同步中…' : '同步数据'}</Text>
                  <Text style={styles.actionHint}>{syncProviderHint(bundle.providerId)}</Text>
                </Pressable>
              </View>
            ) : bundle.payload.kind === 'chunithm' ? (
              <View style={[styles.actionRow, { backgroundColor: theme.accent }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="上传数据，打开同步引导"
                  onPress={() => setChunithmSyncGuideVisible(true)}
                  style={({ pressed }) => [styles.actionHalf, pressed && styles.syncPressed]}
                >
                  <Text style={styles.syncText}>上传数据</Text>
                  <Text style={styles.actionHint}>同步引导</Text>
                </Pressable>
                <View style={styles.actionDivider} />
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
                  <Text style={styles.syncText}>{syncBusy ? '同步中…' : '同步数据'}</Text>
                  <Text style={styles.actionHint}>{syncProviderHint(bundle.providerId)}</Text>
                </Pressable>
              </View>
            ) : bundle.gameId === 'chunithm' ? (
              <View style={[styles.card, { backgroundColor: theme.surface }]}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>临时账号不含成绩</Text>
                <Text style={[styles.body, { color: theme.textSecondary }]}>请在游戏管理中绑定落雪账号以同步中二节奏数据。</Text>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`同步数据，当前 ${syncProviderHint(bundle.providerId)}`}
                disabled={syncBusy}
                onPress={() => void syncData()}
                style={({ pressed }) => [styles.syncButton, { backgroundColor: theme.accent }, pressed && styles.syncPressed, syncBusy && styles.syncDisabled]}
              >
                <Text style={styles.syncText}>{syncBusy ? '同步中…' : '同步数据'}</Text>
                <Text style={styles.actionHint}>{syncProviderHint(bundle.providerId)}</Text>
              </Pressable>
            )}

            {bundle.payload.kind === 'maimai' && pinnedPlateIds.length ? (
              <PinnedPlateCards plateIds={pinnedPlateIds} records={bundle.payload.records} />
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

            {bundle.gameId !== 'chunithm' ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/library' as Href)}>
                <View style={[styles.card, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>我的曲库</Text>
                  <Text style={[styles.body, { color: theme.textSecondary }]}>
                    {bundle.payload.kind === 'maimai' || bundle.payload.kind === 'phigros'
                      ? (library.isError ? '个人数据暂不可用' : `收藏 ${favorites} 首 · 练习 ${practice} 张`)
                      : '当前游戏暂未开放个人曲库'}
                  </Text>
                  <Text style={[styles.toolLink, { color: theme.accent }]}>打开收藏与练习清单 →</Text>
                </View>
              </Pressable>
            ) : null}

            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>数据状态</Text>
              {bundle.payload.kind === 'maimai' || bundle.payload.kind === 'phigros' ? (
                <>
                  <Text style={[styles.body, { color: theme.textSecondary }]}>来源：{bundle.payload.source.label}</Text>
                  <Text style={[styles.body, { color: theme.textSecondary }]}>曲库：{bundle.payload.catalogSource.label}</Text>
                  {bundle.payload.kind === 'maimai' ? (
                    <Text style={[styles.body, { color: theme.textSecondary }]}>当前版本：{bundle.payload.currentVersionTitle}</Text>
                  ) : null}
                  <Text style={[styles.body, { color: theme.textSecondary }]}>更新时间：{new Date(bundle.payload.source.updatedAt).toLocaleString()}</Text>
                </>
              ) : bundle.payload.kind === 'chunithm' ? (
                <>
                  <Text style={[styles.body, { color: theme.textSecondary }]}>
                    来源：{bundle.payload.source.label}
                  </Text>
                  <Text style={[styles.body, { color: theme.textSecondary }]}>
                    曲库：{chunithmCatalog.data?.source.label
                      ?? (chunithmCatalog.isLoading
                        ? 'LXNS 中二节奏公共曲库加载中'
                        : 'LXNS 中二节奏公共曲库暂不可用')}
                  </Text>
                </>
              ) : (
                <Text style={[styles.body, { color: theme.textSecondary }]}>当前游戏暂未接入数据</Text>
              )}
            </View>
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
      />

      <UploadDataSheet
        visible={uploadVisible}
        accounts={boundAccounts}
        sessionsByAccountId={sessionsByAccountId}
        catalog={catalogData}
        onClose={closeUpload}
        onPhaseChange={setUploadPhase}
        onFinished={finishUpload}
        temporarySelectedAccountIds={currentUploadSelection}
        onLxnsTokensRotated={applyLxnsTokenRotation}
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

function PinnedPlateCards({ plateIds, records }: { plateIds: readonly number[]; records: readonly ScoreRecord[] }) {
  const plates = usePlates();
  const pinnedPlates = useMemo(() => {
    const plateById = new Map((plates.data?.plates ?? []).map((plate) => [plate.id, plate]));
    return plateIds.flatMap((plateId) => {
      const plate = plateById.get(plateId);
      return plate ? [plate] : [];
    });
  }, [plateIds, plates.data?.plates]);

  return pinnedPlates.map((plate) => (
    <Pressable
      key={plate.id}
      accessibilityRole="button"
      accessibilityLabel={`打开主页牌子 ${plate.name}`}
      onPress={() => router.push({
        pathname: '/tools/plates',
        params: { plateId: String(plate.id) },
      } as Href)}
    >
      <PlateProgressCard
        plate={plate}
        progress={calculatePlateProgress(plate, records)}
        eyebrow="牌子进度"
        testID={`overview-pinned-plate-${plate.id}`}
      />
    </Pressable>
  ));
}

function displayName(bundle: GameDataBundle): string {
  if (bundle.payload.kind === 'maimai') return bundle.payload.player.displayName;
  if (bundle.payload.kind === 'phigros') return bundle.payload.player.displayName;
  if (bundle.payload.kind === 'chunithm') {
    return bundle.payload.player?.name ?? '落雪账号（待同步）';
  }
  return bundle.payload.displayName;
}

function formatBestSectionMeta(sections: BestListSection[], gameId: GameDataBundle['gameId']): string {
  return sections.map((section) => {
    const label = section.id === 'b35'
      ? 'B35'
      : section.id === 'b15'
        ? 'B15'
        : section.id === 'b27'
          ? 'B27'
          : section.id === 'phi3'
            ? 'Phi3'
            : section.id.toUpperCase();
    if (gameId === 'phigros') {
      if (!section.records.length) return `${label} —`;
      if (section.id === 'phi3') {
        const avg = section.records.reduce((sum, r) => sum + r.difficultyConstant, 0) / section.records.length;
        return `${label} ${avg.toFixed(2)}`;
      }
      const avg = section.records.reduce((sum, r) => sum + r.rating, 0) / section.records.length;
      return `${label} ${avg.toFixed(2)}`;
    }
    const total = section.records.reduce((sum, record) => sum + record.rating, 0);
    return `${label} ${total}`;
  }).join(' · ');
}

/** 总览同步按钮副文案：当前成绩来源查分器。 */
function syncProviderHint(providerId: ProviderId | null): string {
  if (providerId === 'lxns') return '落雪咖啡屋';
  if (providerId === 'diving-fish') return '水鱼查分器';
  if (providerId === 'phi-taptap') return 'TapTap 云存档';
  if (providerId === 'local') return '本地查分器';
  if (providerId === 'maimai-test') return '示例查分器';
  if (providerId === 'chunithm-temp') return '无成绩临时账号';
  return '本地';
}

function formatChunithmBestMeta(
  sections: Extract<GameDataBundle['payload'], { kind: 'chunithm' }>['bestSections'],
): string {
  const best30 = sections.find((section) => section.id === 'b30');
  const new20 = sections.find((section) => section.id === 'new20');
  return `Best30 ${averageChunithmRating(best30?.scores ?? [])} · New20 ${averageChunithmRating(new20?.scores ?? [])}`;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  scroll: { flex: 1 },
  content: { padding: 20, gap: 16, flexGrow: 1 },
  eyebrow: { color: '#5B6472', fontSize: 13 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8, alignSelf: 'flex-start' },
  nameRowPressed: { opacity: 0.7 },
  name: { color: '#111827', fontSize: 28, fontWeight: '700' },
  switchHint: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  syncButton: {
    backgroundColor: '#246BFD',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    backgroundColor: '#246BFD',
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionHalf: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  actionDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.35)' },
  actionHint: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', lineHeight: 14 },
  syncPressed: { opacity: 0.88 },
  syncDisabled: { opacity: 0.65 },
  syncText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, gap: 8 },
  pinnedToolCard: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#AFC7FF' },
  pinnedToolEyebrow: { color: '#246BFD', fontSize: 12, fontWeight: '700' },
  cardTitle: { color: '#111827', fontSize: 18, fontWeight: '700' },
  body: { color: '#374151' },
  note: { color: '#6B7280', lineHeight: 20, marginTop: 4 },
  toolLink: { color: '#246BFD', fontWeight: '600', marginTop: 5 },
});
