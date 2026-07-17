import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BoundAccount } from '@/domain/bound-account';
import { findGame, findProvider } from '@/domain/game-bind-options';
import type { CatalogSnapshot } from '@/domain/models';
import type { ProviderSession } from '@/providers/contracts';
import type { ScoreHubAbortSignal } from '@/services/score-hub-client';
import { ScoreHubError } from '@/services/score-hub-client';
import {
  resolveUploadTargets,
  uploadMaimaiFromFriendCode,
  type UploadPhase,
  type UploadResult,
} from '@/services/upload-maimai-from-friend-code';
import { uploadPrefsStore } from '@/storage/upload-prefs-store';
import { ProviderError } from '@/providers/errors';
import type { LxnsOAuthSession } from '@/providers/lxns-oauth';

function accountIcon(account: BoundAccount) {
  if (account.providerId) {
    return findProvider(account.providerId)?.icon ?? findGame(account.gameId)?.icon;
  }
  return findGame(account.gameId)?.icon;
}

function phaseLabel(phase: UploadPhase): string {
  switch (phase.kind) {
    case 'idle':
      return '';
    case 'logging_in':
    case 'awaiting_friend':
    case 'fetching_scores':
    case 'uploading':
    case 'syncing':
    case 'canceling':
    case 'done':
    case 'error':
      return phase.message;
    default:
      return '';
  }
}

