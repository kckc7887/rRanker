import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, type Href } from 'expo-router';
import { AccountSwitchSheet } from '@/components/AccountSwitchSheet';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { DxRatingCard } from '@/components/DxRatingCard';
import { EmptyDataView } from '@/components/EmptyDataView';
import { PlateProgressCard } from '@/components/PlateProgressCard';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import { UploadDataSheet } from '@/components/UploadDataSheet';
import { ChunithmSyncGuideSheet } from '@/components/chunithm/ChunithmSyncGuideSheet';
import { ChunithmCollectionImage } from '@/components/chunithm/ChunithmCollectionImage';
import { LayeredGradientBadge } from '@/components/LayeredGradientBadge';
import { MaimaiSyncGuideContent } from '@/components/maimai/MaimaiSyncGuideSheet';
import {
  MaimaiUploadTabs,
  type MaimaiUploadPage,
} from '@/components/maimai/MaimaiUploadTabs';
import { useNotification } from '@/components/AppNotification';
import type { BoundAccount } from '@/domain/bound-account';
import {
  CHUNITHM_MAINTENANCE_MESSAGE,
  isChunithmMaintenanceWindow,
} from '@/domain/chunithm-maintenance';
import {
  resolveChunithmRatingCardTheme,
  resolveChunithmRatingTier,
} from '@/domain/chunithm-rating-theme';
import { averageChunithmRating } from '@/domain/chunithm-score-presentation';
import { formatPlayerScore, type BestListSection, type GameDataBundle } from '@/domain/game-data';
import type { ProviderId } from '@/domain/game-bind-options';
import { resolveMaimaiCourseRank } from '@/domain/maimai-course-rank';
import { formatPhigrosChallengeBadge, resolvePhigrosChallengeTheme } from '@/domain/phigros-challenge-theme';
import { selectGameTools, summarizeGameTools } from '@/domain/game-toolbox';
import { calculatePlateProgress } from '@/domain/plates';
import type { ScoreRecord } from '@/domain/models';
import {
  calculateChunithmCollectionProgress,
  isChunithmCollectionComputable,
  type ChunithmCollection,
  type ChunithmCollectionKind,
} from '@/domain/chunithm-collections';
import type { ChunithmScore } from '@/domain/chunithm-personal';
import {
  normalizeTrophyTone,
  TROPHY_BADGE_THEMES,
} from '@/features/best-image/best-image-badge-theme';
import type { PinnedChunithmCollection } from '@/features/toolbox/pinned-tool-preferences';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { useChunithmCollections } from '@/hooks/use-chunithm-collections';
import { useGameData } from '@/hooks/use-game-data';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { usePlates } from '@/hooks/use-plates';
import { invalidateAccountDataQueries } from '@/services/invalidate-account-data';
import { switchBoundAccount } from '@/services/switch-bound-account';
import { refreshDivingFishAccounts } from '@/services/refresh-diving-fish-accounts';
import {
  compactUploadPhaseLabel,
  resolveUploadTargets,
  type UploadPhase,
  type UploadResult,
} from '@/services/upload-maimai-from-friend-code';
import {
  transferMaimaiFromLxns,
  type LxnsTransferPhase,
} from '@/services/transfer-maimai-from-lxns';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useGamePickerUi } from '@/state/game-picker-ui';
import { queryClient } from '@/state/query-client';
import { readSettledGameDataBundle } from '@/services/game-data-query';
import { awaitChunithmFresh } from '@/services/chunithm-personal-service';
import { awaitScoreFresh } from '@/services/score-service';
import { applyLxnsTokenRotation, UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
import { useToolboxPins } from '@/state/toolbox-pins';
import { isMaimaiMaintenanceWindow, MAIMAI_MAINTENANCE_MESSAGE } from '@/domain/maimai-maintenance';
import { useAppTheme } from '@/theme/app-theme';
import {
  formatTufOverviewRatingMeta, formatTufRankBadge, TUF_RATING_THEME,
} from '@/components/adofai/TufOverviewDetails';
import {
  formatMuseDashOverviewRatingMeta, MUSE_DASH_RATING_THEME,
} from '@/components/musedash/MuseDashOverviewDetails';

export default function OverviewTabScreen() {
  return <CachedTabScreen><OverviewScreen /></CachedTabScreen>;
}

export function OverviewScreen() {
  return <PublicOverviewScreen />;
}

function PublicOverviewScreen() {
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
  const isUnbound = activeAccountId === UNBOUND_ACCOUNT_ID;
  const expandedGameId = useGamePickerUi((s) => s.expandedGameId);
  const setExpandedGameId = useGamePickerUi((s) => s.setExpandedGameId);
  const toggleExpandedGameId = useGamePickerUi((s) => s.toggleExpandedGameId);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [uploadVisible, setUploadVisible] = useState(false);
  const [maimaiUploadPage, setMaimaiUploadPage] = useState<MaimaiUploadPage>('friend_code');
  const [maimaiSourceAccountId, setMaimaiSourceAccountId] = useState<string | null>(null);
  const [maimaiTransferTargetIds, setMaimaiTransferTargetIds] = useState<string[]>([]);
  const [chunithmSyncGuideVisible, setChunithmSyncGuideVisible] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>({ kind: 'idle' });
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const refreshingRef = useRef(false);
  const accountSwitchTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);
  const renderableData = data?.payload && typeof data.payload === 'object' ? data : undefined;
  const favorites = library.data?.filter((item) => item.kind === 'song' && item.favorite).length ?? 0;
  const practice = library.data?.filter((item) => item.kind === 'chart' && item.practice).length ?? 0;
  const syncBusy = syncing;
  const maimaiLxnsSources = useMemo(
    () => boundAccounts.filter((account) => (
      account.gameId === 'maimai'
      && account.providerId === 'lxns'
      && sessionsByAccountId[account.id]?.mode === 'lxns-oauth'
    )),
    [boundAccounts, sessionsByAccountId],
  );
  const maimaiTransferTargets = useMemo(
    () => resolveUploadTargets(boundAccounts, sessionsByAccountId),
    [boundAccounts, sessionsByAccountId],
  );
  const maimaiLxnsGuideAvailable = activeGameId === 'maimai';
  const friendCodeUploadBusy = !['idle', 'done', 'error'].includes(uploadPhase.kind);
  const showingMaimaiSyncGuide = maimaiLxnsGuideAvailable && maimaiUploadPage === 'lxns_guide';
  const currentUploadSelection = useMemo(() => [activeAccountId], [activeAccountId]);
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
      // 缓存优先下 refetch 会立即返回打标缓存；等同一账号后台网络读取落定后，以最终缓存判定。
      if (activeGameId === 'maimai') await awaitScoreFresh(activeAccountId);
      else if (activeGameId === 'chunithm') await awaitChunithmFresh(activeAccountId);
      const payload = readSettledGameDataBundle(
        activeAccountId,
        activeGameId,
        account?.providerId ?? null,
        activeSession?.mode ?? null,
      )?.payload ?? refreshed.data?.payload;
      if (activeGameId === 'maimai' && account?.providerId === 'lxns') {
        const isFreshMaimaiData = payload?.kind === 'maimai' && !payload.source.isStale;
        if (!isFreshMaimaiData) {
          showNotification({
            title: '尚未读取到新数据',
            message: payload?.kind === 'maimai' && payload.source.isStale
              ? '本次仅读取到缓存，请关闭代理并检查网络后重试。'
              : '请确认微信已完成上传、代理已经关闭，再重试同步。',
            variant: 'warning',
          });
          return false;
        }
      } else if (activeGameId === 'chunithm') {
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

  const syncMaimaiFromLxns = useCallback(async (): Promise<boolean> => {
    if (refreshingRef.current) return false;
    const sourceAccount = maimaiLxnsSources.find((account) => account.id === maimaiSourceAccountId);
    const sourceSession = sourceAccount
      ? sessionsByAccountId[sourceAccount.id]
      : undefined;
    const selected = maimaiTransferTargets.filter((target) => (
      target.account.id !== sourceAccount?.id
      && maimaiTransferTargetIds.includes(target.account.id)
      && target.writable
    ));
    if (!sourceAccount || sourceSession?.mode !== 'lxns-oauth') {
      showNotification({
        title: '请选择数据来源',
        message: '需要选择一个已授权的舞萌落雪账号。',
        variant: 'warning',
      });
      return false;
    }
    if (selected.length === 0) {
      showNotification({
        title: '请选择上传目标',
        message: '请至少勾选一个可写的查分器账号。',
        variant: 'warning',
      });
      return false;
    }

    refreshingRef.current = true;
    setSyncing(true);
    try {
      const catalog = catalogData ?? (await refetchCatalog()).data;
      if (!catalog) throw catalogError ?? new Error('舞萌曲库尚未就绪，请稍后重试');
      const phaseLabel = (phase: LxnsTransferPhase) => {
        if (phase.kind === 'reading') return `正在读取 ${phase.account.displayName} 的落雪成绩…`;
        if (phase.kind === 'refreshing') return `正在刷新 ${phase.account.displayName}…`;
        return `正在写入 ${phase.account.displayName}…`;
      };
      const result = await transferMaimaiFromLxns({
        sourceAccount,
        sourceSession,
        selected,
        sessionsByAccountId,
        catalog,
        onLxnsTokensRotated: applyLxnsTokenRotation,
        onPhase: (phase) => setUploadPhase({
          kind: phase.kind === 'refreshing' ? 'syncing' : 'uploading',
          message: phaseLabel(phase),
          providerTitle: phase.account.providerTitle,
        }),
      });
      await finishUpload(result);

      const failed = result.targetResults.filter((target) => target.status === 'failed');
      if (failed.length > 0) {
        showNotification({
          title: failed.length === result.targetResults.length ? '传输失败' : '部分传输完成',
          message: failed.map((target) => (
            `${target.account.displayName}：${target.errorMessage ?? '写入失败'}`
          )).join('；'),
          variant: failed.length === result.targetResults.length ? 'error' : 'warning',
        });
        setUploadPhase({
          kind: 'error',
          message: failed.length === result.targetResults.length
            ? '所有目标均写入失败'
            : `部分完成，${failed.length} 个目标失败`,
        });
        return false;
      }

      const refreshWarning = result.failedAccountNames.length > 0
        ? `；${result.failedAccountNames.join('、')}的应用内快照刷新失败`
        : '';
      showNotification({
        title: '传输完成',
        message: `已从 ${sourceAccount.displayName} 向 ${selected.length} 个账号写入 ${result.uploaded} 条成绩${refreshWarning}`,
        variant: result.failedAccountNames.length > 0 ? 'warning' : 'success',
      });
      setUploadPhase({
        kind: 'done',
        message: `传输完成：写入 ${result.uploaded} 条`,
        uploaded: result.uploaded,
        skipped: result.skipped,
      });
      return true;
    } catch (transferError) {
      const message = transferError instanceof Error
        ? transferError.message
        : '暂时无法传输成绩，请稍后重试。';
      setUploadPhase({ kind: 'error', message });
      showNotification({ title: '传输失败', message, variant: 'error' });
      return false;
    } finally {
      refreshingRef.current = false;
      setSyncing(false);
    }
  }, [
    catalogData,
    catalogError,
    finishUpload,
    maimaiLxnsSources,
    maimaiSourceAccountId,
    maimaiTransferTargetIds,
    maimaiTransferTargets,
    refetchCatalog,
    sessionsByAccountId,
    showNotification,
  ]);

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
      switchBoundAccount(account.id, { navigateToOverview: false });
    });
  };

  const openUpload = () => {
    if (isMaimaiMaintenanceWindow()) {
      showNotification({ title: '游戏服务器维护中', message: MAIMAI_MAINTENANCE_MESSAGE, variant: 'warning' });
      return;
    }
    const activeSource = maimaiLxnsSources.find((account) => account.id === activeAccountId);
    const sourceId = activeSource?.id ?? maimaiLxnsSources[0]?.id ?? null;
    const activeTarget = maimaiTransferTargets.find((target) => (
      target.account.id === activeAccountId
      && target.account.id !== sourceId
      && target.writable
    ));
    setMaimaiSourceAccountId(sourceId);
    setMaimaiTransferTargetIds(activeTarget ? [activeTarget.account.id] : []);
    setMaimaiUploadPage('friend_code');
    setUploadVisible(true);
  };

  const closeUpload = () => {
    setUploadVisible(false);
    setMaimaiUploadPage('friend_code');
  };
  const openChunithmUpload = () => {
    if (isChunithmMaintenanceWindow()) {
      showNotification({
        title: '游戏服务器维护中',
        message: CHUNITHM_MAINTENANCE_MESSAGE,
        variant: 'warning',
      });
      return;
    }
    setChunithmSyncGuideVisible(true);
  };

  if (isUnbound) {
    return <EmptyDataView title="暂无绑定账号" detail="请先在设置 → 游戏管理中绑定账号" />;
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
              accessibilityLabel={`当前玩家 ${displayName(bundle)}，点击切换账号`}
              onPress={openSwitchSheet}
              style={({ pressed }) => [styles.nameRow, pressed && styles.nameRowPressed]}
            >
              <Text style={[styles.name, { color: theme.text }]}>{displayName(bundle)}</Text>
              <Text style={styles.switchHint}>·点击切换·</Text>
            </Pressable>

            {bundle.payload.kind === 'adofai' || bundle.payload.kind === 'musedash' ? (
              <SourceStatus items={[{
                key: 'scores', label: bundle.payload.source.label, updatedAt: bundle.payload.source.updatedAt,
                state: bundle.payload.source.isStale ? 'cache' : 'live',
              }]} />
            ) : bundle.payload.kind === 'maimai' || bundle.payload.kind === 'phigros' ? (
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
              || bundle.payload.kind === 'chunithm'
              || bundle.payload.kind === 'adofai'
              || bundle.payload.kind === 'musedash' ? (
              <DxRatingCard
                borderless={bundle.payload.kind === 'chunithm' && !bundle.payload.hasSyncedData}
                label={bundle.payload.playerScore.label}
                display={bundle.payload.playerScore.display}
                rating={bundle.payload.kind === 'chunithm' && !bundle.payload.hasSyncedData
                  ? null
                  : bundle.payload.playerScore.value}
                meta={bundle.payload.kind === 'adofai'
                  ? formatTufOverviewRatingMeta(bundle.payload.player)
                  : bundle.payload.kind === 'musedash'
                    ? formatMuseDashOverviewRatingMeta(bundle.payload.player)
                    : bundle.payload.kind === 'chunithm'
                      ? formatChunithmBestMeta(bundle.payload.bestSections)
                      : formatBestSectionMeta(bundle.payload.bestSections, bundle.gameId)}
                themeOverride={bundle.payload.kind === 'adofai'
                  ? TUF_RATING_THEME
                  : bundle.payload.kind === 'musedash'
                    ? MUSE_DASH_RATING_THEME
                    : bundle.payload.kind === 'phigros'
                      ? resolvePhigrosChallengeTheme(bundle.payload.challengeModeRank)
                    : bundle.payload.kind === 'chunithm'
                      ? resolveChunithmRatingCardTheme(
                        bundle.payload.hasSyncedData ? bundle.payload.playerScore.value : null,
                        bundle.payload.player?.rating_possession,
                      )
                      : undefined}
                valueTheme={bundle.payload.kind === 'chunithm' && bundle.payload.hasSyncedData
                  ? resolveChunithmRatingTier(bundle.payload.playerScore.value)
                  : undefined}
                sideBadge={bundle.payload.kind === 'adofai'
                  ? { title: '世界排名', value: formatTufRankBadge(bundle.payload.player) }
                  : bundle.payload.kind === 'phigros'
                    ? { title: '课题模式', value: formatPhigrosChallengeBadge(bundle.payload.challengeModeRank) }
                    : maimaiCourseRankBadge(bundle)}
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
                  onPress={openChunithmUpload}
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
                    ? (library.isError
                        ? '个人数据暂不可用'
                        : bundle.payload.kind === 'adofai'
                          ? `收藏 ${favorites} 首`
                          : `收藏 ${favorites} 首 · 练习 ${practice} 张`)
                    : '当前游戏暂未开放个人曲库'}
                </Text>
                <Text style={[styles.toolLink, { color: theme.accent }]}>打开收藏与练习清单 →</Text>
              </View>
            </Pressable>

            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>数据状态</Text>
              {bundle.payload.kind === 'adofai' ? (
                <>
                  <Text style={[styles.body, { color: theme.textSecondary }]}>来源：{bundle.payload.source.label}</Text>
                  <Text style={[styles.body, { color: theme.textSecondary }]}>更新时间：{new Date(bundle.payload.source.updatedAt).toLocaleString()}</Text>
                </>
              ) : bundle.payload.kind === 'musedash' ? (
                <>
                  <Text style={[styles.body, { color: theme.textSecondary }]}>来源：{bundle.payload.source.label}</Text>
                  <Text style={[styles.body, { color: theme.textSecondary }]}>更新时间：{new Date(bundle.payload.source.updatedAt).toLocaleString()}</Text>
                </>
              ) : bundle.payload.kind === 'maimai' || bundle.payload.kind === 'phigros' ? (
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
                  <Text style={[styles.body, { color: theme.textSecondary }]}>
                    当前版本：{chunithmCatalog.data?.currentVersion.title ?? '—'}
                  </Text>
                  <Text style={[styles.body, { color: theme.textSecondary }]}>
                    更新时间：{new Date(bundle.payload.source.updatedAt).toLocaleString()}
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

/** 称号颜色徽章（normal/铜/银/金 → 实体徽章；彩虹 → 渐变徽章；image → 图片预览）。 */
function CollectionPreview({ kind, collection }: { kind: ChunithmCollectionKind; collection: ChunithmCollection }) {
  if (kind !== 'trophy') {
    return (
      <ChunithmCollectionImage kind={kind} collectionId={collection.id} height={34} borderRadius={6} />
    );
  }
  const tone = normalizeTrophyTone(collection.color);
  if (collection.color === 'image') {
    return <ChunithmCollectionImage kind="trophy-image" collectionId={collection.id} height={34} />;
  }
  if (tone === 'rainbow') {
    return (
      <LayeredGradientBadge
        label={collection.name || `#${collection.id}`}
        numberOfLines={1}
        style={styles.collectionHomeBadge}
        textStyle={styles.collectionHomeBadgeText}
        tone="rainbow"
      />
    );
  }
  const badge = TROPHY_BADGE_THEMES[tone];
  return (
    <View style={[styles.collectionHomeBadge, styles.collectionHomeBadgeSolid, {
      borderColor: badge.border,
      backgroundColor: badge.background,
    }]}>
      <Text numberOfLines={1} style={[styles.collectionHomeBadgeText, { color: badge.text }]}>
        {collection.name || `#${collection.id}`}
      </Text>
    </View>
  );
}

function PinnedChunithmCollectionCards({
  pinned,
  scores,
}: {
  pinned: readonly PinnedChunithmCollection[];
  scores: readonly ChunithmScore[];
}) {
  const theme = useAppTheme();
  const byKind = useMemo(() => {
    const map = new Map<ChunithmCollectionKind, PinnedChunithmCollection[]>();
    for (const entry of pinned) {
      const list = map.get(entry.kind) ?? [];
      list.push(entry);
      map.set(entry.kind, list);
    }
    return map;
  }, [pinned]);
  const kindList = [...byKind.keys()];

  return kindList.map((kind) => (
    <PinnedChunithmCollectionKindGroup
      key={kind}
      kind={kind}
      entries={byKind.get(kind) ?? []}
      scores={scores}
      theme={theme}
    />
  ));
}

function PinnedChunithmCollectionKindGroup({
  kind,
  entries,
  scores,
  theme,
}: {
  kind: ChunithmCollectionKind;
  entries: readonly PinnedChunithmCollection[];
  scores: readonly ChunithmScore[];
  theme: ReturnType<typeof useAppTheme>;
}) {
  const collections = useChunithmCollections(kind);
  const items = useMemo(() => {
    const wanted = new Set(entries.map((entry) => entry.id));
    return (collections.data?.items ?? []).filter((item) => wanted.has(item.id));
  }, [collections.data?.items, entries]);

  return items.map((collection) => {
    const progress = isChunithmCollectionComputable(collection)
      ? calculateChunithmCollectionProgress(collection, scores)
      : null;
    return (
      <Pressable
        key={`${kind}:${collection.id}`}
        accessibilityRole="button"
        accessibilityLabel={`打开主页收藏品 ${collection.name || `#${collection.id}`}`}
        onPress={() => router.push({
          pathname: '/tools/chunithm-collections',
          params: { kind, id: String(collection.id) },
        } as Href)}
      >
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={styles.pinnedToolEyebrow}>收藏品进度</Text>
          <View style={styles.collectionHomeTitleRow}>
            <CollectionPreview kind={kind} collection={collection} />
            <Text numberOfLines={1} style={[styles.cardTitle, styles.collectionHomeTitle, { color: theme.text }]}>
              {collection.name || `#${collection.id}`}
            </Text>
          </View>
          {progress ? (
            <>
              <View style={[styles.collectionHomeBar, { backgroundColor: theme.border }]}>
                <View
                  style={[styles.collectionHomeBarFill, {
                    width: `${progress.total ? Math.min(100, (progress.completed / progress.total) * 100) : 0}%`,
                    backgroundColor: theme.accent,
                  }]}
                />
              </View>
              <Text style={[styles.body, { color: theme.textSecondary }]}>
                {progress.completed} / {progress.total} 完成
              </Text>
            </>
          ) : (
            <Text style={[styles.body, { color: theme.textSecondary }]}>该收藏品没有可计算的达成条件</Text>
          )}
        </View>
      </Pressable>
    );
  });
}

function displayName(bundle: GameDataBundle): string {
  if (bundle.payload.kind === 'maimai') return bundle.payload.player.displayName;
  if (bundle.payload.kind === 'phigros') return bundle.payload.player.displayName;
  if (bundle.payload.kind === 'chunithm') {
    return bundle.payload.player?.name ?? '落雪账号（待同步）';
  }
  if (bundle.payload.kind === 'adofai') return bundle.payload.player.name;
  if (bundle.payload.kind === 'musedash') return bundle.payload.player.user.nickname;
  return bundle.payload.displayName;
}

function maimaiCourseRankBadge(bundle: GameDataBundle): { title: string; value: string } | undefined {
  if (bundle.payload.kind !== 'maimai') return undefined;
  const courseRank = resolveMaimaiCourseRank(bundle.payload.player);
  return courseRank ? { title: '段位认定', value: courseRank.label } : undefined;
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
  if (providerId === 'phigros-test') return '示例查分器';
  if (providerId === 'local') return '本地查分器';
  if (providerId === 'maimai-test') return '示例查分器';
  if (providerId === 'chunithm-test') return '示例查分器';
  if (providerId === 'chunithm-temp') return '无成绩临时账号';
  if (providerId === 'tuf') return 'TUF 社区';
  if (providerId === 'musedash-moe') return 'MuseDash.moe';
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
  collectionHomeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  collectionHomeTitle: { flexShrink: 1 },
  collectionHomeBar: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  collectionHomeBarFill: { height: '100%', borderRadius: 999 },
  collectionHomeBadge: { alignSelf: 'flex-start', maxWidth: '100%' },
  collectionHomeBadgeSolid: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectionHomeBadgeText: { fontSize: 11, lineHeight: 15, fontWeight: '700', textAlign: 'center', includeFontPadding: false },
  cardTitle: { color: '#111827', fontSize: 18, fontWeight: '700' },
  body: { color: '#374151' },
  note: { color: '#6B7280', lineHeight: 20, marginTop: 4 },
  toolLink: { color: '#246BFD', fontWeight: '600', marginTop: 5 },
});
