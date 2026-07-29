import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { AccountSwitchSheet } from '@/components/AccountSwitchSheet';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { PlateProgressCard } from '@/components/PlateProgressCard';
import { QueryStateView } from '@/components/QueryStateView';
import { UploadDataSheet } from '@/components/UploadDataSheet';
import { ChunithmSyncGuideSheet } from '@/components/chunithm/ChunithmSyncGuideSheet';
import {
  MaimaiUploadTabs,
  type MaimaiUploadPage,
} from '@/components/maimai/MaimaiUploadTabs';
import { MaimaiSyncGuideContent } from '@/components/maimai/MaimaiSyncGuideSheet';
import { GameOverviewContent } from '@/components/game-model/GameOverviewContent';
import { useNotification } from '@/components/AppNotification';
import type { BoundAccount } from '@/domain/bound-account';
import type { ActionRef, GameDataDocumentV1 } from '@/domain/game-model';
import { formatPlayerScore, type GameDataBundle } from '@/domain/game-data';
import { selectGameTools } from '@/domain/game-toolbox';
import {
  CHUNITHM_MAINTENANCE_MESSAGE,
  isChunithmMaintenanceWindow,
} from '@/domain/chunithm-maintenance';
import {
  isMaimaiMaintenanceWindow,
  MAIMAI_MAINTENANCE_MESSAGE,
} from '@/domain/maimai-maintenance';
import { calculatePlateProgress } from '@/domain/plates';
import type { ScoreRecord } from '@/domain/models';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useGameData } from '@/hooks/use-game-data';
import { useGameModel } from '@/hooks/use-game-model';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { usePlates } from '@/hooks/use-plates';
import { invalidateAccountDataQueries } from '@/services/invalidate-account-data';
import { refreshDivingFishAccounts } from '@/services/refresh-diving-fish-accounts';
import { switchBoundAccount } from '@/services/switch-bound-account';
import {
  type UploadPhase,
  type UploadResult,
} from '@/services/upload-maimai-from-friend-code';
import { useGamePickerUi } from '@/state/game-picker-ui';
import { applyLxnsTokenRotation, useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { useToolboxPins } from '@/state/toolbox-pins';
import { useAppTheme } from '@/theme/app-theme';

export default function OverviewTabScreen() {
  return <CachedTabScreen><OverviewScreen /></CachedTabScreen>;
}

export function OverviewScreen() {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const gameModel = useGameModel();
  const gameData = useGameData();
  const {
    data: catalogData,
    error: catalogError,
    refetch: refetchCatalog,
  } = useDetailedCatalog();
  const tabBottomInset = useNativeTabBottomInset();
  const boundAccounts = useSession((state) => state.boundAccounts);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const activeSession = useSession((state) => state.session);
  const sessionsByAccountId = useSession((state) => state.sessionsByAccountId);
  const updateBoundAccountScore = useSession((state) => state.updateBoundAccountScore);
  const expandedGameId = useGamePickerUi((state) => state.expandedGameId);
  const setExpandedGameId = useGamePickerUi((state) => state.setExpandedGameId);
  const toggleExpandedGameId = useGamePickerUi((state) => state.toggleExpandedGameId);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [uploadVisible, setUploadVisible] = useState(false);
  const [chunithmSyncGuideVisible, setChunithmSyncGuideVisible] = useState(false);
  const [maimaiUploadPage, setMaimaiUploadPage] = useState<MaimaiUploadPage>('friend_code');
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>({ kind: 'idle' });
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const refreshingRef = useRef(false);
  const toolboxGameId = gameData.data?.gameId ?? activeGameId;
  const pinnedToolIds = useToolboxPins((state) => state.pinnedToolIdsByGame[toolboxGameId]);
  const pinnedPlateIds = useToolboxPins((state) => state.pinnedPlateIdsByGame[toolboxGameId]);
  const hydratePins = useToolboxPins((state) => state.hydrate);
  const pinnedTools = useMemo(
    () => selectGameTools(toolboxGameId, pinnedToolIds),
    [pinnedToolIds, toolboxGameId],
  );
  const currentUploadSelection = useMemo(() => [activeAccountId], [activeAccountId]);
  const maimaiLxnsGuideAvailable = activeGameId === 'maimai'
    && boundAccounts.some((account) => account.gameId === 'maimai' && account.providerId === 'lxns');
  const uploadBusy = uploadPhase.kind !== 'idle'
    && uploadPhase.kind !== 'done'
    && uploadPhase.kind !== 'error';

  useEffect(() => {
    void hydratePins();
  }, [hydratePins]);

  const syncData = useCallback(async (): Promise<boolean> => {
    if (refreshingRef.current) return false;
    refreshingRef.current = true;
    setRefreshing(true);
    setSyncing(true);
    try {
      await queryClient.cancelQueries({ queryKey: ['game-data'] });
      const account = boundAccounts.find((item) => item.id === activeAccountId);
      if (account?.providerId === 'diving-fish' && activeSession?.mode === 'import-token') {
        const catalog = catalogData ?? (await refetchCatalog()).data;
        if (!catalog) throw catalogError ?? new Error('舞萌曲库尚未就绪，请稍后重试');
        const result = await refreshDivingFishAccounts({
          accounts: [account],
          sessionsByAccountId: { [account.id]: activeSession },
          catalog,
        });
        const refreshedAccount = result.refreshed[0];
        if (!refreshedAccount) throw result.failed[0]?.error ?? new Error('水鱼账号同步失败');
        updateBoundAccountScore(
          account.id,
          formatPlayerScore(
            refreshedAccount.snapshot.best50.rating,
            gameData.profile.ratingDigits,
          ),
          refreshedAccount.snapshot.player.displayName,
        );
      }
      await invalidateAccountDataQueries(queryClient, 'none');
      const result = await gameData.refetch();
      if (activeGameId === 'maimai' && account?.providerId === 'lxns') {
        const payload = result.data?.payload;
        if (payload?.kind !== 'maimai' || payload.source.isStale) {
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
        const payload = result.data?.payload;
        if (payload?.kind !== 'chunithm' || !payload.hasSyncedData || payload.source.isStale) {
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
    } catch (error) {
      showNotification({
        title: '同步失败',
        message: error instanceof Error ? error.message : '暂时无法同步成绩，请稍后重试。',
        variant: 'error',
      });
      return false;
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setSyncing(false);
    }
  }, [
    activeAccountId,
    activeGameId,
    activeSession,
    boundAccounts,
    catalogData,
    catalogError,
    gameData,
    refetchCatalog,
    showNotification,
    updateBoundAccountScore,
  ]);

  const finishUpload = useCallback(async (result: UploadResult) => {
    for (const refreshed of result.refreshedAccounts) {
      updateBoundAccountScore(
        refreshed.account.id,
        formatPlayerScore(refreshed.snapshot.best50.rating, gameData.profile.ratingDigits),
        refreshed.snapshot.player.displayName,
      );
    }
    await invalidateAccountDataQueries();
  }, [gameData.profile.ratingDigits, updateBoundAccountScore]);

  const openSwitchSheet = () => {
    const active = boundAccounts.find((account) => account.id === activeAccountId);
    setExpandedGameId(active?.gameId ?? null);
    setPickerVisible(true);
  };

  const openUpload = () => {
    if (isMaimaiMaintenanceWindow()) {
      showNotification({
        title: '游戏服务器维护中',
        message: MAIMAI_MAINTENANCE_MESSAGE,
        variant: 'warning',
      });
      return;
    }
    setMaimaiUploadPage('friend_code');
    setUploadVisible(true);
  };

  const closeUpload = () => {
    if (uploadBusy || syncing) return;
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

  const handleAction = (action: ActionRef) => {
    if (action.id === 'switch-account') {
      openSwitchSheet();
      return;
    }
    if (action.id === 'sync') {
      void syncData();
      return;
    }
    if (action.id === 'upload') {
      if (activeGameId === 'chunithm') openChunithmUpload();
      else openUpload();
      return;
    }
    if (action.id === 'route') {
      const href = action.params.href;
      if (typeof href === 'string') router.push(href as Href);
    }
  };

  return (
    <View collapsable={false} style={[styles.page, { backgroundColor: theme.background }]}>
      <QueryStateView<GameDataDocumentV1>
        isLoading={gameModel.isLoading}
        isError={gameModel.isError}
        isEmpty={false}
        error={gameModel.error}
        onRetry={() => void gameModel.refetch()}
        data={gameModel.document}
        renderData={(document) => (
          <GameOverviewContent
            document={document}
            refreshing={refreshing}
            bottomInset={tabBottomInset}
            onRefresh={() => void syncData()}
            onAction={handleAction}
            pinnedContent={(
              <OverviewPinnedAdapterContent
                bundle={gameData.data}
                plateIds={pinnedPlateIds}
                tools={pinnedTools}
              />
            )}
          />
        )}
      />
      <AccountSwitchSheet
        visible={pickerVisible}
        accounts={boundAccounts}
        expandedGameId={expandedGameId}
        activeAccountId={activeAccountId}
        onClose={() => setPickerVisible(false)}
        onToggleGame={toggleExpandedGameId}
        onSelectAccount={(account: BoundAccount) => {
          setPickerVisible(false);
          switchBoundAccount(account.id, { navigateToOverview: false });
        }}
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
            disabled={uploadBusy || syncing}
            onChange={setMaimaiUploadPage}
          />
        ) : undefined}
        contentOverride={maimaiUploadPage === 'lxns_guide' ? (
          <MaimaiSyncGuideContent
            syncing={syncing}
            onClose={closeUpload}
            onSync={syncData}
          />
        ) : undefined}
        externalBusy={uploadBusy || (maimaiUploadPage === 'lxns_guide' && syncing)}
      />
      <ChunithmSyncGuideSheet
        visible={chunithmSyncGuideVisible}
        syncing={syncing}
        onClose={() => setChunithmSyncGuideVisible(false)}
        onSync={syncData}
      />
    </View>
  );
}

function OverviewPinnedAdapterContent({
  bundle,
  plateIds,
  tools,
}: {
  bundle?: GameDataBundle;
  plateIds: readonly number[];
  tools: ReturnType<typeof selectGameTools>;
}) {
  const theme = useAppTheme();
  const maimaiRecords = bundle?.payload.kind === 'maimai' ? bundle.payload.records : undefined;
  return (
    <>
      {maimaiRecords && plateIds.length
        ? <PinnedPlateCards plateIds={plateIds} records={maimaiRecords} />
        : null}
      {tools.map((tool) => (
        <Pressable
          key={tool.id}
          testID={`overview-pinned-tool-${tool.id}`}
          accessibilityRole="button"
          accessibilityLabel={`打开置顶工具 ${tool.title}`}
          onPress={() => router.push(tool.href as Href)}
        >
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.eyebrow, { color: theme.accent }]}>置顶工具</Text>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{tool.title}</Text>
            <Text style={[styles.body, { color: theme.textSecondary }]}>{tool.detail}</Text>
            <Text style={[styles.link, { color: theme.accent }]}>打开 →</Text>
          </View>
        </Pressable>
      ))}
    </>
  );
}

function PinnedPlateCards({
  plateIds,
  records,
}: {
  plateIds: readonly number[];
  records: readonly ScoreRecord[];
}) {
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

const styles = StyleSheet.create({
  page: { flex: 1 },
  card: { borderRadius: 14, padding: 15, gap: 6 },
  eyebrow: { fontSize: 11, fontWeight: '800' },
  cardTitle: { fontSize: 17, fontWeight: '900' },
  body: { fontSize: 12, lineHeight: 18 },
  link: { fontSize: 12, fontWeight: '800' },
});
