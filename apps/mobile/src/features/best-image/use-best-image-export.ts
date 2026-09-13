import { useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio, Platform, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useNotification } from '@/components/AppNotification';
import { createRuntimeOperation } from '@/services/runtime-diagnostics-recorder';
import { parseBestImageHeightMessage, parseBestImageReadyMessage } from './best-image-messages';
import { bestImageCaptureDimensions, deleteBestImageCapture, isDrawViewHierarchyError, requestBestImageExportPermission, saveBestImageCapture, shouldUseBestImageRenderInContext } from './best-image-export';
import type { BestImageScreenControllerRuntime } from './best-image-controller-types';

type CanvasWait = {
  resolve: (height: number) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  ready: boolean;
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
};

function clearWait(session: ExportSession) {
  if (session.wait?.timer) clearTimeout(session.wait.timer);
  session.wait = null;
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
    if (!session || session.cancelled) return;
    session.cancelled = true;
    session.wait?.reject(new Error('导出已取消'));
    clearWait(session);
    if (mounted.current) { setExportIndex(null); setExportStatus(null); }
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

  // Each mounted canvas retains its own session and waiter; late messages cannot finish another page.
  const renderedSession = active.current;
  const renderedWait = renderedSession?.wait;
  const handleExportMessage = (data: string) => {
    const session = renderedSession;
    const wait = renderedWait;
    if (!session || !wait || active.current !== session || session.cancelled || session.wait !== wait) return;
    const height = parseBestImageHeightMessage(data, session.width, session.messageScale);
    if (height !== null) setExportHeight(height);
    const readyHeight = parseBestImageReadyMessage(data, session.width, session.messageScale);
    if (readyHeight === null || wait.ready) return;
    wait.ready = true;
    session.operation.record('canvas', { pageIndex: session.pageIndex, result: 'success' });
    setExportHeight(readyHeight);
    if (wait.timer) clearTimeout(wait.timer);
    wait.timer = setTimeout(() => {
      if (session.cancelled || active.current !== session || session.wait !== wait) return;
      clearWait(session);
      wait.resolve(readyHeight);
    }, 320);
  };

  const exportImages = async (runtime: BestImageScreenControllerRuntime) => {
    if (!runtime.htmlPages || !runtime.sources || !runtime.canExport || active.current || !mounted.current) return;
    const session: ExportSession = {
      generation: ++generation.current, operation: createRuntimeOperation('best-image-export'), phase: 'permission',
      cancelled: false, timedOut: false, wait: null, captures: [], width: config.width, messageScale: config.messageScale,
    };
    active.current = session;
    session.operation.record('export', { result: 'start' });
    stage(session, 'permission');
    const pageCount = runtime.htmlPages.length;
    const capturePage = async (index: number) => {
      stage(session, 'canvas', index + 1);
      const height = await new Promise<number>((resolve, reject) => {
        const pageId = runtime.pages[index]?.id;
        session.wait = { resolve, reject, ready: false, timer: setTimeout(() => {
          session.timedOut = true;
          clearWait(session);
          reject(new Error('图片渲染超时'));
        }, 30_000) };
        setExportHeight((pageId ? config.pageHeights[pageId] : undefined) ?? config.defaultHeight);
        setExportIndex(index);
      });
      assertCurrent(session);
      stage(session, 'capture', index + 1);
      const useRenderInContext = shouldUseBestImageRenderInContext(Platform.OS, session.width, height);
      const options = { format: 'png', quality: 1, result: 'tmpfile',
        ...bestImageCaptureDimensions(session.width, height, PixelRatio.get(), Platform.OS),
        ...(useRenderInContext ? { useRenderInContext: true } : {}) } as const;
      let uri: string;
      try { uri = await captureRef(exportCaptureRef, options); }
      catch (error) {
        assertCurrent(session);
        if (Platform.OS !== 'ios' || useRenderInContext || !isDrawViewHierarchyError(error)) throw error;
        uri = await captureRef(exportCaptureRef, { ...options, useRenderInContext: true });
      }
      // A cancelled native capture still owns its returned file until this session cleans it up.
      const capture = { uri, filename: '' };
      session.captures.push(capture);
      assertCurrent(session);
      capture.filename = runtime.buildExportFilename(index, pageCount);
    };
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
      if (!session.cancelled && mounted.current) showNotification({ title: '导出失败', message: '无法导出成绩图片，请重试。', variant: 'error' });
    } finally {
      clearWait(session);
      session.captures.forEach((capture) => deleteBestImageCapture(capture.uri));
      if (active.current === session) {
        active.current = null;
        if (mounted.current) { setExportIndex(null); setExportStatus(null); }
      }
    }
  };
  return { exportIndex, exportHeight, exportStatus, exportCaptureRef, exportImages, cancelExportRequest, handleExportMessage };
}