export function UploadDataSheet({
  visible,
  accounts,
  sessionsByAccountId,
  catalog,
  onClose,
  onPhaseChange,
  onFinished,
  temporarySelectedAccountIds,
  onLxnsTokensRotated,
}: {
  visible: boolean;
  accounts: BoundAccount[];
  sessionsByAccountId: Record<string, ProviderSession | undefined>;
  catalog: CatalogSnapshot | undefined;
  onClose: () => void;
  onPhaseChange?: (phase: UploadPhase) => void;
  onFinished?: (result: UploadResult) => void | Promise<void>;
  /** 仅本次打开使用；不覆盖用户平时保存的上传目标。 */
  temporarySelectedAccountIds?: readonly string[];
  onLxnsTokensRotated?: (accountId: string, session: LxnsOAuthSession) => void | Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [friendCode, setFriendCode] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [prefsReady, setPrefsReady] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>({ kind: 'idle' });
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<UploadResult | null>(null);
  const abortRef = useRef<ScoreHubAbortSignal>({ aborted: false });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistedSelectedIdsRef = useRef<string[]>([]);

  const targets = resolveUploadTargets(accounts, sessionsByAccountId);

  const persist = useCallback((nextCode: string, nextIds: string[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void uploadPrefsStore.save({
        friendCode: nextCode,
        selectedAccountIds: temporarySelectedAccountIds
          ? persistedSelectedIdsRef.current
          : nextIds,
      });
    }, 300);
  }, [temporarySelectedAccountIds]);

  const applyPhase = useCallback((next: UploadPhase) => {
    setPhase(next);
    onPhaseChange?.(next);
  }, [onPhaseChange]);

  useEffect(() => {
    if (!visible) {
      setPrefsReady(false);
      return;
    }
    let active = true;
    setPrefsReady(false);
    setLastResult(null);
    applyPhase({ kind: 'idle' });
    void uploadPrefsStore.load().then((prefs) => {
      if (!active) return;
      setFriendCode(prefs.friendCode);
      const writableIds = resolveUploadTargets(accounts, sessionsByAccountId)
        .filter((target) => target.writable)
        .map((target) => target.account.id);
      const restored = prefs.selectedAccountIds.filter((id) => writableIds.includes(id));
      const persisted = restored.length > 0 ? restored : writableIds;
      persistedSelectedIdsRef.current = persisted;
      const temporary = temporarySelectedAccountIds
        ?.filter((id) => writableIds.includes(id)) ?? [];
      setSelectedIds(temporarySelectedAccountIds ? temporary : persisted);
      setPrefsReady(true);
    });
    return () => {
      active = false;
    };
  }, [visible, accounts, sessionsByAccountId, temporarySelectedAccountIds, applyPhase]);

  useEffect(() => () => {
    abortRef.current.aborted = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const close = () => {
    onClose();
  };

  const cancelUpload = () => {
    if (!running || abortRef.current.aborted) return;
    abortRef.current.aborted = true;
    applyPhase({ kind: 'canceling', message: '正在取消上传…' });
  };

  const toggleAccount = (accountId: string, writable: boolean) => {
    if (!writable || running) return;
    setSelectedIds((prev) => {
      const next = prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId];
      persist(friendCode, next);
      return next;
    });
  };

  const onFriendCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 15);
    setFriendCode(digits);
    persist(digits, selectedIds);
  };

  const startUpload = async () => {
    if (running) return;
    if (!/^\d{15}$/.test(friendCode.trim())) {
      Alert.alert('好友码无效', '请输入 15 位数字好友码。');
      return;
    }
    if (selectedIds.filter((id) => targets.some((t) => t.writable && t.account.id === id)).length === 0) {
      Alert.alert('未选择目标', '请勾选至少一个可写入的查分器。');
      return;
    }
    if (!catalog) {
      Alert.alert('曲库未就绪', '请先同步曲库后再上传，否则无法匹配曲名。');
      return;
    }

    abortRef.current = { aborted: false };
    setRunning(true);
    applyPhase({ kind: 'logging_in', message: '正在创建好友申请任务…' });

    try {
      const result = await uploadMaimaiFromFriendCode({
        friendCode,
        selectedAccountIds: selectedIds,
        targets,
        sessionsByAccountId,
        catalog,
        signal: abortRef.current,
        onPhase: applyPhase,
        onNeedFriendAccept: (botFriendCode) => {
          Alert.alert(
            '请同意好友申请',
            botFriendCode
              ? `Bot（${botFriendCode}）已向你发送舞萌 NET 好友申请。请打开舞萌 NET 接受后，本页会继续自动进行。`
              : '请打开舞萌 NET 接受 Bot 的好友申请，接受后本页会继续自动进行。',
          );
        },
        onLxnsTokensRotated,
      });
      setLastResult(result);
      try {
        await onFinished?.(result);
      } catch (refreshError) {
        Alert.alert(
          '页面刷新失败',
          `成绩已上传并完成账号同步，但当前页面刷新失败：${
            refreshError instanceof Error ? refreshError.message : '请稍后手动同步。'
          }`,
        );
      }
    } catch (error) {
      if (abortRef.current.aborted) {
        applyPhase({ kind: 'idle' });
      } else {
        const message = error instanceof ScoreHubError || error instanceof ProviderError
          ? error.message
          : error instanceof Error
            ? error.message
            : '上传失败';
        applyPhase({ kind: 'error', message });
      }
    } finally {
      setRunning(false);
    }
  };

  const statusText = phaseLabel(phase);
  const botHint = phase.kind === 'awaiting_friend' && phase.botFriendCode
    ? `Bot 好友码：${phase.botFriendCode}`
    : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <Text style={styles.title}>上传数据</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭上传"
            hitSlop={12}
            onPress={close}
            style={({ pressed }) => [styles.closeHit, pressed && styles.softPressed]}
          >
            <Text style={styles.close}>关闭</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>好友码</Text>
          <TextInput
            accessibilityLabel="舞萌好友码"
            value={friendCode}
            onChangeText={onFriendCodeChange}
            keyboardType="number-pad"
            maxLength={15}
            placeholder="15 位数字"
            placeholderTextColor="#9CA3AF"
            editable={!running && prefsReady}
            style={styles.input}
          />
          <Text style={styles.hint}>从机台/DXNet 取成绩后上传到下方勾选的查分器。</Text>

          <Text style={styles.sectionLabel}>上传到</Text>
          <View style={styles.listCard}>
            {targets.length === 0 ? (
              <Text style={styles.empty}>当前游戏没有已绑定查分器</Text>
            ) : (
              targets.map((target, index) => {
                const checked = selectedIds.includes(target.account.id);
                const icon = accountIcon(target.account);
                return (
                  <Pressable
                    key={target.account.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`上传到 ${target.account.displayName}（${target.account.providerTitle}）`}
                    accessibilityState={{ checked, disabled: !target.writable || running }}
                    disabled={!target.writable || running}
                    onPress={() => toggleAccount(target.account.id, target.writable)}
                    style={({ pressed }) => [
                      styles.row,
                      index > 0 && styles.rowBorder,
                      pressed && target.writable && styles.softPressed,
                      !target.writable && styles.rowDisabled,
                    ]}
                  >
                    <View style={[styles.box, checked && target.writable && styles.boxOn]}>
                      {checked && target.writable ? <Text style={styles.boxMark}>✓</Text> : null}
                    </View>
                    {icon ? <Image source={icon} style={styles.icon} /> : <View style={styles.iconPlaceholder} />}
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{target.account.displayName}</Text>
                      <Text style={styles.rowSub}>{target.account.providerTitle}</Text>
                      {target.disableReason ? (
                        <Text style={styles.rowWarn}>{target.disableReason}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="开始上传"
            disabled={running || !prefsReady}
            onPress={() => void startUpload()}
            style={({ pressed }) => [
              styles.primary,
              (running || !prefsReady) && styles.primaryDisabled,
              pressed && !running && styles.softPressed,
            ]}
          >
            {running ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>开始上传</Text>
            )}
          </Pressable>

          {running ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="取消上传"
              disabled={phase.kind === 'canceling'}
              onPress={cancelUpload}
              style={({ pressed }) => [
                styles.cancel,
                phase.kind === 'canceling' && styles.primaryDisabled,
                pressed && phase.kind !== 'canceling' && styles.softPressed,
              ]}
            >
              <Text style={styles.primaryText}>
                {phase.kind === 'canceling' ? '正在取消…' : '取消上传'}
              </Text>
            </Pressable>
          ) : null}

          {statusText ? (
            <View style={styles.statusBox}>
              {running ? <ActivityIndicator color="#246BFD" style={styles.statusSpinner} /> : null}
              <Text style={[
                styles.statusText,
                phase.kind === 'error' && styles.statusError,
                phase.kind === 'done' && styles.statusDone,
              ]}
              >
                {statusText}
              </Text>
              {botHint ? <Text style={styles.statusBot}>{botHint}</Text> : null}
              {phase.kind === 'awaiting_friend' ? (
                <Text style={styles.statusBot}>打开舞萌 NET 接受好友申请后将自动继续</Text>
              ) : null}
            </View>
          ) : null}

          {lastResult ? (
            <View style={styles.resultList}>
              {lastResult.targetResults.map((result) => (
                <View key={result.account.id} style={styles.resultRow}>
                  <Text style={result.status === 'success' ? styles.resultSuccess : styles.resultFailure}>
                    {result.status === 'success' ? '✓' : '×'} {result.account.providerTitle}
                  </Text>
                  <Text style={styles.resultDetail}>
                    {result.status === 'success'
                      ? `写入 ${result.written} 条${result.skipped ? `，跳过 ${result.skipped} 条` : ''}${result.refreshFailed ? '，应用内刷新失败' : ''}`
                      : result.errorMessage ?? '写入失败'}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  title: { color: '#111827', fontSize: 18, fontWeight: '700' },
  closeHit: { paddingVertical: 4, paddingHorizontal: 4 },
  close: { color: '#246BFD', fontSize: 16, fontWeight: '600' },
  softPressed: { opacity: 0.7 },
  content: { paddingHorizontal: 20, paddingBottom: 28, gap: 12 },
  sectionLabel: { color: '#6B7280', fontSize: 13, fontWeight: '600', marginTop: 4 },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: '#111827',
    letterSpacing: 1,
  },
  hint: { color: '#9CA3AF', fontSize: 12, lineHeight: 18 },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  empty: { color: '#6B7280', padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  rowDisabled: { opacity: 0.55 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  boxOn: { backgroundColor: '#246BFD', borderColor: '#246BFD' },
  boxMark: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', lineHeight: 16 },
  icon: { width: 36, height: 36, borderRadius: 8 },
  iconPlaceholder: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#E5E7EB' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: '#111827', fontSize: 16, fontWeight: '600' },
  rowSub: { color: '#6B7280', fontSize: 13 },
  rowWarn: { color: '#B45309', fontSize: 12, marginTop: 2 },
  primary: {
    marginTop: 8,
    backgroundColor: '#246BFD',
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: { opacity: 0.55 },
  cancel: {
    backgroundColor: '#DC2626',
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  statusBox: {
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  statusSpinner: { alignSelf: 'flex-start', marginBottom: 4 },
  statusText: { color: '#374151', fontSize: 14, lineHeight: 20 },
  statusError: { color: '#B91C1C' },
  statusDone: { color: '#047857' },
  statusBot: { color: '#6B7280', fontSize: 12, lineHeight: 18 },
  resultList: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, gap: 10 },
  resultRow: { gap: 3 },
  resultSuccess: { color: '#16803A', fontWeight: '700' },
  resultFailure: { color: '#B42318', fontWeight: '700' },
  resultDetail: { color: '#6B7280', fontSize: 12, lineHeight: 18 },
});
