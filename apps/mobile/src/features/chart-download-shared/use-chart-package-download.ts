import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';
import { useNotification } from '@/components/AppNotification';
import { providerErrorFromStatus, providerErrorToUserMessage } from '@/providers/errors';
import { requestProviderResponse } from '@/providers/http-json';
import { useAppLifecycle } from '@/state/app-lifecycle';
import {
  type ChartPackageDownloadOptions,
} from './chart-download-shared';

export type ChartPackageDownloadRunner = (
  options: ChartPackageDownloadOptions,
  includeVideo: boolean,
) => Promise<boolean>;

export type ChartPackageDownloadStartOptions = {
  optionalVideoUrl?: string;
};

async function videoAvailable(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    return await requestProviderResponse({
      path: url, baseUrl: '', schema: z.boolean(), label: '背景视频',
      fetcher: expoFetch as unknown as typeof fetch, signal, retries: 1,
      init: { method: 'HEAD', headers: { Accept: '*/*' } },
      error: providerErrorFromStatus,
    }, async () => true);
  } catch {
    return false;
  }
}

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

  const dismissCurrentNotification = useCallback(() => {
    const notificationId = notificationIdRef.current;
    notificationIdRef.current = null;
    if (notificationId !== null) dismissNotification(notificationId);
  }, [dismissNotification]);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    dismissCurrentNotification();
  }, [dismissCurrentNotification]);

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

  const start = useCallback(async (runner: ChartPackageDownloadRunner, options: ChartPackageDownloadStartOptions = {}) => {
    if (controllerRef.current || !mountedRef.current || lifecycle.phase === 'background') return;
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
    const cancelRun = () => { if (controllerRef.current === controller) cancel(); };
    try {
      let includeVideo = false;
      if (options.optionalVideoUrl && await videoAvailable(options.optionalVideoUrl, controller.signal)) {
        if (controller.signal.aborted) return;
        const choice = await new Promise<boolean | undefined>((resolve) => {
          let settled = false;
          const finish = (value?: boolean) => {
            if (settled) return;
            settled = true;
            controller.signal.removeEventListener('abort', onAbort);
            dismissCurrentNotification();
            resolve(value);
          };
          const onAbort = () => finish();
          controller.signal.addEventListener('abort', onAbort, { once: true });
          notificationIdRef.current = showActionNotification({
            title: '下载谱面文件',
            message: '该谱面带有背景视频，视频文件较大、会消耗流量，是否一并下载？',
            variant: 'info',
            actions: [
              { label: '包含背景视频', onPress: () => finish(true) },
              { label: '仅封面图片', onPress: () => finish(false) },
              { label: '取消', tone: 'cancel', onPress: cancelRun },
            ],
          });
        });
        if (choice === undefined) return;
        includeVideo = choice;
      }
      if (controller.signal.aborted || !mountedRef.current) return;
      notificationIdRef.current = showActionNotification({
        title: '下载谱面文件',
        variant: 'info',
        progress: { label: '下载进度', value: 0 },
        actions: [{ label: '取消', tone: 'cancel', onPress: cancelRun }],
      });
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
      }, includeVideo);
      if (saved && !controller.signal.aborted && mountedRef.current) {
        showNotification({
          title: '谱面已保存',
          message: successMessage,
          variant: 'success',
        });
      }
    } catch (error) {
      if (!controller.signal.aborted && mountedRef.current) {
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
  }, [cancel, dismissCurrentNotification, dismissNotification, failureMessage, lifecycle.phase, showActionNotification, showNotification, successMessage, updateNotification]);

  return { cancel, isRunning, start };
}
