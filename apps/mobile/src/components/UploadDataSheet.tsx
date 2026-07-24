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
import { fetchScoreHubStatistics, ScoreHubError } from '@/services/score-hub-client';
import {
  decodeMaimaiQrFromImageUri,
  extractMaimaiQrPayload,
  QrDecodeError,
} from '@/services/maimai-qr-decode';
import {
  FRIEND_REQUEST_REFRESH_HINT,
  bindScoreHubCabinetByQr,
  formatScoreHubStatsSummary,
  QR_REQUIRES_BIND_MESSAGE,
  resolveUploadTargets,
  scoreHubSuccessHint,
  uploadMaimaiFromFriendCode,
  uploadMaimaiFromQrLogin,
  type UploadPhase,
  type UploadResult,
} from '@/services/upload-maimai-from-friend-code';
import { uploadPrefsStore } from '@/storage/upload-prefs-store';
import { scoreHubAccountStore } from '@/storage/score-hub-account-store';
import { ProviderError } from '@/providers/errors';
import type { LxnsOAuthSession } from '@/providers/lxns-oauth';
import { useNotification } from '@/components/AppNotification';
import { AppModal } from '@/components/AppModal';
import { isMaimaiMaintenanceWindow, MAIMAI_MAINTENANCE_MESSAGE } from '@/domain/maimai-maintenance';
import { useAppTheme } from '@/theme/app-theme';

