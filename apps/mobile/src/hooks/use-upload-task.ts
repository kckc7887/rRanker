import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogSnapshot } from '@/domain/models';
import type { ProviderSession } from '@/providers/contracts';
import type { LxnsTokenRotationUpdate } from '@/providers/lxns-oauth-request';
import { providerErrorToUserMessage } from '@/providers/errors';
import { useNotification } from '@/components/AppNotification';
import { scoreHubErrorToUserMessage, type ScoreHubAbortSignal } from '@/services/score-hub-client';
import { uploadMaimaiPreferringSession, uploadMaimaiFromQrLogin, uploadTaskController, type UploadPhase, type UploadResult } from '@/services/upload-maimai-from-friend-code';
import { isMaimaiMaintenanceWindow, MAIMAI_MAINTENANCE_MESSAGE } from '@/domain/maimai-maintenance';
import type { useUploadAccountPreferences } from '@/hooks/use-upload-account-preferences';
import type { useUploadQrInput } from '@/hooks/use-upload-qr-input';

export function useUploadTaskState(catalog: CatalogSnapshot | undefined, requestCatalog?: () => Promise<CatalogSnapshot | undefined>, onPhaseChange?: (phase: UploadPhase) => void, visible = true) {
  const [snapshot, setSnapshot] = useState(uploadTaskController.getSnapshot());
  const running = snapshot.status === 'running' || snapshot.status === 'paused';
  uploadTaskController.attachCatalogSource(catalog, requestCatalog);
  const applyPhase = useCallback((next: UploadPhase) => {
    uploadTaskController.setPhase(next);
  }, []);
  useEffect(() => uploadTaskController.subscribe(next => {
    setSnapshot(next);
    onPhaseChange?.(next.phase);
  }), [onPhaseChange]);
  const wasVisibleRef = useRef(false);
  useEffect(() => {
    const justOpened = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;
    const current = uploadTaskController.getSnapshot();
    if (justOpened && current.status !== 'running' && current.status !== 'paused') {
      setSnapshot(value => value.result ? { ...value, result: null } : value);
    }
  }, [visible]);
  const begin = (): ScoreHubAbortSignal | null => {
    const current = uploadTaskController.getSnapshot();
    if (current.status === 'running' || current.status === 'paused') return null;
    return uploadTaskController.begin();
  };
  useEffect(() => {
    if (catalog) uploadTaskController.finishCatalogWait(catalog);
  }, [catalog]);

  const resolveCatalogForUpload = useCallback(
    () => uploadTaskController.waitForCatalog(),
    [],
  );

  const cancelUpload = () => {
    if (!running || uploadTaskController.getSignal().aborted) return;
    uploadTaskController.cancel();
    applyPhase({ kind: 'canceling', message: '正在取消…' });
  };

  return { phase: snapshot.phase, running, lastResult: snapshot.result, begin, applyPhase, resolveCatalogForUpload, cancelUpload };
}

export function useUploadExecution({ task, preferences, qr, sessionsByAccountId, uploadMethod, onLxnsTokensRotated, onFinished }: {
  task: ReturnType<typeof useUploadTaskState>;
  preferences: ReturnType<typeof useUploadAccountPreferences>;
  qr: ReturnType<typeof useUploadQrInput>;
  sessionsByAccountId: Record<string, ProviderSession | undefined>;
  uploadMethod: 'friend_code' | 'qr';
  onLxnsTokensRotated?: (accountId: string, update: LxnsTokenRotationUpdate) => void | Promise<unknown>;
  onFinished?: (result: UploadResult) => void | Promise<void>;
}) {
  const { showNotification, showActionNotification } = useNotification();
  const { running, begin, applyPhase, resolveCatalogForUpload } = task;
  const { friendCode, selectedIds, targets, useSessionUpload, refreshAfterUpload } = preferences;
  const { bindQrText, setBindQrText, decodingQr } = qr;
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
    const signal = begin();
    if (!signal) return;
    const preferSession = useSessionUpload;
    applyPhase({
      kind: 'logging_in',
      message: preferSession
        ? '正在使用已登录的 ScoreHub 会话…'
        : '正在创建好友申请任务…',
      authMode: preferSession ? 'session' : 'friend_code',
    });

    try {
      const result = await uploadMaimaiPreferringSession({
        friendCode,
        preferSession,
        selectedAccountIds: selectedIds,
        targets,
        sessionsByAccountId,
        resolveCatalog: resolveCatalogForUpload,
        signal,
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

      uploadTaskController.complete(result);
      await refreshAfterUpload(friendCode.trim());
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
      if (signal.aborted) {
        applyPhase({ kind: 'idle' });
      } else {
        const message = uploadErrorMessage(error, '上传失败，请稍后重试。');
        applyPhase({ kind: 'error', message });
      }
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
    const signal = begin();
    if (!signal) return;
    applyPhase({ kind: 'logging_in', message: '正在确认玩家二维码…', authMode: 'qr' });

    try {
      const result = await uploadMaimaiFromQrLogin({
        credential: { kind: 'text', qrCode: bindQrText.trim() },
        selectedAccountIds: selectedIds,
        targets,
        sessionsByAccountId,
        resolveCatalog: resolveCatalogForUpload,
        signal,
        onPhase: applyPhase,
        onQrAccepted: () => setBindQrText(''),
        onLxnsTokensRotated,
      });
      uploadTaskController.complete(result);
      await refreshAfterUpload();
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
      if (signal.aborted) {
        applyPhase({ kind: 'idle' });
      } else {
        const message = uploadErrorMessage(error, '二维码同步失败，请稍后重试。');
        applyPhase({ kind: 'error', message });
        setBindQrText('');
      }
    }
  };

  return { startUpload, startQrUpload };
}
