import { uploadTaskController } from '@/services/upload-task-controller';
import { useNotification } from '@/components/AppNotification';
import { isMaimaiMaintenanceWindow, MAIMAI_MAINTENANCE_MESSAGE } from '@/domain/maimai-maintenance';
import type { CatalogSnapshot } from '@/domain/models';
import type { useUploadAccountPreferences } from '@/hooks/use-upload-account-preferences';
import type { useUploadQrInput } from '@/hooks/use-upload-qr-input';
import type { ProviderSession } from '@/providers/contracts';
import type { LxnsTokenRotationUpdate } from '@/providers/lxns-oauth-request';
import type { ScoreHubAbortSignal } from '@/services/score-hub-client';
import { uploadMaimaiWithScoreHubQr, uploadMaimaiFromQrLogin, uploadMaimaiPreferringSession, type UploadPhase, type UploadResult } from '@/services/upload-maimai-from-friend-code';
import { recordUploadFailure } from '@/services/upload-diagnostics';
import { qrRiskPreferencesStore } from '@/storage/upload-prefs-store';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useUploadTaskState(catalog: CatalogSnapshot | undefined, requestCatalog?: () => Promise<CatalogSnapshot | undefined>, onPhaseChange?: (phase: UploadPhase) => void, visible = true) {
  const [snapshot, setSnapshot] = useState(uploadTaskController.getSnapshot());
  const running = snapshot.status === 'running' || snapshot.status === 'paused';
  uploadTaskController.attachCatalogSource(catalog, requestCatalog);
  const applyPhase = useCallback((next: UploadPhase, signal: ScoreHubAbortSignal) => {
    uploadTaskController.setPhase(next, signal);
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
  const begin = (waitForCancellation = false): ScoreHubAbortSignal | null => {
    const current = uploadTaskController.getSnapshot();
    if (current.status === 'running' || current.status === 'paused') return null;
    return uploadTaskController.begin(waitForCancellation);
  };
  useEffect(() => {
    if (catalog) uploadTaskController.finishCatalogWait(catalog);
  }, [catalog]);

  const resolveCatalogForUpload = useCallback(
    (signal: ScoreHubAbortSignal) => uploadTaskController.waitForCatalog(signal),
    [],
  );

  const cancelUpload = () => {
    if (!running || uploadTaskController.getSignal().aborted) return;
    uploadTaskController.cancel();
  };

  return { phase: snapshot.phase, running, lastResult: snapshot.result, begin, applyPhase, resolveCatalogForUpload, cancelUpload };
}

export function useUploadExecution({ task, preferences, qr, sessionsByAccountId, uploadMethod, visible, onLxnsTokensRotated, onFinished }: {
  task: ReturnType<typeof useUploadTaskState>;
  preferences: ReturnType<typeof useUploadAccountPreferences>;
  qr: ReturnType<typeof useUploadQrInput>;
  sessionsByAccountId: Record<string, ProviderSession | undefined>;
  uploadMethod: 'friend_code' | 'qr';
  visible: boolean;
  onLxnsTokensRotated?: (accountId: string, update: LxnsTokenRotationUpdate) => void | Promise<unknown>;
  onFinished?: (result: UploadResult) => void | Promise<void>;
}) {
  const { showNotification, showActionNotification, dismissNotification } = useNotification();
  const { running, begin, resolveCatalogForUpload } = task;
  const { friendCode, selectedIds, targets, useSessionUpload, refreshAfterUpload } = preferences;
  const { bindQrText, setBindQrText, decodingQr } = qr;
  const confirmationRef = useRef<number | null>(null);
  const confirmationSequence = useRef(0);
  const confirmingRef = useRef(false);
  useEffect(() => () => {
    confirmationSequence.current += 1;
    confirmingRef.current = false;
    if (confirmationRef.current !== null) dismissNotification(confirmationRef.current);
    confirmationRef.current = null;
  }, [visible, uploadMethod, dismissNotification]);
  const uploadErrorMessage = (error: unknown, fallback: string) => {
    recordUploadFailure(error, 'sync');
    return fallback;
  };

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
    const isCurrent = () => uploadTaskController.isCurrent(signal);
    const applyPhase = (phase: UploadPhase) => task.applyPhase(phase, signal);
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
        resolveCatalog: () => resolveCatalogForUpload(signal),
        signal,
        onPhase: applyPhase,
        onNeedFriendAccept: (botFriendCode) => {
          if (!isCurrent()) return;
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

      if (!isCurrent()) return;
      uploadTaskController.complete(result, signal);
      await refreshAfterUpload(friendCode.trim(), isCurrent);
      if (!isCurrent()) return;
      try {
        await onFinished?.(result);
      } catch {
        if (!isCurrent()) return;
        showNotification({
          title: '页面刷新失败',
          message: '成绩已上传，请稍后手动同步页面。',
          variant: 'error',
        });
      }
    } catch (error) {
      if (signal.aborted) {
        uploadTaskController.finishCanceled(signal);
      } else if (isCurrent()) {
        const message = uploadErrorMessage(error, '上传失败，请稍后重试。');
        applyPhase({ kind: 'error', message });
      }
    }
  };

  const runQrUpload = async (binding: boolean) => {
    if (!validateQr()) return;
    const signal = begin(!binding);
    if (!signal) return;
    const isCurrent = () => uploadTaskController.isCurrent(signal);
    const applyPhase = (phase: UploadPhase) => task.applyPhase(phase, signal);
    try {
      const input = {
        credential: { kind: 'text' as const, qrCode: bindQrText.trim() },
        selectedAccountIds: selectedIds, targets, sessionsByAccountId,
        resolveCatalog: () => resolveCatalogForUpload(signal), signal, onPhase: applyPhase,
        onQrAccepted: () => { if (isCurrent()) setBindQrText(''); },
        onLxnsTokensRotated,
      };
      const result = binding
        ? await uploadMaimaiWithScoreHubQr({ ...input,
          onAccountBound: code => preferences.acceptBoundAccount(code, isCurrent) })
        : await uploadMaimaiFromQrLogin(input);
      if (!isCurrent()) return;
      uploadTaskController.complete(result, signal);
      try {
        await onFinished?.(result);
      } catch {
        if (isCurrent()) showNotification({ title: '页面刷新失败',
          message: '成绩已上传，请稍后手动同步页面。', variant: 'error' });
      }
    } catch (error) {
      if (isCurrent()) {
        applyPhase({ kind: 'error', message: uploadErrorMessage(error, '二维码同步失败，请稍后重试。') });
        setBindQrText('');
      }
    } finally {
      if (signal.aborted) uploadTaskController.finishCanceled(signal);
    }
  };

  const latestQrUpload = useRef(runQrUpload);
  latestQrUpload.current = runQrUpload;

  const validateQr = () => {
    if (running || decodingQr) return false;
    if (isMaimaiMaintenanceWindow()) {
      showNotification({ title: '游戏服务器维护中', message: MAIMAI_MAINTENANCE_MESSAGE, variant: 'warning' });
      return false;
    }
    if (!bindQrText.trim()) {
      showNotification({ title: '缺少玩家二维码', message: '请粘贴或识别公众号玩家二维码后再同步。', variant: 'warning' });
      return false;
    }
    if (!selectedIds.some(id => targets.some(target => target.writable && target.account.id === id))) {
      showNotification({ title: '未选择目标', message: '请勾选至少一个可写入的查分器。', variant: 'warning' });
      return false;
    }
    return true;
  };

  const startQrUpload = async () => {
    if (!visible || uploadMethod !== 'qr' || confirmingRef.current || !validateQr()) return;
    confirmingRef.current = true;
    const sequence = ++confirmationSequence.current;
    const isCurrent = () => sequence === confirmationSequence.current;
    const failed = (error: unknown) => {
      recordUploadFailure(error, 'consent');
      if (isCurrent()) {
        confirmingRef.current = false;
        showNotification({ title: '操作失败', message: '暂时无法同步，请重试。', variant: 'error' });
      }
    };
    try {
      const confirmed = await qrRiskPreferencesStore.load();
      if (!isCurrent()) return;
      if (confirmed) {
        confirmingRef.current = false;
        await latestQrUpload.current(false);
        return;
      }
      confirmationRef.current = showActionNotification({
        title: '使用提示', message: '使用本绑定方法有一定账号封禁风险，请慎重决定',
        variant: 'warning', blocking: true,
        actions: [
          { label: '取消', tone: 'cancel', onPress: () => {
            if (isCurrent()) confirmingRef.current = false;
            confirmationRef.current = null;
          } },
          { label: '确认使用', onPress: async () => {
            confirmationRef.current = null;
            if (!isCurrent()) return;
            try {
              await qrRiskPreferencesStore.save(true);
              if (!isCurrent()) return;
              confirmingRef.current = false;
              await latestQrUpload.current(false);
            } catch (error) { failed(error); }
          } },
        ],
      });
    } catch (error) { failed(error); }
  };

  const bindQr = async () => {
    if (uploadMethod === 'friend_code') await runQrUpload(true);
  };

  return { startUpload, startQrUpload, bindQr };
}
