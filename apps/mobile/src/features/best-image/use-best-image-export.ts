import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PixelRatio, Platform, type LayoutChangeEvent, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useNotification } from '@/components/AppNotification';
import { createRuntimeOperation } from '@/services/runtime-diagnostics-recorder';
import { waitForForeground } from '@/state/app-lifecycle-core';
import { parseBestImageErrorMessage, parseBestImageHeightMessage, parseBestImageReadyMessage } from './best-image-messages';
import { bestImageCaptureDimensions, BestImageExportError, deleteBestImageCapture, requestBestImageExportPermission, saveBestImageCapture } from './best-image-export';
import type { BestImageScreenControllerRuntime } from './best-image-controller-types';

type CanvasWait = {
  resolve: (height: number) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  settleTimer: ReturnType<typeof setTimeout> | null;
  height: number;
  readyHeight: number | null;
  layout: { width: number; height: number } | null;
};
type ExportSession = {
  generation: number;
  operation: ReturnType<typeof createRuntimeOperation>;
  phase: string;
  pageIndex?: number;
  cancelled: boolean;
  timedOut: boolean;
  wait: CanvasWait | null;
  captures: { uri: string; filename: string }[];
  width: number;
  messageScale?: number;
  controller: AbortController;
  settled: Promise<void>;
  finish: () => void;
};

function clearWait(session: ExportSession) {
  if (session.wait?.timer) clearTimeout(session.wait.timer);
  if (session.wait?.settleTimer) clearTimeout(session.wait.settleTimer);
  session.wait = null;
}

function iosSnapshotNeedsAnotherAttempt(attempt: number): boolean {
  return Platform.OS === 'ios' && attempt < 1;
}

async function waitForCaptureSurface(signal: AbortSignal): Promise<void> {
  if (AppState.currentState !== 'inactive' && AppState.currentState !== 'background') return;
  await waitForForeground(signal);
}

function exportFailureMessage(error: unknown, savedCount: number): string {
  const actionable = typeof BestImageExportError === 'function' && error instanceof BestImageExportError
    ? error.message
    : '';
  if (savedCount > 0) {
    return actionable
      ? `已保存 ${savedCount} 张，其余页面没有保存。${actionable}`
      : `已保存 ${savedCount} 张，其余页面没有保存。`;
  }
  return actionable || '无法导出成绩图片，请重试。';
}