type UploadAuthMode = 'friend_code' | 'qr';

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
  const [authMode, setAuthMode] = useState<UploadAuthMode>('friend_code');
  const [friendCode, setFriendCode] = useState('');
  const [qrText, setQrText] = useState('');
  const [bindQrText, setBindQrText] = useState('');
  const [hasCabinetBound, setHasCabinetBound] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [prefsReady, setPrefsReady] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>({ kind: 'idle' });
  const [running, setRunning] = useState(false);
  const [decodingQr, setDecodingQr] = useState(false);
  const [lastResult, setLastResult] = useState<UploadResult | null>(null);
  const [stats, setStats] = useState<ScoreHubDxnetJobStats | null>(null);
  const [statsStatus, setStatsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const abortRef = useRef<ScoreHubAbortSignal>({ aborted: false });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistedSelectedIdsRef = useRef<string[]>([]);
  const wasVisibleRef = useRef(false);

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

  // 关闭时中止进行中的上传/绑定，避免离开后再打开仍卡在 running。
  useEffect(() => {
    if (!visible) {
      abortRef.current.aborted = true;
      setRunning(false);
      setDecodingQr(false);
      setPrefsReady(false);
      wasVisibleRef.current = false;
      return;
    }
    const justOpened = !wasVisibleRef.current;
    wasVisibleRef.current = true;
    if (!justOpened) return;

    let active = true;
    abortRef.current = { aborted: false };
    setRunning(false);
    setPrefsReady(false);
    setLastResult(null);
    setQrText('');
    setBindQrText('');
    setDecodingQr(false);
    applyPhase({ kind: 'idle' });
    void Promise.all([
      uploadPrefsStore.load(),
      scoreHubAccountStore.load(),
    ]).then(([prefs, hubAccount]) => {
      if (!active) return;
      setFriendCode(prefs.friendCode || hubAccount.friendCode);
      setHasCabinetBound(hubAccount.hasCabinetBound);
      setAuthMode('friend_code');
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

  // 打开期间账号变化时，仅收敛勾选，不重置登录方式。
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
    if (!visible || running || authMode !== 'friend_code') return;
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
  }, [visible, running, authMode]);

  useEffect(() => () => {
    abortRef.current.aborted = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const close = () => {
    abortRef.current.aborted = true;
    setRunning(false);
    setDecodingQr(false);
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
    persist(digits, selectedIds);
  };

  const switchAuthMode = (mode: UploadAuthMode) => {
    if (running || decodingQr || mode === authMode) return;
    setAuthMode(mode);
    if (phase.kind === 'error' || phase.kind === 'done' || phase.kind === 'idle') {
      applyPhase({ kind: 'idle' });
    }
    if (mode === 'qr') setLastResult(null);
  };

  const applyQrText = (raw: string, target: 'login' | 'bind' = authMode === 'qr' && !hasCabinetBound ? 'bind' : 'login') => {
    const extracted = extractMaimaiQrPayload(raw) ?? raw.trim();
    if (target === 'bind') setBindQrText(extracted);
    else setQrText(extracted);
  };

  const pickQrImage = async (target: 'login' | 'bind' = authMode === 'qr' && !hasCabinetBound ? 'bind' : 'login') => {
    if (running || decodingQr) return;
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
      applyQrText(payload, target);
      showNotification({
        title: '已识别二维码',
        message: target === 'bind'
          ? '绑定用字符串已填入，可点「绑定二维码」。'
          : '字符串已填入输入框，可直接开始上传。',
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

  const pasteQrText = async (target: 'login' | 'bind' = authMode === 'qr' && !hasCabinetBound ? 'bind' : 'login') => {
    if (running || decodingQr) return;
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) {
      showNotification({
        title: '剪贴板为空',
        message: '请先复制公众号玩家二维码字符串。',
        variant: 'warning',
      });
      return;
    }
    applyQrText(text, target);
  };

  const startUpload = async () => {
    if (running || decodingQr) return;
    if (isMaimaiMaintenanceWindow()) {
      showNotification({ title: '游戏服务器维护中', message: MAIMAI_MAINTENANCE_MESSAGE, variant: 'warning' });
      return;
    }
    if (authMode === 'qr' && !hasCabinetBound) {
      showNotification({
        title: '请先完成绑定',
        message: QR_REQUIRES_BIND_MESSAGE,
        variant: 'warning',
      });
      setAuthMode('friend_code');
      return;
    }
    if (authMode === 'friend_code' && !/^\d{15}$/.test(friendCode.trim())) {
      showNotification({ title: '好友码无效', message: '请输入 15 位数字好友码。', variant: 'warning' });
      return;
    }
    if (authMode === 'qr' && !qrText.trim()) {
      showNotification({
        title: '缺少二维码',
        message: '请粘贴神秘二维码字符串，或从相册选择图片识别。',
        variant: 'warning',
      });
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
    setRunning(true);
    setLastResult(null);
    applyPhase({
      kind: 'logging_in',
      message: authMode === 'qr' ? '正在提交神秘二维码…' : '正在创建好友申请任务…',
      authMode,
    });

    try {
      const result = authMode === 'qr'
        ? await uploadMaimaiFromQrLogin({
          credential: { kind: 'text', qrCode: qrText.trim() },
          selectedAccountIds: selectedIds,
          targets,
          sessionsByAccountId,
          catalog,
          signal: abortRef.current,
          onPhase: applyPhase,
          onLxnsTokensRotated,
        })
        : await uploadMaimaiFromFriendCode({
          friendCode,
          selectedAccountIds: selectedIds,
          targets,
          sessionsByAccountId,
          catalog,
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
      setLastResult(result);
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
      setRunning(false);
    }
  };

  const startBindCabinet = async () => {
    if (running || decodingQr || hasCabinetBound) return;
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
    setRunning(true);
    setLastResult(null);
    applyPhase({ kind: 'binding', message: '正在绑定玩家二维码…' });

    try {
      await bindScoreHubCabinetByQr({
        qrCode: bindQrText.trim(),
        signal: abortRef.current,
        onPhase: applyPhase,
      });
      setHasCabinetBound(true);
      setBindQrText('');
      setAuthMode('friend_code');
      applyPhase({
        kind: 'done',
        message: '玩家二维码已绑定。日常请继续用好友码上传；仅在需要时再切到神秘二维码。',
        uploaded: 0,
        skipped: 0,
      });
      showNotification({
        title: '绑定成功',
        message: '已绑定。请继续用好友码上传成绩；神秘二维码仅作可选快路径。',
        variant: 'success',
      });
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
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>登录方式</Text>
          <View style={[styles.modeRow, { backgroundColor: theme.surface }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="使用好友码上传"
              accessibilityState={{ selected: authMode === 'friend_code', disabled: busy }}
              disabled={busy}
              onPress={() => switchAuthMode('friend_code')}
              style={({ pressed }) => [
                styles.modeButton,
                authMode === 'friend_code' && { backgroundColor: theme.accent },
                pressed && !busy && styles.softPressed,
              ]}
            >
              <Text style={[
                styles.modeButtonText,
                { color: authMode === 'friend_code' ? '#FFFFFF' : theme.textSecondary },
              ]}
              >
                好友码
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="使用神秘二维码上传"
              accessibilityState={{ selected: authMode === 'qr', disabled: busy }}
              disabled={busy}
              onPress={() => switchAuthMode('qr')}
              style={({ pressed }) => [
                styles.modeButton,
                authMode === 'qr' && { backgroundColor: theme.accent },
                pressed && !busy && styles.softPressed,
              ]}
            >
              <Text style={[
                styles.modeButtonText,
                { color: authMode === 'qr' ? '#FFFFFF' : theme.textSecondary },
              ]}
              >
                神秘二维码
              </Text>
            </Pressable>
          </View>

          {authMode === 'friend_code' ? (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>好友码</Text>
              <TextInput
                accessibilityLabel="舞萌好友码"
                value={friendCode}
                onChangeText={onFriendCodeChange}
                keyboardType="number-pad"
                maxLength={15}
                placeholder="15 位数字"
                placeholderTextColor={theme.textMuted}
                editable={!busy && prefsReady}
                style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text, borderWidth: 1 }]}
              />
              <Text style={[styles.hint, { color: theme.textMuted }]}>从游戏服务器取成绩后上传到下方勾选的查分器。</Text>
              <Text style={[styles.hint, { color: theme.textMuted }]}>{FRIEND_REQUEST_REFRESH_HINT}</Text>
              {hasCabinetBound ? (
                <Text accessibilityLabel="玩家二维码已绑定" style={[styles.hint, { color: theme.success }]}>
                  玩家二维码已绑定。日常直接用好友码上传即可；神秘二维码为可选快路径。
                </Text>
              ) : (
                <Text style={[styles.hint, { color: theme.textMuted }]}>
                  若要用神秘二维码快速上传，请先在本页传一次成绩，再到「神秘二维码」完成绑定。
                </Text>
              )}
            </>
          ) : hasCabinetBound ? (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>神秘二维码（可选）</Text>
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                已绑定。仅在不想走好友码时，粘贴最新的公众号玩家二维码即可快速上传；日常可留在「好友码」。
              </Text>
              <TextInput
                accessibilityLabel="神秘二维码字符串"
                value={qrText}
                onChangeText={(value) => setQrText(value)}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                textContentType="none"
                contextMenuHidden={false}
                selectTextOnFocus={false}
                multiline
                placeholder="粘贴 SGWCMAID… 字符串（可选）"
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
                  accessibilityLabel="粘贴二维码字符串"
                  disabled={busy || !prefsReady}
                  onPress={() => void pasteQrText('login')}
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
                  accessibilityLabel="从相册选择二维码图片"
                  disabled={busy || !prefsReady}
                  onPress={() => void pickQrImage('login')}
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
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                在“舞萌-中二公众号 → 玩家二维码”复制字符串后点「粘贴」，或截图后从相册选择。
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>首次绑定玩家二维码</Text>
              <Text accessibilityLabel="二维码需先绑定说明" style={[styles.hint, { color: theme.textMuted }]}>
                {QR_REQUIRES_BIND_MESSAGE}
              </Text>
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
                  onPress={() => void pasteQrText('bind')}
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
                  onPress={() => void pickQrImage('bind')}
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
                  styles.primary, { backgroundColor: theme.accent },
                  (busy || !prefsReady) && styles.primaryDisabled,
                  pressed && !busy && styles.softPressed,
                ]}
              >
                {running ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryText}>绑定二维码</Text>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="切换到好友码上传成绩"
                disabled={busy}
                onPress={() => switchAuthMode('friend_code')}
                style={({ pressed }) => [
                  styles.secondary,
                  { borderColor: theme.border, backgroundColor: theme.surface },
                  busy && styles.primaryDisabled,
                  pressed && !busy && styles.softPressed,
                ]}
              >
                <Text style={[styles.secondaryText, { color: theme.accent }]}>先去好友码上传成绩</Text>
              </Pressable>
            </>
          )}

          {authMode === 'friend_code' ? (
            <>
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
            </>
          ) : null}

          {authMode === 'friend_code' || hasCabinetBound ? (
            <>
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
                {running ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryText}>开始上传</Text>
                )}
              </Pressable>
            </>
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
  modeRow: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  modeButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  modeButtonText: { fontSize: 14, fontWeight: '700' },
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
