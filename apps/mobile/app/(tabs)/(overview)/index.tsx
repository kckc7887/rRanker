import { RIZLINE_RATING_THEME, formatRizlineRks } from '@/domain/rizline';
import { useOverviewOperation } from '@/hooks/use-overview-operation';
import { useOverviewSync } from '@/hooks/use-overview-sync';
import { useOverviewUpload } from '@/hooks/use-overview-upload';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { AccountSwitchSheet } from '@/components/AccountSwitchSheet';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { DxRatingCard } from '@/components/DxRatingCard';
import { OSU_PP_RATING_THEME } from '@/components/osu/OsuRatingTag';
import { EmptyDataView } from '@/components/EmptyDataView';
import { PlateProgressCard } from '@/components/PlateProgressCard';
import { QueryStateView } from '@/components/QueryStateView';
import { UploadDataSheet } from '@/components/UploadDataSheet';
import { ChunithmSyncGuideSheet } from '@/components/chunithm/ChunithmSyncGuideSheet';
import { ChunithmCollectionImage } from '@/components/chunithm/ChunithmCollectionImage';
import { LayeredGradientBadge } from '@/components/LayeredGradientBadge';
import { MaimaiSyncGuideContent } from '@/components/maimai/MaimaiSyncGuideSheet';
import { MaimaiUploadTabs } from '@/components/maimai/MaimaiUploadTabs';

import type { BoundAccount } from '@/domain/bound-account';

import { resolveChunithmRatingCardTheme, resolveChunithmRatingTier } from '@/domain/chunithm-rating-theme';
import { averageChunithmRating } from '@/domain/chunithm-score-presentation';
import { type BestListSection, type GameDataBundle } from '@/domain/game-data';
import type { ProviderId } from '@/domain/game-bind-options';
import { resolveMaimaiCourseRank } from '@/domain/maimai-course-rank';
import { formatPhigrosChallengeBadge, resolvePhigrosChallengeTheme } from '@/domain/phigros-challenge-theme';
import { selectGameTools, summarizeGameTools } from '@/domain/game-toolbox';
import { calculatePlateProgress } from '@/domain/plates';
import type { ScoreRecord } from '@/domain/models';
import { calculateChunithmCollectionProgress, isChunithmCollectionComputable, type ChunithmCollection, type ChunithmCollectionKind } from '@/domain/chunithm-collections';
import type { ChunithmScore } from '@/domain/chunithm-personal';
import { normalizeTrophyTone, TROPHY_BADGE_THEMES } from '@/features/best-image/best-image-badge-theme';
import type { PinnedChunithmCollection } from '@/features/toolbox/pinned-tool-preferences';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useChunithmCollections } from '@/hooks/use-chunithm-collections';
import { useGameData } from '@/hooks/use-game-data';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { usePlates } from '@/hooks/use-plates';

import { switchBoundAccount } from '@/services/switch-bound-account';

import { compactUploadPhaseLabel } from '@/services/upload-maimai-from-friend-code';

import { useUserLibrary } from '@/hooks/use-user-library';
import { useGamePickerUi } from '@/state/game-picker-ui';

