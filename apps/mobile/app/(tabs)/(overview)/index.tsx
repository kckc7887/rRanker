import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { AccountSwitchSheet } from '@/components/AccountSwitchSheet';
import { DxRatingCard } from '@/components/DxRatingCard';
import { QueryStateView } from '@/components/QueryStateView';
import { SourceStatus } from '@/components/SourceStatus';
import { UploadDataSheet } from '@/components/UploadDataSheet';
import type { BoundAccount } from '@/domain/bound-account';
import { formatPlayerScore, type BestListSection, type GameDataBundle } from '@/domain/game-data';
import type { ProviderId } from '@/domain/game-bind-options';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useGameData } from '@/hooks/use-game-data';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { invalidateAccountDataQueries } from '@/services/invalidate-account-data';
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
import { SecureSessionStore } from '@/storage/secure-session-store';

const sessions = new SecureSessionStore();
export default function OverviewScreen() {
  const { data, isLoading, isError, error, refetch, profile } = useGameData();
  const library = useUserLibrary();
  const { data: catalogData, error: catalogError, refetch: refetchCatalog } = useDetailedCatalog();
  const tabBottomInset = useNativeTabBottomInset();
  const boundAccounts = useSession((s) => s.boundAccounts);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const activeSession = useSession((s) => s.session);
  const sessionsByAccountId = useSession((s) => s.sessionsByAccountId);
  const selectBoundAccount = useSession((s) => s.selectBoundAccount);
  const updateBoundAccountScore = useSession((s) => s.updateBoundAccountScore);
  const expandedGameId = useGamePickerUi((s) => s.expandedGameId);
  const setExpandedGameId = useGamePickerUi((s) => s.setExpandedGameId);
  const toggleExpandedGameId = useGamePickerUi((s) => s.toggleExpandedGameId);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [uploadVisible, setUploadVisible] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>({ kind: 'idle' });
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const refreshingRef = useRef(false);
  const favorites = library.data?.filter((item) => item.kind === 'song' && item.favorite).length ?? 0;
  const practice = library.data?.filter((item) => item.kind === 'chart' && item.practice).length ?? 0;
  const syncBusy = syncing;
  const currentUploadSelection = useMemo(() => [activeAccountId], [activeAccountId]);

  const syncData = useCallback(async () => {
    if (refreshingRef.current) return;
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
      await refetch();
    } catch (syncError) {
      Alert.alert(
        '同步失败',
        syncError instanceof Error ? syncError.message : '暂时无法同步成绩，请稍后重试。',
      );
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setSyncing(false);
    }
  }, [activeAccountId, activeSession, boundAccounts, catalogData, catalogError, profile.ratingDigits,
    refetch, refetchCatalog, updateBoundAccountScore]);

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
    selectBoundAccount(account.id);
    void sessions.setActiveAccountId(account.id);
    setPickerVisible(false);
  };

  const openUpload = () => setUploadVisible(true);

  const closeUpload = () => setUploadVisible(false);

  return (
    <View style={styles.page}>
      <QueryStateView<GameDataBundle>
        isLoading={isLoading}
        isError={isError}
        isEmpty={false}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        data={data}
        renderData={(bundle) => (
          <ScrollView
            style={styles.scroll}
            testID="overview-scroll"
            alwaysBounceVertical
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (
              bundle.providerId === 'local' ? openUpload() : void syncData()
            )}
              tintColor="#246BFD" colors={['#246BFD']} />}
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
              <Text style={styles.name}>{displayName(bundle)}</Text>
              <Text style={styles.switchHint}>·点击切换·</Text>
            </Pressable>

            {bundle.payload.kind === 'maimai' ? (
              <SourceStatus items={[
                { key: 'scores', label: bundle.payload.source.label, updatedAt: bundle.payload.source.updatedAt, state: bundle.payload.source.isStale ? 'cache' : 'live' },
                { key: 'catalog', label: bundle.payload.catalogSource.label, updatedAt: bundle.payload.catalogSource.updatedAt, state: bundle.payload.catalogSource.isStale ? 'cache' : 'live' },
              ]} />
            ) : (
              <SourceStatus items={[
                { key: 'scores', label: '空', state: 'unavailable' },
              ]} />
            )}

            {bundle.payload.kind === 'maimai' ? (
              <DxRatingCard
                label={bundle.payload.playerScore.label}
                display={bundle.payload.playerScore.display}
                rating={bundle.payload.playerScore.value}
                meta={formatBestSectionMeta(bundle.payload.bestSections)}
              />
            ) : (
              <DxRatingCard label={profile.ratingLabel} display="—" rating={null} meta="空空空" />
            )}

            {bundle.payload.kind === 'maimai' && bundle.providerId === 'local' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="同步本地查分器数据，使用好友码"
                onPress={openUpload}
                style={({ pressed }) => [styles.syncButton, pressed && styles.syncPressed]}
              >
                <Text style={styles.syncText}>同步数据</Text>
                <Text style={styles.actionHint}>好友码</Text>
              </Pressable>
            ) : bundle.payload.kind === 'maimai' ? (
              <View style={styles.actionRow}>
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
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="同步数据"
                disabled={syncBusy}
                onPress={() => void syncData()}
                style={({ pressed }) => [styles.syncButton, pressed && styles.syncPressed, syncBusy && styles.syncDisabled]}
              >
                <Text style={styles.syncText}>{syncBusy ? '同步中…' : '同步数据'}</Text>
              </Pressable>
            )}

            <Pressable onPress={() => router.push('/tools' as Href)}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>工具箱</Text>
                <Text style={styles.body}>
                  {bundle.payload.kind === 'maimai'
                    ? 'Rating · 达成率/容错 · 牌子进度 · 版本对照'
                    : '空空空'}
                </Text>
                <Text style={styles.toolLink}>打开工具箱 →</Text>
              </View>
            </Pressable>

            <Pressable accessibilityRole="button" onPress={() => router.push('/library' as Href)}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>我的曲库</Text>
                <Text style={styles.body}>
                  {bundle.payload.kind === 'maimai'
                    ? (library.isError ? '个人数据暂不可用' : `收藏 ${favorites} 首 · 练习 ${practice} 张`)
                    : '空空空'}
                </Text>
                <Text style={styles.toolLink}>打开收藏与练习清单 →</Text>
              </View>
            </Pressable>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>数据状态</Text>
              {bundle.payload.kind === 'maimai' ? (
                <>
                  <Text style={styles.body}>来源：{bundle.payload.source.label}</Text>
                  <Text style={styles.body}>曲库：{bundle.payload.catalogSource.label}</Text>
                  <Text style={styles.body}>当前版本：{bundle.payload.currentVersionTitle}</Text>
                  <Text style={styles.body}>更新时间：{new Date(bundle.payload.source.updatedAt).toLocaleString()}</Text>
                </>
              ) : (
                <Text style={styles.body}>空空空</Text>
              )}
              <Text style={styles.note}>点玩家名可切换已绑定账号。</Text>
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
    </View>
  );
}

function displayName(bundle: GameDataBundle): string {
  if (bundle.payload.kind === 'maimai') return bundle.payload.player.displayName;
  return bundle.payload.displayName;
}

function formatBestSectionMeta(sections: BestListSection[]): string {
  return sections.map((section) => {
    const label = section.id === 'b35' ? 'B35' : section.id === 'b15' ? 'B15' : section.id.toUpperCase();
    const total = section.records.reduce((sum, record) => sum + record.rating, 0);
    return `${label} ${total}`;
  }).join(' · ');
}

/** 总览同步按钮副文案：当前成绩来源查分器。 */
function syncProviderHint(providerId: ProviderId | null): string {
  if (providerId === 'lxns') return '落雪咖啡屋';
  if (providerId === 'diving-fish') return '水鱼查分器';
  if (providerId === 'local') return '本地查分器';
  if (providerId === 'maimai-test') return '测试查分器';
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
  cardTitle: { color: '#111827', fontSize: 18, fontWeight: '700' },
  body: { color: '#374151' },
  note: { color: '#6B7280', lineHeight: 20, marginTop: 4 },
  toolLink: { color: '#246BFD', fontWeight: '600', marginTop: 5 },
});
