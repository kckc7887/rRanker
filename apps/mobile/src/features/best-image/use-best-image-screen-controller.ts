import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { PixelRatio, Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useNotification } from '@/components/AppNotification';
import {
  parseBestImageHeightMessage,
  parseBestImageReadyMessage,
  parseBestImageRuntimeMessage,
} from './build-best-image-html';
import {
  bestImageCaptureDimensions,
  deleteBestImageCapture,
  isDrawViewHierarchyError,
  requestBestImageExportPermission,
  saveBestImageCapture,
  shouldUseBestImageRenderInContext,
} from './best-image-export';
import {
  updateBestImageWebViewRenderingState,
  updateBestImageWebViewState,
  type BestImageWebViewState,
} from './best-image-webview-state';
import type { BestImageWebViewSource } from './prepare-best-image-webview-sources';

/** 导出渲染超时与原生视图稳定等待时间。 */
const EXPORT_RENDER_TIMEOUT_MS = 30_000;
const EXPORT_RESOLVE_DELAY_MS = 320;

/** 成绩图屏幕的分页、偏好和导出控制器。 */
export type BestImageScreenControllerConfig<TType extends string, TPrefs> = {
  accountId: string;
  defaultType: TType;
  defaultWidth: number;
  defaultQuantityText: string;
  defaultPreferences: TPrefs;
  /** 偏好读写入口。 */
  preferences: {
    load: (accountId: string) => Promise<TPrefs>;
    save: (accountId: string, prefs: TPrefs) => Promise<void>;
  };
  /** 偏好 load 开始前的重置钩子（舞萌的随机选择去重集合清理）。 */
  onPreferencesLoadStart?: () => void;
  /** 导出默认高度：舞萌 minimumBestImageHeight(width)，中二/Phigros Math.ceil(width * 0.75)。 */
  defaultExportHeight: (width: number) => number;
  /** 高度/就绪消息的 DPR 基准；undefined 表示不传第三参（舞萌默认 4:3 最小高）。 */
  messageScale?: number;
  /** 导出逐页错误包装（舞萌「第 N/M 页渲染失败 / 保存失败」文案）。 */
  wrapExportPageError?: boolean;
  /** 导出忙态判定是否包含 exportIndex（舞萌），缺省仅看 exportStatus。 */
  exportBusyIncludesIndex?: boolean;
  /** 预览渲染消息是否走终态保护（舞萌 updateBestImageWebViewRenderingState 语义）。 */
  previewRenderingGuard?: boolean;
};

/** 每渲染传入的导出运行时输入（分页 / HTML / 页面源 / 前置条件 / 文件名）。 */
export type BestImageScreenControllerRuntime = {
  /** 当前分页结果（导出等待页高的查找表）。 */
  pages: readonly { id: string }[];
  /** 当前 HTML 页。 */
  htmlPages: readonly string[] | null;
  /** 导出使用的 WebView 页面源（中二为平台分支计算值，非 state）。 */
  sources: readonly BestImageWebViewSource[] | null;
  /** 导出前置条件（各游戏 payload/素材/表单校验，不含忙态与 sources 判空）。 */
  canExport: boolean;
  /** 导出文件名构造（bestImageExportFilename 的游戏参数封装）。 */
  buildExportFilename: (index: number, pageCount: number) => string;
};