export function useBestImageExport(config: {
  accountId: string;
  width: number;
  defaultHeight: number;
  messageScale?: number;
  wrapExportPageError?: boolean;
  pageHeights: Readonly<Record<string, number>>;
}) {
  const { showNotification } = useNotification();
  const [exportIndex, setExportIndex] = useState<number | null>(null);
  const [exportHeight, setExportHeight] = useState(config.defaultHeight);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const exportCaptureRef = useRef<View>(null);
  const active = useRef<ExportSession | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const cancelExportRequest = useCallback(() => {
    const session = active.current;
    if (!session) return Promise.resolve();
    if (session.cancelled) return session.settled;
    session.cancelled = true;
    session.controller.abort();
    session.wait?.reject(new Error('导出已取消'));
    clearWait(session);
    if (mounted.current) { setExportIndex(null); setExportStatus(null); }
    return session.settled;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelExportRequest(); };
  }, [config.accountId, cancelExportRequest]);
  const assertCurrent = (session: ExportSession) => {
    if (session.cancelled || !mounted.current || active.current !== session || session.generation !== generation.current) throw new Error('导出已取消');
  };
  const stage = (session: ExportSession, phase: string, pageIndex?: number) => {
    assertCurrent(session);
    session.phase = phase; session.pageIndex = pageIndex;
    session.operation.record(phase, { pageIndex, result: 'start' });
  };

  /** 每页独立等待，旧消息不能结束其它页。 */
  const renderedSession = active.current;
  const renderedWait = renderedSession?.wait;
  const settleCanvas = (session: ExportSession, wait: CanvasWait) => {
    const ratio = PixelRatio.get();
    const matchesLayout = wait.layout
      && Math.abs(wait.layout.width * ratio - session.width) <= 1
      && Math.abs(wait.layout.height * ratio - wait.height) <= 1;
    if (wait.readyHeight !== wait.height || !matchesLayout) {
      if (wait.settleTimer) clearTimeout(wait.settleTimer);
      wait.settleTimer = null;
      return;
    }
    if (wait.settleTimer) return;
    wait.settleTimer = setTimeout(() => {
      if (session.cancelled || active.current !== session || session.wait !== wait) return;
      const height = wait.height;
      clearWait(session);
      session.operation.record('canvas', { pageIndex: session.pageIndex, result: 'success' });
      wait.resolve(height);
    }, 320);
  };
  const handleExportLayout = (event: LayoutChangeEvent) => {
    const session = renderedSession;
    const wait = renderedWait;
    if (!session || !wait || active.current !== session || session.cancelled || session.wait !== wait) return;
    wait.layout = event.nativeEvent.layout;
    settleCanvas(session, wait);
  };
  const handleExportMessage = (data: string) => {
    const session = renderedSession;
    const wait = renderedWait;
    if (!session || !wait || active.current !== session || session.cancelled || session.wait !== wait) return;
    const error = parseBestImageErrorMessage(data, session.width);
    if (error !== null) {
      clearWait(session);
      wait.reject(new BestImageExportError(error));
      return;
    }
    const height = parseBestImageHeightMessage(data, session.width, session.messageScale);
    if (height !== null) {
      if (wait.height !== height) {
        wait.height = height;
        wait.readyHeight = null;
      }
      setExportHeight(height);
    }
    const readyHeight = parseBestImageReadyMessage(data, session.width, session.messageScale);
    if (readyHeight !== null) {
      wait.height = readyHeight;
      wait.readyHeight = readyHeight;
      setExportHeight(readyHeight);
    }
    settleCanvas(session, wait);
  };

  const exportImages = async (runtime: BestImageScreenControllerRuntime) => {
    if (!runtime.htmlPages || !runtime.sources || !runtime.canExport || active.current || !mounted.current) return;
    let finish!: () => void;
    const settled = new Promise<void>((resolve) => { finish = resolve; });
    const session: ExportSession = {
      generation: ++generation.current, operation: createRuntimeOperation('best-image-export'), phase: 'permission',
      cancelled: false, timedOut: false, wait: null, captures: [], width: config.width, messageScale: config.messageScale, controller: new AbortController(), settled, finish,
    };
    active.current = session;
    session.operation.record('export', { result: 'start' });
    stage(session, 'permission');
    const pageCount = runtime.htmlPages.length;
    const capturePage = async (index: number) => {
      stage(session, 'canvas', index + 1);
      const height = await new Promise<number>((resolve, reject) => {
        const pageId = runtime.pages[index]?.id;
        const initialHeight = (pageId ? config.pageHeights[pageId] : undefined) ?? config.defaultHeight;
        session.wait = { resolve, reject, height: initialHeight, readyHeight: null, layout: null, settleTimer: null, timer: setTimeout(() => {
          session.timedOut = true;
          clearWait(session);
          reject(new Error('图片渲染超时'));
        }, 30_000) };
        setExportHeight(initialHeight);
        setExportIndex(index);
      });
      assertCurrent(session);
      stage(session, 'capture', index + 1);
      const options = { format: 'png', quality: 1, result: 'tmpfile',
        ...bestImageCaptureDimensions(session.width, height, PixelRatio.get(), Platform.OS) } as const;
      let uri: string | undefined;
      let attempt = 0;
      while (uri === undefined) {
        await waitForCaptureSurface(session.controller.signal);
        assertCurrent(session);
        try {
          uri = await captureRef(exportCaptureRef, options);
        } catch (error) {
          assertCurrent(session);
          if (!iosSnapshotNeedsAnotherAttempt(attempt)) throw error;
          attempt += 1;
          await new Promise((resolve) => setTimeout(resolve, 250));
          assertCurrent(session);
        }
      }
      /** 原生截图取消后仍可能返回文件，需要清理。 */
      const capture = { uri, filename: '' };
      session.captures.push(capture);
      assertCurrent(session);
      capture.filename = runtime.buildExportFilename(index, pageCount);
    };
    let savedCount = 0;
    try {
      await requestBestImageExportPermission();
      assertCurrent(session);
      session.operation.record('permission', { result: 'success' });
      for (let index = 0; index < pageCount; index += 1) {
        assertCurrent(session);
        setExportStatus(`正在导出 ${index + 1}/${pageCount}`);
        try { await capturePage(index); }
        catch (error) {
          if (config.wrapExportPageError) throw new Error(`第 ${index + 1}/${pageCount} 页生成失败`, { cause: error });
          throw error;
        }
        assertCurrent(session);
        session.operation.record('capture', { result: 'success', pageIndex: index + 1 });
      }
      setExportIndex(null);
      for (let index = 0; index < session.captures.length; index += 1) {
        stage(session, 'save', index + 1);
        setExportStatus(`正在保存 ${index + 1}/${session.captures.length}`);
        try { await saveBestImageCapture(session.captures[index]!.uri, session.captures[index]!.filename); }
        catch (error) {
          if (config.wrapExportPageError) throw new Error(`第 ${index + 1}/${session.captures.length} 页保存失败`, { cause: error });
          throw error;
        }
        savedCount += 1;
        assertCurrent(session);
        session.operation.record('save', { result: 'success', pageIndex: index + 1 });
      }
      assertCurrent(session);
      session.operation.record('export', { result: 'success' });
      showNotification({ title: '导出完成', message: `已保存 ${session.captures.length} 张成绩图片到相册`, variant: 'success' });
    } catch (error) {
      session.operation.record(session.phase, {
        result: session.cancelled ? 'cancelled' : session.timedOut ? 'timeout' : 'error', pageIndex: session.pageIndex,
        errorCode: session.cancelled ? 'cancelled' : session.timedOut ? 'timeout' : undefined, error: session.cancelled ? undefined : error,
      });
      session.operation.record('export', { result: session.cancelled ? 'cancelled' : 'error' });
      if (!session.cancelled && mounted.current) {
        showNotification({
          title: '导出失败',
          message: exportFailureMessage(error, savedCount),
          variant: 'error',
        });
      }
    } finally {
      clearWait(session);
      await Promise.all(session.captures.map((capture) => deleteBestImageCapture(capture.uri).catch(() => {})));
      if (active.current === session) {
        active.current = null;
        if (mounted.current) { setExportIndex(null); setExportStatus(null); }
      }
      session.finish();
    }
  };
  return { exportIndex, exportHeight, exportStatus, exportCaptureRef, exportImages, cancelExportRequest, handleExportMessage, handleExportLayout };
}
