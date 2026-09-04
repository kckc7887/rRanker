import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BoundAccount } from '@/domain/bound-account';
import type { CatalogSnapshot } from '@/domain/models';
import type { ProviderSession } from '@/providers/contracts';
import type { ScoreHubAbortSignal, ScoreHubDxnetJobStats } from '@/services/score-hub-client';
import {
  fetchMe,
  fetchScoreHubStatistics,
  ScoreHubError,
  scoreHubErrorToUserMessage,
} from '@/services/score-hub-client';
import {
  decodeMaimaiQrFromImageUri,
  extractMaimaiQrPayload,
} from '@/services/maimai-qr-decode';
import {
  formatScoreHubStatsSummary,
  isScoreHubAuthExpired,
  resolveUploadTargets,
  scoreHubSuccessHint,
  uploadMaimaiFromFriendCode,
  uploadMaimaiFromQrLogin,
  uploadMaimaiWithScoreHubSession,
  uploadTaskController,
  type UploadPhase,
  type UploadResult,
} from '@/services/upload-maimai-from-friend-code';
import { uploadPrefsStore } from '@/storage/upload-prefs-store';
import {
  scoreHubAccountStore,
  type ScoreHubAccountEntry,
} from '@/storage/score-hub-account-store';
import { providerErrorToUserMessage } from '@/providers/errors';
import type { LxnsOAuthSession } from '@/providers/lxns-oauth';
import { useNotification } from '@/components/AppNotification';
import { AppModal } from '@/components/AppModal';
import {
  UploadFriendCodeFields,
  UploadProgressStatus,
  UploadQrFields,
  UploadResultList,
  UploadTargetList,
} from '@/components/upload-data-sheet-fields';
import { uploadDataSheetStyles as styles } from '@/components/upload-data-sheet-styles';
import { isMaimaiMaintenanceWindow, MAIMAI_MAINTENANCE_MESSAGE } from '@/domain/maimai-maintenance';
import { useAppTheme } from '@/theme/app-theme';
import { getForegroundAbortSignal } from '@/state/app-lifecycle';