export function useBestImageScreenController<TType extends string, TPrefs, TPicker>(
  config: BestImageScreenControllerConfig<TType, TPrefs>,
) {
  const { showNotification } = useNotification();
  const [width, setWidth] = useState(config.defaultWidth);
  const [type, setType] = useState<TType>(config.defaultType);
  const [quantityText, setQuantityText] = useState(config.defaultQuantityText);
  const [prefs, setPrefs] = useState<TPrefs>(config.defaultPreferences);
  const [prefsReady, setPrefsReady] = useState(false);
  const [picker, setPicker] = useState<TPicker | null>(null);
  const [pageHeights, setPageHeights] = useState<Record<string, number>>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [previewStates, setPreviewStates] = useState<Record<string, BestImageWebViewState>>({});
  const [exportIndex, setExportIndex] = useState<number | null>(null);
  const [exportHeight, setExportHeight] = useState(config.defaultExportHeight(config.defaultWidth));
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const exportCaptureRef = useRef<View>(null);
  const exportResolve = useRef<((height: number) => void) | null>(null);
  const exportReject = useRef<((error: Error) => void) | null>(null);
  const exportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 配置可能在每次渲染时产生新引用，用 ref 避免无关 effect 重跑。
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    let cancelled = false;
    setPrefsReady(false);
    configRef.current.onPreferencesLoadStart?.();
    void configRef.current.preferences.load(config.accountId).then((value) => {
      if (cancelled) return;
      setPrefs(value);
      setPrefsReady(true);
    });
    return () => { cancelled = true; };
  }, [config.accountId]);

  useEffect(() => {
    if (!prefsReady) return;
    void configRef.current.preferences.save(config.accountId, prefs);
  }, [config.accountId, prefs, prefsReady]);

  /** 高度/就绪消息按配置的 DPR 基准解析（undefined 时保持三参缺省语义）。 */
  const parseHeightMessage = (data: string): number | null => {
    const scale = configRef.current.messageScale;
    return scale === undefined
      ? parseBestImageHeightMessage(data, width)
      : parseBestImageHeightMessage(data, width, scale);
  };
  const parseReadyMessage = (data: string): number | null => {
    const scale = configRef.current.messageScale;
    return scale === undefined
      ? parseBestImageReadyMessage(data, width)
      : parseBestImageReadyMessage(data, width, scale);
  };

  /** 处理页面版本、高度和就绪消息。 */
  const handlePreviewMessage = (dataValue: string, pageId: string) => {
    const guard = configRef.current.previewRenderingGuard;
    const runtimeMessage = parseBestImageRuntimeMessage(dataValue, width);
    if (runtimeMessage) {
      if (guard) updateBestImageWebViewRenderingState(setPreviewStates, pageId, runtimeMessage.version);
      else updateBestImageWebViewState(setPreviewStates, pageId, 'rendering', runtimeMessage.version);
    }
    const measuredHeight = parseHeightMessage(dataValue);
    if (measuredHeight !== null) {
      setPageHeights((current) => ({ ...current, [pageId]: measuredHeight }));
      if (guard) updateBestImageWebViewRenderingState(setPreviewStates, pageId);
      else updateBestImageWebViewState(setPreviewStates, pageId, 'rendering');
    }
    const readyHeight = parseReadyMessage(dataValue);
    if (readyHeight !== null) updateBestImageWebViewState(setPreviewStates, pageId, 'ready');
  };

  /** 挂载导出画布并等待页面上报就绪高度。 */
  const waitForExportPage = (
    waitForIndex: number,
    pages: readonly { id: string }[],
  ): Promise<number> => new Promise((resolve, reject) => {
    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportResolve.current = resolve;
    exportReject.current = reject;
    const pageId = pages[waitForIndex]?.id;
    // 优先使用预览已测得的页高，避免导出 WebView 先按最小 3:4 盒子挂载、
    // 资源就绪前出现信箱化（多页导出时第 2 页起更明显）。
    const knownHeight = pageId ? pageHeights[pageId] : undefined;
    setExportHeight(knownHeight ?? configRef.current.defaultExportHeight(width));
    setExportIndex(waitForIndex);
    exportTimer.current = setTimeout(() => {
      exportResolve.current = null;
      exportReject.current = null;
      reject(new Error('图片渲染超时'));
    }, EXPORT_RENDER_TIMEOUT_MS);
  });

  /** 测量页面高度，并等待原生捕获视图稳定。 */
  const handleExportMessage = (dataValue: string) => {
    const measured = parseHeightMessage(dataValue);
    if (measured !== null) setExportHeight(measured);
    const readyHeight = parseReadyMessage(dataValue);
    if (readyHeight === null || !exportResolve.current) return;
    setExportHeight(readyHeight);
    const resolve = exportResolve.current;
    exportResolve.current = null;
    exportReject.current = null;
    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportTimer.current = null;
    // 等待原生捕获视图采用最终高度。
    setTimeout(() => resolve(readyHeight), EXPORT_RESOLVE_DELAY_MS);
  };

  /** iOS 截图失败时改用 useRenderInContext。 */
  const captureExportPage = async (index: number, pages: readonly { id: string }[]): Promise<string> => {
    const height = await waitForExportPage(index, pages);
    const dimensions = bestImageCaptureDimensions(width, height, PixelRatio.get(), Platform.OS);
    const useRenderInContext = shouldUseBestImageRenderInContext(Platform.OS, width, height);
    const captureOptions = {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
      ...dimensions,
      ...(useRenderInContext ? { useRenderInContext: true } : {}),
    } as const;
    try {
      return await captureRef(exportCaptureRef, captureOptions);
    } catch (error) {
      if (Platform.OS !== 'ios' || useRenderInContext || !isDrawViewHierarchyError(error)) throw error;
      return await captureRef(exportCaptureRef, { ...captureOptions, useRenderInContext: true });
    }
  };

  const exportImages = async (runtime: BestImageScreenControllerRuntime) => {
    const { canExport, htmlPages, sources, buildExportFilename, pages } = runtime;
    const { wrapExportPageError, exportBusyIncludesIndex } = configRef.current;
    const busy = exportStatus !== null || (exportBusyIncludesIndex === true && exportIndex !== null);
    if (!htmlPages || !sources || !canExport || busy) return;
    const pageCount = htmlPages.length;
    const captures: { uri: string; filename: string }[] = [];
    try {
      await requestBestImageExportPermission();
      for (let index = 0; index < pageCount; index += 1) {
        setExportStatus(`正在导出 ${index + 1}/${pageCount}`);
        let uri: string;
        if (wrapExportPageError) {
          try {
            uri = await captureExportPage(index, pages);
          } catch (error) {
            throw new Error(`第 ${index + 1}/${pageCount} 页生成失败`, { cause: error });
          }
        } else {
          uri = await captureExportPage(index, pages);
        }
        captures.push({ uri, filename: buildExportFilename(index, pageCount) });
      }
      setExportIndex(null);
      for (let index = 0; index < captures.length; index += 1) {
        setExportStatus(`正在保存 ${index + 1}/${captures.length}`);
        if (wrapExportPageError) {
          try {
            await saveBestImageCapture(captures[index]!.uri, captures[index]!.filename);
          } catch (error) {
            throw new Error(`第 ${index + 1}/${captures.length} 页保存失败`, { cause: error });
          }
        } else {
          await saveBestImageCapture(captures[index]!.uri, captures[index]!.filename);
        }
      }
      showNotification({
        title: '导出完成',
        message: `已保存 ${captures.length} 张成绩图片到相册`,
        variant: 'success',
      });
    } catch {
      showNotification({
        title: '导出失败',
        message: '无法导出成绩图片，请重试。',
        variant: 'error',
      });
    } finally {
      if (exportTimer.current) clearTimeout(exportTimer.current);
      exportTimer.current = null;
      exportResolve.current = null;
      exportReject.current = null;
      setExportIndex(null);
      setExportStatus(null);
      captures.forEach((capture) => deleteBestImageCapture(capture.uri));
    }
  };

  const cancelExportRequest = () => {
    exportReject.current?.(new Error('导出已取消'));
  };

  return {
    // 通用选择状态
    width,
    setWidth,
    type,
    setType,
    quantityText,
    setQuantityText,
    prefs,
    setPrefs,
    prefsReady,
    picker,
    setPicker,
    // 预览分页状态
    pageHeights,
    setPageHeights,
    pageIndex,
    setPageIndex,
    previewStates,
    setPreviewStates,
    // 导出状态与动作
    exportIndex,
    exportHeight,
    exportStatus,
    exportCaptureRef,
    exportImages,
    cancelExportRequest,
    handleExportMessage,
    // 预览消息入口
    handlePreviewMessage,
  };
}

/** 控制器返回值中供骨架透传的类型别名（pageHeights / previewStates 的 setter 形态）。 */
export type BestImagePageHeightsSetter = Dispatch<SetStateAction<Record<string, number>>>;
export type BestImagePreviewStatesSetter = Dispatch<SetStateAction<Record<string, BestImageWebViewState>>>;
export type BestImageCaptureRef = RefObject<View | null>;
