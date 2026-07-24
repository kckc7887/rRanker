import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BoundAccount } from '@/domain/bound-account';
import { findGame, findProvider } from '@/domain/game-bind-options';
import type { CatalogSnapshot } from '@/domain/models';
import type { ProviderSession } from '@/providers/contracts';
import type { ScoreHubAbortSignal, ScoreHubDxnetJobStats } from '@/services/score-hub-client';
import { fetchMe, fetchScoreHubStatistics, ScoreHubError } from '@/services/score-hub-client';
import {
  decodeMaimaiQrFromImageUri,
  extractMaimaiQrPayload,
  QrDecodeError,
} from '@/services/maimai-qr-decode';
import {
  FRIEND_REQUEST_REFRESH_HINT,
  bindScoreHubCabinetByQr,
  formatScoreHubStatsSummary,
  isScoreHubAuthExpired,
  resolveUploadTargets,
  scoreHubSuccessHint,
  uploadMaimaiFromFriendCode,
  uploadMaimaiWithScoreHubSession,
  type UploadPhase,
  type UploadResult,
} from '@/services/upload-maimai-from-friend-code';
import { uploadPrefsStore } from '@/storage/upload-prefs-store';
import {
  scoreHubAccountStore,
  type ScoreHubAccountEntry,
} from '@/storage/score-hub-account-store';
import { ProviderError } from '@/providers/errors';
import type { LxnsOAuthSession } from '@/providers/lxns-oauth';
import { useNotification } from '@/components/AppNotification';
import { AppModal } from '@/components/AppModal';
import { isMaimaiMaintenanceWindow, MAIMAI_MAINTENANCE_MESSAGE } from '@/domain/maimai-maintenance';
import { useAppTheme } from '@/theme/app-theme';

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
    case 'sending_friend':
    case 'awaiting_friend':
    case 'fetching_scores':
    case 'binding':
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
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { showActionNotification, showNotification } = useNotification();
  const [friendCode, setFriendCode] = useState('');
  const [bindQrText, setBindQrText] = useState('');
  const [hasCabinetBound, setHasCabinetBound] = useState(false);
  const [hasStoredToken, setHasStoredToken] = useState(false);
  const [storedAccounts, setStoredAccounts] = useState<ScoreHubAccountEntry[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [bindPanelOpen, setBindPanelOpen] = useState(false);
  const [bindingLookup, setBindingLookup] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [prefsReady, setPrefsReady] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>({ kind: 'idle' });
  const [running, setRunning] = useState(false);
  const [decodingQr, setDecodingQr] = useState(false);
  const [lastResult, setLastResult] = useState<UploadResult | null>(null);
  const [stats, setStats] = useState<ScoreHubDxnetJobStats | null>(null);
  const [statsStatus, setStatsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const abortRef = useRef<ScoreHubAbortSignal>({ aborted: false });
  const uploadInFlightRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistedSelectedIdsRef = useRef<string[]>([]);
  const wasVisibleRef = useRef(false);
  const bindLookupSeqRef = useRef(0);

  const targets = resolveUploadTargets(accounts, sessionsByAccountId);
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
  const showBindButton = hasStoredToken && !hasCabinetBound;
  const useSessionUpload = hasStoredToken && hasCabinetBound;

  const persist = useCallback((nextCode: string, nextIds: string[], writeSelection = true) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void uploadPrefsStore.save({
        friendCode: nextCode,
        selectedAccountIds: nextIds,
        // 临时勾选仅改当前会话 UI，不写入该好友码的持久勾选
        writeSelection: temporarySelectedAccountIds ? false : writeSelection,
      });
    }, 300);
  }, [temporarySelectedAccountIds]);

  const resolveSelectionForCode = useCallback((
    code: string,
    prefs: Awaited<ReturnType<typeof uploadPrefsStore.load>>,
    writableIds: string[],
  ) => {
    const trimmed = code.trim();
    const map = prefs.selectionsByFriendCode ?? {};
    const stored = map[trimmed]
      ?? (prefs.friendCode === trimmed ? prefs.selectedAccountIds : []);
    const restored = (stored ?? []).filter((id) => writableIds.includes(id));
    return restored.length > 0 ? restored : writableIds;
  }, []);

  const applyPhase = useCallback((next: UploadPhase) => {
    setPhase(next);
    onPhaseChange?.(next);
    if (idleResetTimerRef.current) {
      clearTimeout(idleResetTimerRef.current);
      idleResetTimerRef.current = null;
    }
    if (next.kind === 'done') {
      idleResetTimerRef.current = setTimeout(() => {
        idleResetTimerRef.current = null;
        setPhase({ kind: 'idle' });
        onPhaseChange?.({ kind: 'idle' });
      }, 5_000);
    }
  }, [onPhaseChange]);

  const refreshStoredList = useCallback(async () => {
    const list = await scoreHubAccountStore.listWithToken();
    setStoredAccounts(list);
    return list;
  }, []);

  const applyLocalAccountState = useCallback((code: string, entry: ScoreHubAccountEntry | null) => {
    setHasStoredToken(Boolean(entry?.token));
    setHasCabinetBound(entry?.hasCabinetBound === true);
    if (entry?.hasCabinetBound) setBindPanelOpen(false);
  }, []);

  const refreshBindStatus = useCallback(async (code: string) => {
    const trimmed = code.trim();
    const seq = ++bindLookupSeqRef.current;
    if (!/^\d{15}$/.test(trimmed)) {
      const entry = trimmed ? await scoreHubAccountStore.getByFriendCode(trimmed) : null;
      if (seq !== bindLookupSeqRef.current) return;
      applyLocalAccountState(trimmed, entry);
      setBindingLookup(false);
      return;
    }

    setBindingLookup(true);
    try {
      await scoreHubAccountStore.select(trimmed);
      const entry = await scoreHubAccountStore.getByFriendCode(trimmed);
      if (seq !== bindLookupSeqRef.current) return;
      applyLocalAccountState(trimmed, entry);

      if (!entry?.token) {
        setBindingLookup(false);
        return;
      }

      try {
        const me = await fetchMe(entry.token);
        if (seq !== bindLookupSeqRef.current) return;
        const bound = me.hasCabinetUserId === true;
        await scoreHubAccountStore.upsert({
          friendCode: me.friendCode ?? trimmed,
          token: entry.token,
          hasCabinetBound: bound,
        });
        if (seq !== bindLookupSeqRef.current) return;
        setHasCabinetBound(bound);
        setHasStoredToken(true);
        if (bound) setBindPanelOpen(false);
        await refreshStoredList();
      } catch (error) {
        if (seq !== bindLookupSeqRef.current) return;
        // JWT 过期：保留本地绑定缓存与 token，上传时会话失败再回退好友码
        if (!isScoreHubAuthExpired(error)) {
          // 网络错误等：沿用本地缓存
        }
      }
    } finally {
      if (seq === bindLookupSeqRef.current) setBindingLookup(false);
    }
  }, [applyLocalAccountState, refreshStoredList]);

  // 关闭弹窗不中止上传，以便总览按钮小字继续显示进度；仅显式取消/卸载时 abort。
  useEffect(() => {
    if (!visible) {
      setDecodingQr(false);
      setPrefsReady(false);
      setHistoryVisible(false);
      wasVisibleRef.current = false;
      return;
    }
    const justOpened = !wasVisibleRef.current;
    wasVisibleRef.current = true;
    if (!justOpened) return;

    let active = true;
    const inFlight = uploadInFlightRef.current;
    setDecodingQr(false);
    setPrefsReady(false);
    setBindPanelOpen(false);
    if (inFlight) {
      setRunning(true);
    } else {
      abortRef.current = { aborted: false };
      setRunning(false);
      setLastResult(null);
      setBindQrText('');
    }
    void Promise.all([
      uploadPrefsStore.load(),
      scoreHubAccountStore.load(),
      scoreHubAccountStore.listWithToken(),
    ]).then(([prefs, hubAccount, list]) => {
      if (!active) return;
      const code = prefs.friendCode || hubAccount.friendCode;
      setFriendCode(code);
      setStoredAccounts(list);
      setHasStoredToken(Boolean(hubAccount.token) || list.some((item) => item.friendCode === code));
      setHasCabinetBound(hubAccount.hasCabinetBound);
      const writableIds = resolveUploadTargets(accounts, sessionsByAccountId)
        .filter((target) => target.writable)
        .map((target) => target.account.id);
      const persisted = resolveSelectionForCode(code, prefs, writableIds);
      persistedSelectedIdsRef.current = persisted;
      const temporary = temporarySelectedAccountIds
        ?.filter((id) => writableIds.includes(id)) ?? [];
      setSelectedIds(temporarySelectedAccountIds ? temporary : persisted);
      setPrefsReady(true);
      if (!inFlight && code) {
        void refreshBindStatus(code);
      }
    });
    return () => {
      active = false;
    };
  }, [
    visible,
    accounts,
    sessionsByAccountId,
    temporarySelectedAccountIds,
    refreshBindStatus,
    resolveSelectionForCode,
  ]);

  useEffect(() => {
    if (!visible || running) return;
    const writableIds = new Set(
      resolveUploadTargets(accounts, sessionsByAccountId)
        .filter((target) => target.writable)
        .map((target) => target.account.id),
    );
    setSelectedIds((prev) => prev.filter((id) => writableIds.has(id)));
  }, [visible, running, accounts, sessionsByAccountId]);

  useEffect(() => {
    if (!visible || running) return;
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
  }, [visible, running]);

  useEffect(() => () => {
    abortRef.current.aborted = true;
    uploadInFlightRef.current = false;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (idleResetTimerRef.current) clearTimeout(idleResetTimerRef.current);
  }, []);

  const close = () => {
    setDecodingQr(false);
    setHistoryVisible(false);
    onClose();
  };

  const cancelUpload = () => {
    if (!running || abortRef.current.aborted) return;
    abortRef.current.aborted = true;
    applyPhase({ kind: 'canceling', message: '正在取消…' });
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
    persist(digits, selectedIds, /^\d{15}$/.test(digits));
    if (digits.length === 15) {
      void (async () => {
        if (!temporarySelectedAccountIds) {
          const prefs = await uploadPrefsStore.load();
          const writableIds = resolveUploadTargets(accounts, sessionsByAccountId)
            .filter((target) => target.writable)
            .map((target) => target.account.id);
          const nextIds = resolveSelectionForCode(digits, prefs, writableIds);
          setSelectedIds(nextIds);
          persistedSelectedIdsRef.current = nextIds;
        }
        await refreshBindStatus(digits);
      })();
    } else {
      void scoreHubAccountStore.getByFriendCode(digits).then((entry) => {
        applyLocalAccountState(digits, entry);
      });
      setBindPanelOpen(false);
    }
  };

  const selectStoredFriendCode = async (code: string) => {
    if (running || decodingQr) return;
    setHistoryVisible(false);
    setFriendCode(code);
    if (!temporarySelectedAccountIds) {
      const prefs = await uploadPrefsStore.load();
      const writableIds = resolveUploadTargets(accounts, sessionsByAccountId)
        .filter((target) => target.writable)
        .map((target) => target.account.id);
      const nextIds = resolveSelectionForCode(code, prefs, writableIds);
      setSelectedIds(nextIds);
      persistedSelectedIdsRef.current = nextIds;
      persist(code, nextIds, false);
    } else {
      persist(code, selectedIds, false);
    }
    await scoreHubAccountStore.select(code);
    await refreshBindStatus(code);
  };

  const removeStoredFriendCode = async (code: string) => {
    if (running || decodingQr) return;
    await scoreHubAccountStore.remove(code);
    await uploadPrefsStore.removeSelection(code);
    const list = await refreshStoredList();
    if (list.length === 0) setHistoryVisible(false);
    if (friendCode.trim() === code.trim()) {
      setHasStoredToken(false);
      setHasCabinetBound(false);
      setBindPanelOpen(false);
    }
  };

  const applyQrText = (raw: string) => {
    const extracted = extractMaimaiQrPayload(raw) ?? raw.trim();
    setBindQrText(extracted);
  };

  const pickQrImage = async () => {
    if (running || decodingQr || hasCabinetBound || !bindPanelOpen) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showNotification({
        title: '需要相册权限',
        message: '请允许访问相册后再选择二维码图片。',
        variant: 'warning',
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.uri) {
      showNotification({ title: '选择图片失败', message: '没有读取到二维码图片。', variant: 'warning' });
      return;
    }

    setDecodingQr(true);
    try {
      const payload = await decodeMaimaiQrFromImageUri(asset.uri);
      applyQrText(payload);
      showNotification({
        title: '已识别二维码',
        message: '绑定用字符串已填入，可点「绑定二维码」。',
        variant: 'success',
      });
    } catch (error) {
      const message = error instanceof QrDecodeError || error instanceof Error
        ? error.message
        : '识别二维码失败';
      showNotification({ title: '识别失败', message, variant: 'error' });
    } finally {
      setDecodingQr(false);
    }
  };

  const pasteQrText = async () => {
    if (running || decodingQr || hasCabinetBound || !bindPanelOpen) return;
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) {
      showNotification({
        title: '剪贴板为空',
        message: '请先复制公众号玩家二维码字符串。',
        variant: 'warning',
      });
      return;
    }
    applyQrText(text);
  };

  const runFriendCodeUpload = async () => uploadMaimaiFromFriendCode({
    friendCode,
    selectedAccountIds: selectedIds,
    targets,
    sessionsByAccountId,
    catalog: catalog!,
    signal: abortRef.current,
    onPhase: applyPhase,
    onNeedFriendAccept: (botFriendCode) => {
      showActionNotification({
        title: '请同意好友申请',
        message: botFriendCode
          ? `Bot（${botFriendCode}）已向你发送好友申请。请打开“舞萌-中二公众号-我的记录-舞萌DX”接受后，本页会继续自动进行。`
          : '请打开“舞萌-中二公众号-我的记录-舞萌DX”接受 Bot 的好友申请，接受后本页会继续自动进行。',
        variant: 'info',
        actions: [{ label: '知道了', tone: 'default' }],
      });
    },
    onLxnsTokensRotated,
  });

  const startUpload = async () => {
    if (running || decodingQr) return;
    if (isMaimaiMaintenanceWindow()) {
      showNotification({ title: '游戏服务器维护中', message: MAIMAI_MAINTENANCE_MESSAGE, variant: 'warning' });
      return;
    }
    if (!/^\d{15}$/.test(friendCode.trim())) {
      showNotification({ title: '好友码无效', message: '请输入 15 位数字好友码。', variant: 'warning' });
      return;
    }
    if (selectedIds.filter((id) => targets.some((t) => t.writable && t.account.id === id)).length === 0) {
      showNotification({ title: '未选择目标', message: '请勾选至少一个可写入的查分器。', variant: 'warning' });
      return;
    }
    if (!catalog) {
      showNotification({ title: '曲库未就绪', message: '请先同步曲库后再上传，否则无法匹配曲名。', variant: 'warning' });
      return;
    }

    abortRef.current = { aborted: false };
    uploadInFlightRef.current = true;
    setRunning(true);
    setLastResult(null);
    const preferSession = useSessionUpload;
    applyPhase({
      kind: 'logging_in',
      message: preferSession
        ? '正在使用已登录的 ScoreHub 会话…'
        : '正在创建好友申请任务…',
      authMode: preferSession ? 'session' : 'friend_code',
    });

    try {
      let result: UploadResult;
      if (preferSession) {
        try {
          result = await uploadMaimaiWithScoreHubSession({
            expectedFriendCode: friendCode.trim(),
            selectedAccountIds: selectedIds,
            targets,
            sessionsByAccountId,
            catalog,
            signal: abortRef.current,
            onPhase: applyPhase,
            onLxnsTokensRotated,
          });
        } catch (error) {
          if (abortRef.current.aborted) throw error;
          if (!isScoreHubAuthExpired(error)) throw error;
          applyPhase({
            kind: 'logging_in',
            message: '会话已失效，改用好友码重新登录…',
            authMode: 'friend_code',
          });
          result = await runFriendCodeUpload();
        }
      } else {
        result = await runFriendCodeUpload();
      }

      setLastResult(result);
      await refreshStoredList();
      await refreshBindStatus(friendCode.trim());
      try {
        await onFinished?.(result);
      } catch (refreshError) {
        showNotification({
          title: '页面刷新失败',
          message: `成绩已上传并完成账号同步，但当前页面刷新失败：${
            refreshError instanceof Error ? refreshError.message : '请稍后手动同步。'
          }`,
          variant: 'error',
        });
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
      uploadInFlightRef.current = false;
      setRunning(false);
    }
  };

  const startBindCabinet = async () => {
    if (running || decodingQr || hasCabinetBound || !hasStoredToken) return;
    if (isMaimaiMaintenanceWindow()) {
      showNotification({ title: '游戏服务器维护中', message: MAIMAI_MAINTENANCE_MESSAGE, variant: 'warning' });
      return;
    }
    if (!bindQrText.trim()) {
      showNotification({
        title: '缺少绑定二维码',
        message: '请粘贴或识别公众号玩家二维码后再绑定。',
        variant: 'warning',
      });
      return;
    }

    abortRef.current = { aborted: false };
    uploadInFlightRef.current = true;
    setRunning(true);
    setLastResult(null);
    applyPhase({ kind: 'binding', message: '正在绑定玩家二维码…' });

    try {
      await bindScoreHubCabinetByQr({
        qrCode: bindQrText.trim(),
        friendCode: friendCode.trim() || null,
        signal: abortRef.current,
        onPhase: applyPhase,
      });
      setHasCabinetBound(true);
      setBindQrText('');
      setBindPanelOpen(false);
      applyPhase({
        kind: 'done',
        message: '玩家二维码已绑定。之后开始上传将复用登录会话拉分，不会再次发起好友申请。',
        uploaded: 0,
        skipped: 0,
      });
      showNotification({
        title: '绑定成功',
        message: '已绑定。开始上传将优先使用已登录会话拉分。',
        variant: 'success',
      });
      await refreshStoredList();
    } catch (error) {
      if (abortRef.current.aborted) {
        applyPhase({ kind: 'idle' });
      } else {
        const message = error instanceof ScoreHubError || error instanceof Error
          ? error.message
          : '绑定失败';
        applyPhase({ kind: 'error', message });
        showNotification({ title: '绑定失败', message, variant: 'error' });
      }
    } finally {
      uploadInFlightRef.current = false;
      setRunning(false);
    }
  };

  const statusText = phaseLabel(phase);
  const botHint = phase.kind === 'awaiting_friend' && phase.botFriendCode
    ? `Bot 好友码：${phase.botFriendCode}`
    : null;
  const busy = running || decodingQr;

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.background }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>上传数据</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭上传"
            hitSlop={12}
            onPress={close}
            style={({ pressed }) => [styles.closeHit, pressed && styles.softPressed]}
          >
            <Text style={[styles.close, { color: theme.accent }]}>关闭</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>好友码</Text>
          <View style={styles.friendCodeBlock}>
            <View style={styles.friendCodeRow}>
              <TextInput
                accessibilityLabel="舞萌好友码"
                value={friendCode}
                onChangeText={onFriendCodeChange}
                keyboardType="number-pad"
                maxLength={15}
                placeholder="15 位数字"
                placeholderTextColor={theme.textMuted}
                editable={!busy && prefsReady}
                style={[
                  styles.input,
                  styles.friendCodeInput,
                  { backgroundColor: theme.input, borderColor: theme.border, color: theme.text, borderWidth: 1 },
                ]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="选择已保存的 ScoreHub 好友码"
                accessibilityState={{ expanded: historyVisible }}
                disabled={busy || !prefsReady || storedAccounts.length === 0}
                onPress={() => {
                  if (historyVisible) {
                    setHistoryVisible(false);
                    return;
                  }
                  void refreshStoredList().then((list) => {
                    if (list.length > 0) setHistoryVisible(true);
                  });
                }}
                style={({ pressed }) => [
                  styles.historyButton,
                  { borderColor: theme.border, backgroundColor: theme.surface },
                  historyVisible && { borderColor: theme.accent },
                  (busy || !prefsReady || storedAccounts.length === 0) && styles.primaryDisabled,
                  pressed && !busy && styles.softPressed,
                ]}
              >
                <Text style={[styles.secondaryText, { color: theme.accent }]}>
                  {historyVisible ? '收起' : '历史'}
                </Text>
              </Pressable>
            </View>
            {historyVisible && storedAccounts.length > 0 ? (
              <View
                accessibilityLabel="ScoreHub 好友码历史列表"
                style={[styles.historyDropdown, { backgroundColor: theme.surface, borderColor: theme.border }]}
              >
                {storedAccounts.map((entry, index) => (
                  <View
                    key={entry.friendCode}
                    style={[
                      styles.historyRow,
                      index > 0 && [styles.historyRowBorder, { borderTopColor: theme.border }],
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`选择好友码 ${entry.friendCode}`}
                      disabled={busy}
                      onPress={() => void selectStoredFriendCode(entry.friendCode)}
                      style={({ pressed }) => [styles.historySelect, pressed && !busy && styles.softPressed]}
                    >
                      <Text style={[styles.historyCode, { color: theme.text }]}>{entry.friendCode}</Text>
                      <Text style={[styles.historyMeta, { color: theme.textMuted }]}>
                        {entry.hasCabinetBound ? '已绑定二维码' : '未绑定二维码'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`删除好友码 ${entry.friendCode}`}
                      disabled={busy}
                      hitSlop={8}
                      onPress={() => void removeStoredFriendCode(entry.friendCode)}
                      style={({ pressed }) => [
                        styles.historyDelete,
                        pressed && !busy && styles.softPressed,
                      ]}
                    >
                      <Text style={[styles.historyDeleteText, { color: theme.danger }]}>删除</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            从游戏服务器取成绩后上传到下方勾选的查分器。
          </Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>{FRIEND_REQUEST_REFRESH_HINT}</Text>
          {bindingLookup ? (
            <Text style={[styles.hint, { color: theme.textMuted }]}>正在查询绑定状态…</Text>
          ) : hasCabinetBound ? (
            <Text accessibilityLabel="玩家二维码已绑定" style={[styles.hint, { color: theme.success }]}>
              玩家二维码已绑定。开始上传将优先复用 ScoreHub 会话，过期时自动回退好友码登录。
            </Text>
          ) : hasStoredToken ? (
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              已登录但未绑定玩家二维码。可用下方按钮绑定后，下次上传走会话快路径。
            </Text>
          ) : (
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              完成一次好友码上传后可保存登录态；再绑定玩家二维码后可免好友申请拉分。
            </Text>
          )}

          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>服务状态</Text>
          <View style={[styles.statusBox, { backgroundColor: theme.surface, marginTop: 0 }]}>
            {statsStatus === 'loading' ? (
              <ActivityIndicator color={theme.accent} style={styles.statusSpinner} />
            ) : null}
            <Text accessibilityLabel="score-hub 近一小时统计" style={[styles.statusText, { color: theme.textSecondary }]}>
              {statsSummary}
            </Text>
            {statsHint ? (
              <Text accessibilityLabel="score-hub 成功率提示" style={[styles.statusBot, { color: theme.textMuted }]}>
                {statsHint}
              </Text>
            ) : null}
          </View>

          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>上传到</Text>
          <View style={[styles.listCard, { backgroundColor: theme.surface }]}>
            {targets.length === 0 ? (
              <Text style={[styles.empty, { color: theme.textMuted }]}>当前游戏没有已绑定查分器</Text>
            ) : (
              targets.map((target, index) => {
                const checked = selectedIds.includes(target.account.id);
                const icon = accountIcon(target.account);
                return (
                  <Pressable
                    key={target.account.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`上传到 ${target.account.displayName}（${target.account.providerTitle}）`}
                    accessibilityState={{ checked, disabled: !target.writable || busy }}
                    disabled={!target.writable || busy}
                    onPress={() => toggleAccount(target.account.id, target.writable)}
                    style={({ pressed }) => [
                      styles.row,
                      index > 0 && [styles.rowBorder, { borderTopColor: theme.border }],
                      pressed && target.writable && styles.softPressed,
                      !target.writable && styles.rowDisabled,
                    ]}
                  >
                    <View style={[
                      styles.box,
                      { borderColor: theme.border, backgroundColor: theme.input },
                      checked && target.writable && { backgroundColor: theme.accent, borderColor: theme.accent },
                    ]}
                    >
                      {checked && target.writable ? <Text style={styles.boxMark}>✓</Text> : null}
                    </View>
                    {icon ? <Image source={icon} style={styles.icon} /> : (
                      <View style={[styles.iconPlaceholder, { backgroundColor: theme.surfaceMuted }]} />
                    )}
                    <View style={styles.rowBody}>
                      <Text style={[styles.rowTitle, { color: theme.text }]}>{target.account.displayName}</Text>
                      <Text style={[styles.rowSub, { color: theme.textMuted }]}>{target.account.providerTitle}</Text>
                      {target.disableReason ? (
                        <Text style={[styles.rowWarn, { color: theme.warning }]}>{target.disableReason}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>

          {showBindButton ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="通过神秘二维码绑定"
                accessibilityState={{ expanded: bindPanelOpen }}
                disabled={busy || !prefsReady}
                onPress={() => setBindPanelOpen((open) => !open)}
                style={({ pressed }) => [
                  styles.secondary,
                  { borderColor: theme.border, backgroundColor: theme.surface, flex: 0 },
                  (busy || !prefsReady) && styles.primaryDisabled,
                  pressed && !busy && styles.softPressed,
                ]}
              >
                <Text style={[styles.secondaryText, { color: theme.accent }]}>
                  {bindPanelOpen ? '收起神秘二维码绑定' : '通过神秘二维码绑定'}
                </Text>
              </Pressable>
              {bindPanelOpen ? (
                <>
                  <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>玩家二维码</Text>
                  <TextInput
                    accessibilityLabel="绑定用玩家二维码字符串"
                    value={bindQrText}
                    onChangeText={setBindQrText}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    textContentType="none"
                    contextMenuHidden={false}
                    multiline
                    placeholder="粘贴 SGWCMAID… 字符串"
                    placeholderTextColor={theme.textMuted}
                    editable={!busy && prefsReady}
                    style={[
                      styles.input,
                      styles.qrInput,
                      {
                        backgroundColor: theme.input,
                        borderColor: theme.border,
                        color: theme.text,
                        borderWidth: 1,
                      },
                    ]}
                  />
                  <View style={styles.qrActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="粘贴绑定用二维码字符串"
                      disabled={busy || !prefsReady}
                      onPress={() => void pasteQrText()}
                      style={({ pressed }) => [
                        styles.secondary,
                        { borderColor: theme.border, backgroundColor: theme.surface },
                        (busy || !prefsReady) && styles.primaryDisabled,
                        pressed && !busy && styles.softPressed,
                      ]}
                    >
                      <Text style={[styles.secondaryText, { color: theme.accent }]}>粘贴</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="从相册选择绑定用二维码图片"
                      disabled={busy || !prefsReady}
                      onPress={() => void pickQrImage()}
                      style={({ pressed }) => [
                        styles.secondary,
                        { borderColor: theme.border, backgroundColor: theme.surface },
                        (busy || !prefsReady) && styles.primaryDisabled,
                        pressed && !busy && styles.softPressed,
                      ]}
                    >
                      {decodingQr ? (
                        <ActivityIndicator color={theme.accent} />
                      ) : (
                        <Text style={[styles.secondaryText, { color: theme.accent }]}>从相册选择</Text>
                      )}
                    </Pressable>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="绑定玩家二维码"
                    disabled={busy || !prefsReady}
                    onPress={() => void startBindCabinet()}
                    style={({ pressed }) => [
                      styles.secondary,
                      { borderColor: theme.accent, backgroundColor: theme.surface, flex: 0 },
                      (busy || !prefsReady) && styles.primaryDisabled,
                      pressed && !busy && styles.softPressed,
                    ]}
                  >
                    {running && phase.kind === 'binding' ? (
                      <ActivityIndicator color={theme.accent} />
                    ) : (
                      <Text style={[styles.secondaryText, { color: theme.accent }]}>绑定二维码</Text>
                    )}
                  </Pressable>
                </>
              ) : null}
            </>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="开始上传"
            disabled={busy || !prefsReady}
            onPress={() => void startUpload()}
            style={({ pressed }) => [
              styles.primary, { backgroundColor: theme.accent },
              (busy || !prefsReady) && styles.primaryDisabled,
              pressed && !busy && styles.softPressed,
            ]}
          >
            {running && phase.kind !== 'binding' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>开始上传</Text>
            )}
          </Pressable>

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

          {statusText ? (
            <View style={[styles.statusBox, { backgroundColor: theme.surface }]}>
              {running ? <ActivityIndicator color={theme.accent} style={styles.statusSpinner} /> : null}
              <Text style={[
                styles.statusText,
                { color: theme.textSecondary },
                phase.kind === 'error' && { color: theme.danger },
                phase.kind === 'done' && { color: theme.success },
              ]}
              >
                {statusText}
              </Text>
              {botHint ? <Text style={[styles.statusBot, { color: theme.textMuted }]}>{botHint}</Text> : null}
              {phase.kind === 'awaiting_friend' ? (
                <>
                  <Text style={[styles.statusBot, { color: theme.textMuted }]}>打开“舞萌-中二公众号-我的记录-舞萌DX”接受好友申请后将自动继续</Text>
                  <Text style={[styles.statusBot, { color: theme.textMuted }]}>{FRIEND_REQUEST_REFRESH_HINT}</Text>
                </>
              ) : null}
            </View>
          ) : null}

          {lastResult ? (
            <View style={[styles.resultList, { backgroundColor: theme.surface }]}>
              {lastResult.targetResults.map((result) => (
                <View key={result.account.id} style={styles.resultRow}>
                  <Text style={result.status === 'success'
                    ? [styles.resultSuccess, { color: theme.success }]
                    : [styles.resultFailure, { color: theme.danger }]}
                  >
                    {result.status === 'success' ? '✓' : '×'} {result.account.providerTitle}
                  </Text>
                  <Text style={[styles.resultDetail, { color: theme.textMuted }]}>
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
    </AppModal>
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
  friendCodeBlock: { gap: 8 },
  friendCodeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  friendCodeInput: { flex: 1 },
  historyButton: {
    minHeight: 48,
    minWidth: 64,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyDropdown: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 10,
  },
  historyRowBorder: { borderTopWidth: StyleSheet.hairlineWidth },
  historySelect: { flex: 1, gap: 2, paddingVertical: 2 },
  historyCode: { fontSize: 15, fontWeight: '600', letterSpacing: 1 },
  historyMeta: { fontSize: 12 },
  historyDelete: {
    minHeight: 36,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyDeleteText: { fontSize: 13, fontWeight: '700' },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: '#111827',
    letterSpacing: 1,
  },
  qrInput: {
    letterSpacing: 0,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  hint: { color: '#9CA3AF', fontSize: 12, lineHeight: 18 },
  qrActions: { flexDirection: 'row', gap: 8 },
  secondary: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 14, fontWeight: '700' },
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
  statusBot: { color: '#6B7280', fontSize: 12, lineHeight: 18 },
  resultList: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, gap: 10 },
  resultRow: { gap: 3 },
  resultSuccess: { color: '#16803A', fontWeight: '700' },
  resultFailure: { color: '#B42318', fontWeight: '700' },
  resultDetail: { color: '#6B7280', fontSize: 12, lineHeight: 18 },
});