function phaseLabel(phase: UploadPhase): string {
  switch (phase.kind) {
    case 'idle':
      return '';
    case 'logging_in':
    case 'sending_friend':
    case 'awaiting_friend':
    case 'fetching_scores':
    case 'syncing_catalog':
    case 'awaiting_catalog':
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

type CatalogWaiter = {
  promise: Promise<CatalogSnapshot>;
  resolve: (catalog: CatalogSnapshot) => void;
  reject: (error: Error) => void;
  unsubscribeCancel?: () => void;
};

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
  const { showActionNotification, showNotification } = useNotification();
  const [friendCode, setFriendCode] = useState('');
  const [bindQrText, setBindQrText] = useState('');
  const [hasCabinetBound, setHasCabinetBound] = useState(false);
  const [hasStoredToken, setHasStoredToken] = useState(false);
  const [storedAccounts, setStoredAccounts] = useState<ScoreHubAccountEntry[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [bindingLookup, setBindingLookup] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [prefsReady, setPrefsReady] = useState(false);
  const initialTask = uploadTaskController.getSnapshot();
  const [phase, setPhase] = useState<UploadPhase>(initialTask.phase);
  const [running, setRunning] = useState(initialTask.status === 'running' || initialTask.status === 'paused');
  const [decodingQr, setDecodingQr] = useState(false);
  const [lastResult, setLastResult] = useState<UploadResult | null>(initialTask.result);
  const [stats, setStats] = useState<ScoreHubDxnetJobStats | null>(null);
  const [statsStatus, setStatsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const abortRef = useRef<ScoreHubAbortSignal>(uploadTaskController.getSignal());
  const uploadInFlightRef = useRef(initialTask.status === 'running' || initialTask.status === 'paused');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistedSelectedIdsRef = useRef<string[]>([]);
  const wasVisibleRef = useRef(false);
  const bindLookupSeqRef = useRef(0);
  const catalogRef = useRef(catalog);
  const requestCatalogRef = useRef(requestCatalog);
  const catalogWaiterRef = useRef<CatalogWaiter | null>(null);
  const catalogRequestRef = useRef<Promise<void> | null>(null);

  catalogRef.current = catalog;
  requestCatalogRef.current = requestCatalog;

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
    uploadTaskController.setPhase(next);
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

  useEffect(() => uploadTaskController.subscribe((snapshot) => {
    abortRef.current = uploadTaskController.getSignal();
    const active = snapshot.status === 'running' || snapshot.status === 'paused';
    uploadInFlightRef.current = active;
    setRunning(active);
    setPhase(snapshot.phase);
    setLastResult(snapshot.result);
    onPhaseChange?.(snapshot.phase);
  }), [onPhaseChange]);

  const finishCatalogWait = useCallback((nextCatalog: CatalogSnapshot) => {
    const waiter = catalogWaiterRef.current;
    if (!waiter) return;
    catalogWaiterRef.current = null;
    waiter.unsubscribeCancel?.();
    waiter.resolve(nextCatalog);
  }, []);

  const cancelCatalogWait = useCallback(() => {
    const waiter = catalogWaiterRef.current;
    if (!waiter) return;
    catalogWaiterRef.current = null;
    waiter.unsubscribeCancel?.();
    waiter.reject(new ScoreHubError('已取消'));
  }, []);

  const syncCatalogForUpload = useCallback(() => {
    const waiter = catalogWaiterRef.current;
    if (!waiter || catalogRequestRef.current) return;
    applyPhase({ kind: 'syncing_catalog', message: '成绩已获取，正在同步曲库…' });
    const attempt = Promise.resolve().then(async () => {
      try {
        const nextCatalog = await requestCatalogRef.current?.();
        if (abortRef.current.aborted) {
          cancelCatalogWait();
          return;
        }
        const availableCatalog = nextCatalog ?? catalogRef.current;
        if (availableCatalog) {
          finishCatalogWait(availableCatalog);
        } else if (catalogWaiterRef.current === waiter) {
          applyPhase({ kind: 'awaiting_catalog', message: '成绩已获取，曲库暂未同步。请重试。' });
        }
      } catch {
        if (catalogWaiterRef.current === waiter && !abortRef.current.aborted) {
          applyPhase({ kind: 'awaiting_catalog', message: '成绩已获取，曲库暂未同步。请重试。' });
        }
      } finally {
        if (catalogRequestRef.current === attempt) catalogRequestRef.current = null;
        if (catalogWaiterRef.current && catalogWaiterRef.current !== waiter && !abortRef.current.aborted) {
          applyPhase({ kind: 'awaiting_catalog', message: '成绩已获取，曲库暂未同步。请重试。' });
        }
      }
    });
    catalogRequestRef.current = attempt;
  }, [applyPhase, cancelCatalogWait, finishCatalogWait]);

  const resolveCatalogForUpload = useCallback((): Promise<CatalogSnapshot> => {
    const availableCatalog = catalogRef.current;
    if (availableCatalog) return Promise.resolve(availableCatalog);
    if (abortRef.current.aborted) return Promise.reject(new ScoreHubError('已取消'));
    const existing = catalogWaiterRef.current;
    if (existing) return existing.promise;

    let resolve!: (nextCatalog: CatalogSnapshot) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<CatalogSnapshot>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });
    const waiter: CatalogWaiter = { promise, resolve, reject };
    waiter.unsubscribeCancel = abortRef.current.onCancel?.(() => {
      if (catalogWaiterRef.current === waiter) cancelCatalogWait();
    });
    catalogWaiterRef.current = waiter;
    syncCatalogForUpload();
    return promise;
  }, [cancelCatalogWait, syncCatalogForUpload]);

  useEffect(() => {
    if (catalog) finishCatalogWait(catalog);
  }, [catalog, finishCatalogWait]);

  const refreshStoredList = useCallback(async () => {
    const list = await scoreHubAccountStore.listWithToken();
    setStoredAccounts(list);
    return list;
  }, []);

  const applyLocalAccountState = useCallback((code: string, entry: ScoreHubAccountEntry | null) => {
    setHasStoredToken(Boolean(entry?.token));
    setHasCabinetBound(entry?.hasCabinetBound === true);
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
        await refreshStoredList();
      } catch (error) {
        if (seq !== bindLookupSeqRef.current) return;
        // JWT 过期：保留本地绑定缓存与 token，上传时会话失败再回退好友码
        if (!isScoreHubAuthExpired(error)) {
          // 网络不可用时保留本地数据。
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
      setBindQrText('');
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
    if (inFlight) {
      setRunning(true);
    } else {
      abortRef.current = uploadTaskController.getSignal();
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

  useEffect(() => {
    if (uploadMethod !== 'qr' && !running) setBindQrText('');
  }, [uploadMethod, running]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (idleResetTimerRef.current) clearTimeout(idleResetTimerRef.current);
  }, []);

  const close = () => {
    if (externalBusy) return;
    setDecodingQr(false);
    setHistoryVisible(false);
    setBindQrText('');
    onClose();
  };

  const cancelUpload = () => {
    if (!running || abortRef.current.aborted) return;
    uploadTaskController.cancel();
    cancelCatalogWait();
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
    }
  };

  const applyQrText = (raw: string) => {
    const extracted = extractMaimaiQrPayload(raw) ?? raw.trim();
    setBindQrText(extracted);
  };

  const pickQrImage = async () => {
    if (running || decodingQr || uploadMethod !== 'qr') return;
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
    const decodeSignal = getForegroundAbortSignal();
    try {
      const payload = await decodeMaimaiQrFromImageUri(asset.uri, decodeSignal);
      applyQrText(payload);
      showNotification({
        title: '已识别二维码',
        message: '玩家二维码已填入，可以开始同步成绩。',
        variant: 'success',
      });
    } catch {
      showNotification({
        title: decodeSignal.aborted ? '识别已停止' : '识别失败',
        message: decodeSignal.aborted ? '回到应用后请重新选择二维码图片。' : '无法识别二维码，请换一张图片重试。',
        variant: decodeSignal.aborted ? 'warning' : 'error',
      });
    } finally {
      setDecodingQr(false);
      // 识别完成后删除相册选择产生的本地副本，避免缓存目录持续增长。
      if (asset.uri.startsWith('file:')) {
        try { new File(asset.uri).delete(); } catch { /* 副本可能已由系统清理。 */ }
      }
    }
  };

  const pasteQrText = async () => {
    if (running || decodingQr || uploadMethod !== 'qr') return;
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
    resolveCatalog: resolveCatalogForUpload,
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

  const uploadErrorMessage = (error: unknown, fallback: string) => (
    scoreHubErrorToUserMessage(error, providerErrorToUserMessage(error, fallback))
  );

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
    abortRef.current = uploadTaskController.begin();
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
            resolveCatalog: resolveCatalogForUpload,
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
      uploadTaskController.complete(result);
      await refreshStoredList();
      await refreshBindStatus(friendCode.trim());
      try {
        await onFinished?.(result);
      } catch {
        showNotification({
          title: '页面刷新失败',
          message: '成绩已上传，请稍后手动同步页面。',
          variant: 'error',
        });
      }
    } catch (error) {
      if (abortRef.current.aborted) {
        applyPhase({ kind: 'idle' });
      } else {
        const message = uploadErrorMessage(error, '上传失败，请稍后重试。');
        applyPhase({ kind: 'error', message });
      }
    } finally {
      uploadInFlightRef.current = false;
    }
  };

  const startQrUpload = async () => {
    if (running || decodingQr || uploadMethod !== 'qr') return;
    if (isMaimaiMaintenanceWindow()) {
      showNotification({ title: '游戏服务器维护中', message: MAIMAI_MAINTENANCE_MESSAGE, variant: 'warning' });
      return;
    }
    if (!bindQrText.trim()) {
      showNotification({
        title: '缺少玩家二维码',
        message: '请粘贴或识别公众号玩家二维码后再同步。',
        variant: 'warning',
      });
      return;
    }
    if (selectedIds.filter((id) => targets.some((t) => t.writable && t.account.id === id)).length === 0) {
      showNotification({ title: '未选择目标', message: '请勾选至少一个可写入的查分器。', variant: 'warning' });
      return;
    }
    abortRef.current = uploadTaskController.begin();
    uploadInFlightRef.current = true;
    setRunning(true);
    setLastResult(null);
    applyPhase({ kind: 'logging_in', message: '正在确认玩家二维码…', authMode: 'qr' });

    try {
      const result = await uploadMaimaiFromQrLogin({
        credential: { kind: 'text', qrCode: bindQrText.trim() },
        selectedAccountIds: selectedIds,
        targets,
        sessionsByAccountId,
        resolveCatalog: resolveCatalogForUpload,
        signal: abortRef.current,
        onPhase: applyPhase,
        onQrAccepted: () => setBindQrText(''),
        onLxnsTokensRotated,
      });
      setLastResult(result);
      uploadTaskController.complete(result);
      await refreshStoredList();
      const latest = await scoreHubAccountStore.load();
      if (latest.friendCode) {
        setFriendCode(latest.friendCode);
        setHasStoredToken(Boolean(latest.token));
        setHasCabinetBound(latest.hasCabinetBound);
      }
      try {
        await onFinished?.(result);
      } catch {
        showNotification({
          title: '页面刷新失败',
          message: '成绩已上传，请稍后手动同步页面。',
          variant: 'error',
        });
      }
    } catch (error) {
      if (abortRef.current.aborted) {
        applyPhase({ kind: 'idle' });
      } else {
        const message = uploadErrorMessage(error, '二维码同步失败，请稍后重试。');
        applyPhase({ kind: 'error', message });
        setBindQrText('');
      }
    } finally {
      uploadInFlightRef.current = false;
    }
  };

  const statusText = phaseLabel(phase);
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
              onPress={syncCatalogForUpload}
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