import { applyLxnsTokenRotation, UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
import { useToolboxPins } from '@/state/toolbox-pins';

import { useAppTheme } from '@/theme/app-theme';
import { formatTufOverviewRatingMeta, formatTufRankBadge, TUF_RATING_THEME } from '@/components/adofai/TufOverviewDetails';
import { formatMuseDashOverviewRatingMeta, MUSE_DASH_RATING_THEME } from '@/components/musedash/MuseDashOverviewDetails';
import { formatOsuPlayTime } from '@/domain/osu';

export default function OverviewTabScreen() {
  return <CachedTabScreen><OverviewScreen /></CachedTabScreen>;
}

export function OverviewScreen() {
  return <PublicOverviewScreen />;
}

function PublicOverviewScreen() {
  const theme = useAppTheme();
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
        .catch(() => undefined);
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
              accessibilityLabel={`当前玩家 ${displayName(bundle)}，点击切换账号`}
              onPress={openSwitchSheet}
              style={({ pressed }) => [styles.nameRow, pressed && styles.nameRowPressed]}
            >
              <Text style={[styles.name, { color: theme.text }]}>{displayName(bundle)}</Text>
              <Text style={styles.switchHint}>·点击切换·</Text>
            </Pressable>

            {bundle.payload.kind === 'maimai'
              || bundle.payload.kind === 'phigros'
              || bundle.payload.kind === 'chunithm'
              || bundle.payload.kind === 'adofai'
              || bundle.payload.kind === 'musedash'
              || bundle.payload.kind === 'rizline'
              || bundle.payload.kind === 'majdata-net'
              || bundle.payload.kind === 'phira'
              || bundle.payload.kind === 'osu' ? (
              <DxRatingCard
                borderless={bundle.payload.kind === 'chunithm' && !bundle.payload.hasSyncedData}
                label={bundle.payload.playerScore.label}
                display={bundle.payload.playerScore.display}
                fitValue={bundle.payload.kind === 'majdata-net'}
                accessibilityLabel={bundle.payload.kind === 'rizline' || bundle.payload.kind === 'majdata-net'
                  ? `${bundle.payload.playerScore.label} ${bundle.payload.playerScore.display}`
                  : undefined}
                rating={bundle.payload.kind === 'majdata-net' || (bundle.payload.kind === 'chunithm' && !bundle.payload.hasSyncedData)
                  ? null
                  : bundle.payload.playerScore.value}
                meta={bundle.payload.kind === 'rizline'
                  ? `AH5（推定） ${formatRizlineRks(bundle.payload.best.ah5Contribution)} · B35（推定） ${formatRizlineRks(bundle.payload.best.b35Contribution)}`
                  : bundle.payload.kind === 'majdata-net' ? '' : bundle.payload.kind === 'adofai'
                  ? formatTufOverviewRatingMeta(bundle.payload.player)
                  : bundle.payload.kind === 'musedash'
                    ? formatMuseDashOverviewRatingMeta(bundle.payload.player)
                    : bundle.payload.kind === 'phira'
                      ? `总游玩次数 ${bundle.payload.snapshot.stats.numRecords}`
                    : bundle.payload.kind === 'chunithm'
                      ? formatChunithmBestMeta(bundle.payload.bestSections)
                      : bundle.payload.kind === 'osu'
                        ? formatOsuPlayTime(bundle.payload.player.playTimeSeconds)
                        : formatBestSectionMeta(bundle.payload.bestSections, bundle.gameId)}
                themeOverride={bundle.payload.kind === 'rizline' ? RIZLINE_RATING_THEME : bundle.payload.kind === 'adofai'
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
                      : bundle.payload.kind === 'osu'
                        ? OSU_PP_RATING_THEME
                      : undefined}
                valueTheme={bundle.payload.kind === 'chunithm' && bundle.payload.hasSyncedData
                  ? resolveChunithmRatingTier(bundle.payload.playerScore.value)
                  : undefined}
                sideBadge={bundle.payload.kind === 'adofai'
                  ? { title: '世界排名', value: formatTufRankBadge(bundle.payload.player) }
                  : bundle.payload.kind === 'phira'
                    ? { title: '平均准确率', value: `${(bundle.payload.snapshot.stats.avgAccuracy * 100).toFixed(2)}%` }
                  : bundle.payload.kind === 'phigros'
                    ? { title: '课题模式', value: formatPhigrosChallengeBadge(bundle.payload.challengeModeRank) }
                    : maimaiCourseRankBadge(bundle)}
              />
            ) : (
              <DxRatingCard
                label={profile.ratingLabel}
                display="—"
                rating={null}
                meta={bundle.gameId === 'chunithm' ? '请绑定落雪账号' : '当前游戏暂未提供评分'}
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
                <Text style={styles.syncText}>{syncBusy ? '同步中…' : '同步数据'}</Text>
                <Text style={styles.actionHint}>{syncProviderHint(bundle.providerId)}</Text>
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
  if (bundle.payload.kind === 'rizline') return bundle.payload.player.username;
  if (bundle.payload.kind === 'maimai') return bundle.payload.player.displayName;
  if (bundle.payload.kind === 'phigros') return bundle.payload.player.displayName;
  if (bundle.payload.kind === 'chunithm') {
    return bundle.payload.player?.name ?? '落雪账号（待同步）';
  }
  if (bundle.payload.kind === 'adofai') return bundle.payload.player.name;
  if (bundle.payload.kind === 'musedash') return bundle.payload.player.user.nickname;
  if (bundle.payload.kind === 'majdata-net') return bundle.payload.snapshot.player.username;
  if (bundle.payload.kind === 'phira') return bundle.payload.snapshot.player.name;
  if (bundle.payload.kind === 'osu') return bundle.payload.player.username;
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

function formatChunithmBestMeta(
  sections: Extract<GameDataBundle['payload'], { kind: 'chunithm' }>['bestSections'],
): string {
  const best30 = sections.find((section) => section.id === 'b30');
  const new20 = sections.find((section) => section.id === 'new20');
  return `Best30 ${averageChunithmRating(best30?.scores ?? [])} · New20 ${averageChunithmRating(new20?.scores ?? [])}`;
}

function syncProviderHint(providerId: ProviderId | null): string {
  if (providerId === 'rizline-official') return '官方账号';
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
  if (providerId === 'majdata-net') return 'Majdata Net';
  if (providerId === 'phira-community') return 'Phira社区';
  if (providerId === 'osu') return 'osu! 官方';
  return '本地';
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
