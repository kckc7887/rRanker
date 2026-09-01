import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useNotification } from '@/components/AppNotification';
import { providerErrorToUserMessage } from '@/providers/errors';
import { useAppLifecycle } from '@/state/app-lifecycle';
import {
  type ChartPackageDownloadOptions,
} from './chart-download-shared';

export type ChartPackageDownloadRunner = (
  options: ChartPackageDownloadOptions,
) => Promise<boolean>;

export function useChartPackageDownload({
  successMessage,
  failureMessage = '该谱面暂时无法下载，请稍后重试。',
}: {
  successMessage: string;
  failureMessage?: string;
}) {
  const {
    dismissNotification,
    showActionNotification,
    showNotification,
    updateNotification,
  } = useNotification();
  const lifecycle = useAppLifecycle();
  const [isRunning, setIsRunning] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const notificationIdRef = useRef<number | null>(null);
  const backgroundCanceledRef = useRef(false);

  const cancel = useCallback(() => {
    notificationIdRef.current = null;
    controllerRef.current?.abort();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      const notificationId = notificationIdRef.current;
      if (notificationId !== null) dismissNotification(notificationId);
    };
  }, [dismissNotification]);

  useEffect(() => {
    if (lifecycle.phase === 'background') {
      if (controllerRef.current) {
        backgroundCanceledRef.current = true;
        controllerRef.current.abort();
        const notificationId = notificationIdRef.current;
        notificationIdRef.current = null;
        if (notificationId !== null) dismissNotification(notificationId);
      }
      return;
    }
    if (backgroundCanceledRef.current) {
      backgroundCanceledRef.current = false;
      setIsRunning(false);
      showNotification({
        title: '下载已停止',
        message: '应用回到前台后，请重新下载谱面文件。',
        variant: 'info',
      });
    }
  }, [dismissNotification, lifecycle.foregroundGeneration, lifecycle.foregroundReady, lifecycle.phase, showNotification]);

  const start = useCallback(async (runner: ChartPackageDownloadRunner) => {
    if (controllerRef.current) return;
    if (Platform.OS === 'web') {
      showNotification({
        title: '无法下载',
        message: '当前设备不支持下载谱面，请使用手机端。',
        variant: 'info',
      });
      return;
    }

    const controller = new AbortController();
    backgroundCanceledRef.current = false;
    controllerRef.current = controller;
    setIsRunning(true);
    notificationIdRef.current = showActionNotification({
      title: '下载谱面文件',
      variant: 'info',
      progress: { label: '下载进度', value: 0 },
      actions: [{ label: '取消', tone: 'cancel', onPress: cancel }],
    });
    try {
      const saved = await runner({
        signal: controller.signal,
        onProgress: (progress) => {
          const notificationId = notificationIdRef.current;
          if (controller.signal.aborted || notificationId === null) return;
          updateNotification(notificationId, {
            progress: {
              label: progress.phase === 'organizing' ? '整理进度' : '下载进度',
              value: progress.progress,
            },
          });
        },
        onReadyToSave: async () => {
          if (controller.signal.aborted) return;
          const notificationId = notificationIdRef.current;
          notificationIdRef.current = null;
          if (notificationId !== null) dismissNotification(notificationId);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        },
      });
      if (saved) {
        showNotification({
          title: '谱面已保存',
          message: successMessage,
          variant: 'success',
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        showNotification({
          title: '下载失败',
          message: providerErrorToUserMessage(error, failureMessage),
          variant: 'error',
        });
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      const notificationId = notificationIdRef.current;
      notificationIdRef.current = null;
      if (notificationId !== null) dismissNotification(notificationId);
      if (mountedRef.current && !backgroundCanceledRef.current) setIsRunning(false);
    }
  }, [cancel, dismissNotification, failureMessage, showActionNotification, showNotification, successMessage, updateNotification]);

  return { cancel, isRunning, start };
}
