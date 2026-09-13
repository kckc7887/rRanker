import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BoundAccount } from '@/domain/bound-account';
import type { CatalogSnapshot } from '@/domain/models';
import type { ProviderSession } from '@/providers/contracts';
import type { LxnsOAuthSession } from '@/providers/lxns-oauth';
import { fetchScoreHubStatistics, type ScoreHubDxnetJobStats } from '@/services/score-hub-client';
import { formatScoreHubStatsSummary, scoreHubSuccessHint, uploadTaskController, type UploadPhase, type UploadResult } from '@/services/upload-maimai-from-friend-code';
import { AppModal } from '@/components/AppModal';
import { UploadFriendCodeFields, UploadProgressStatus, UploadQrFields, UploadResultList, UploadTargetList } from '@/components/upload-data-sheet-fields';
import { uploadDataSheetStyles as styles } from '@/components/upload-data-sheet-styles';
import { useAppTheme } from '@/theme/app-theme';
import { useUploadTaskState, useUploadExecution } from '@/hooks/use-upload-task';
import { useUploadAccountPreferences } from '@/hooks/use-upload-account-preferences';
import { useUploadQrInput } from '@/hooks/use-upload-qr-input';

export function UploadDataSheet({
  visible,
  accounts,
  sessionsByAccountId,
  catalog,
  requestCatalog,
  onClose,
  onPhaseChange,
  onFinished,
  temporarySelectedAccountIds,
  onLxnsTokensRotated,
  headerAccessory,
  contentOverride,
  uploadMethod = 'friend_code',
  externalBusy = false,
}: {
  visible: boolean;
  accounts: BoundAccount[];
  sessionsByAccountId: Record<string, ProviderSession | undefined>;
  catalog: CatalogSnapshot | undefined;
  requestCatalog?: () => Promise<CatalogSnapshot | undefined>;
  onClose: () => void;
  onPhaseChange?: (phase: UploadPhase) => void;
  onFinished?: (result: UploadResult) => void | Promise<void>;
  /** 仅本次打开使用；不覆盖用户平时保存的上传目标。 */
  temporarySelectedAccountIds?: readonly string[];
  onLxnsTokensRotated?: (accountId: string, session: LxnsOAuthSession) => void | Promise<void>;
  /** 可选的页内顶部导航，仅在特定账号提供其它上传页面时显示。 */
  headerAccessory?: ReactNode;
  /** 替换好友码页面内容，但保留同一个原生上传弹层与顶部导航。 */
  contentOverride?: ReactNode;
  uploadMethod?: 'friend_code' | 'qr';
  externalBusy?: boolean;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const task = useUploadTaskState(catalog, requestCatalog, onPhaseChange, visible);
  const { phase, running, lastResult, cancelUpload } = task;
  const qr = useUploadQrInput(visible, running, uploadMethod);
  const { bindQrText, setBindQrText, decodingQr, pickQrImage, pasteQrText } = qr;
  const preferences = useUploadAccountPreferences({ visible, running, decodingQr, accounts, sessionsByAccountId, temporarySelectedAccountIds });
  const { friendCode, hasCabinetBound, hasStoredToken, storedAccounts, historyVisible, setHistoryVisible,
    bindingLookup, selectedIds, prefsReady, refreshStoredList, toggleAccount, onFriendCodeChange,
    selectStoredFriendCode, removeStoredFriendCode, targets } = preferences;
  const { startUpload, startQrUpload } = useUploadExecution({ task, preferences, qr, sessionsByAccountId, uploadMethod, onLxnsTokensRotated, onFinished });
  const [stats, setStats] = useState<ScoreHubDxnetJobStats | null>(null);
  const [statsStatus, setStatsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const statsSummary = statsStatus === 'loading'
    ? '正在获取服务状态…'
    : statsStatus === 'error'
      ? '服务状态暂不可用'
      : formatScoreHubStatsSummary(stats);
  const statsHint = statsStatus === 'ready'
    ? scoreHubSuccessHint(stats?.successRate ?? null, stats?.totalCount ?? 0)
    : statsStatus === 'error'
      ? '无法获取近一小时公开统计，上传仍可继续尝试。'
      : null;
  useEffect(() => {
    if (!visible || running || uploadMethod !== 'friend_code') return;
    let active = true;
    setStatsStatus('loading');
    setStats(null);
    void fetchScoreHubStatistics()
      .then((payload) => {
        if (!active) return;
        setStats(payload.dxnetJobs);
        setStatsStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setStats(null);
        setStatsStatus('error');
      });
    return () => {
      active = false;
    };
  }, [visible, running, uploadMethod]);

  const close = () => {
    if (externalBusy) return;
    qr.reset();
    setHistoryVisible(false);
    onClose();
  };

  const statusText = phase.kind === 'idle' ? '' : phase.message;
  const botHint = phase.kind === 'awaiting_friend' && phase.botFriendCode
    ? `Bot 好友码：${phase.botFriendCode}`
    : null;
  const busy = running || decodingQr || externalBusy;

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={externalBusy ? undefined : close}
    >
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.background }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>上传数据</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭上传"
            disabled={externalBusy}
            hitSlop={12}
            onPress={close}
            style={({ pressed }) => [
              styles.closeHit,
              pressed && !externalBusy && styles.softPressed,
              externalBusy && styles.primaryDisabled,
            ]}
          >
            <Text style={[styles.close, { color: theme.accent }]}>关闭</Text>
          </Pressable>
        </View>

        {headerAccessory}
        {contentOverride ?? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {uploadMethod === 'friend_code' ? (
            <UploadFriendCodeFields
              theme={theme}
              friendCode={friendCode}
              onFriendCodeChange={onFriendCodeChange}
              historyVisible={historyVisible}
              storedAccounts={storedAccounts}
              busy={busy}
              prefsReady={prefsReady}
              onToggleHistory={() => {
                if (historyVisible) {
                  setHistoryVisible(false);
                  return;
                }
                void refreshStoredList().then((list) => {
                  if (list.length > 0) setHistoryVisible(true);
                });
              }}
              onSelectStoredFriendCode={selectStoredFriendCode}
              onRemoveStoredFriendCode={removeStoredFriendCode}
              bindingLookup={bindingLookup}
              hasCabinetBound={hasCabinetBound}
              hasStoredToken={hasStoredToken}
              statsStatus={statsStatus}
              statsSummary={statsSummary}
              statsHint={statsHint}
            />
          ) : (
            <UploadQrFields
              theme={theme}
              bindQrText={bindQrText}
              onBindQrTextChange={setBindQrText}
              busy={busy}
              prefsReady={prefsReady}
              decodingQr={decodingQr}
              onPasteQrText={pasteQrText}
              onPickQrImage={pickQrImage}
            />
          )}

          <UploadTargetList
            theme={theme}
            targets={targets}
            selectedIds={selectedIds}
            busy={busy}
            onToggleAccount={toggleAccount}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={uploadMethod === 'qr' ? '用二维码同步成绩' : '开始上传'}
            disabled={busy || !prefsReady}
            onPress={() => {
              if (uploadMethod === 'qr') {
                void startQrUpload();
              } else {
                void startUpload();
              }
            }}
            style={({ pressed }) => [
              styles.primary, { backgroundColor: theme.accent },
              (busy || !prefsReady) && styles.primaryDisabled,
              pressed && !busy && styles.softPressed,
            ]}
          >
            {running ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>
                {uploadMethod === 'qr' ? '用二维码同步成绩' : '开始上传'}
              </Text>
            )}
          </Pressable>

          {running && phase.kind === 'awaiting_catalog' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="重试同步曲库"
              onPress={() => uploadTaskController.retryCatalogSync()}
              style={({ pressed }) => [
                styles.secondary,
                { borderColor: theme.border, backgroundColor: theme.surface },
                pressed && styles.softPressed,
              ]}
            >
              <Text style={[styles.secondaryText, { color: theme.accent }]}>重试同步曲库</Text>
            </Pressable>
          ) : null}

          {running ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="取消当前操作"
              disabled={phase.kind === 'canceling'}
              onPress={cancelUpload}
              style={({ pressed }) => [
                styles.cancel,
                { backgroundColor: theme.danger },
                phase.kind === 'canceling' && styles.primaryDisabled,
                pressed && phase.kind !== 'canceling' && styles.softPressed,
              ]}
            >
              <Text style={styles.primaryText}>
                {phase.kind === 'canceling' ? '正在取消…' : '取消'}
              </Text>
            </Pressable>
          ) : null}

          <UploadProgressStatus
            theme={theme}
            running={running}
            phase={phase}
            statusText={statusText}
            botHint={botHint}
          />

          <UploadResultList theme={theme} lastResult={lastResult} />
          </ScrollView>
        )}
      </View>
    </AppModal>
  );
}
