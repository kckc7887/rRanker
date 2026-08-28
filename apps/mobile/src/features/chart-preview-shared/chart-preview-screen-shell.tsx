/**
 * 谱面确认公共屏幕壳（公共路径）：
 * 承接各游戏谱面确认屏幕的全部共有逻辑——prepare 执行与超时中止、
 * 卸载停播、返回键退出全屏、ready/fullscreen/error/settings 桥接、
 * 播放器设置 KV 读写合并、错误/加载分支与 WebView 属性透传。
 * 游戏差异仅通过 props 表达（请求对象、文案、testID、注入策略），
 * 壳不感知具体游戏，不出现游戏 ID / Storage key 字面量分支。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import Storage from 'expo-sqlite/kv-store';
import {
  chartPreviewExitFullscreenScript,
  chartPreviewPlayerMessageScript,
  chartPreviewStopScript,
  parseChartPreviewBridgeMessage,
} from './chart-preview-bridge';
import { chartPreviewNativeScreenOptions } from './chart-preview-native-screen-options';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { recordRuntimeDiagnostic } from '@/services/runtime-diagnostics';
import { useAppTheme } from '@/theme/app-theme';

export type ChartPreviewShellSource = {
  uri: string;
  allowingReadAccessToURL: string;
  dispose?: () => void;
};

export type ChartPreviewShellRequest<TPayload> =
  | { kind: 'error'; message: string }
  | { kind: 'waiting' }
  | {
      kind: 'ready';
      payload: TPayload;
      timeoutMs?: number;
      prepare: (signal: AbortSignal, settings: unknown) => Promise<ChartPreviewShellSource>;
    };

export type ChartPreviewScreenShellProps<TPayload> = {
  request: ChartPreviewShellRequest<TPayload>;
  settingsKey: string;
  testID: string;
  accessibilityLabel: string;
  errorHint: string;
  prepareErrorFallback: string;
  externalError?: string | null;
  allowFileAccess: boolean;
  buildInjectedJavaScript?: (payload: TPayload) => string;
  reInjectOnLoadEnd?: boolean;
  blockOnHttpError?: boolean;
  onBridgeMessage?: (
    message: ReturnType<typeof parseChartPreviewBridgeMessage> & Record<string, unknown>,
    bridge: { postMessage: (message: Record<string, unknown>) => void },
  ) => void;
};

async function loadSettings(settingsKey: string): Promise<Record<string, unknown>> {
  try {
    const raw = await Storage.getItem(settingsKey);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function ChartPreviewScreenShell<TPayload>({
  request,
  settingsKey,
  testID,
  accessibilityLabel,
  errorHint,
  prepareErrorFallback,
  externalError,
  allowFileAccess,
  buildInjectedJavaScript,
  reInjectOnLoadEnd,
  blockOnHttpError = true,
  onBridgeMessage,
}: ChartPreviewScreenShellProps<TPayload>) {
  const theme = useAppTheme();
  const lifecycle = useAppLifecycle();
  const foreground = lifecycle.foregroundReady;
  const webRef = useRef<WebView>(null);
  const settingsRef = useRef<Record<string, unknown>>({});
  const settingsWriteQueueRef = useRef<Promise<void>>(Promise.resolve());

  const [source, setSource] = useState<ChartPreviewShellSource | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [webViewRetryGeneration, setWebViewGeneration] = useState(0);
  const webViewGeneration = `${lifecycle.foregroundGeneration}-${webViewRetryGeneration}`;

  useEffect(() => {
    if (foreground) return;
    webRef.current?.injectJavaScript(chartPreviewStopScript());
    setReady(false);
    setIsFullscreen(false);
    void recordRuntimeDiagnostic('web-content', {
      lifecyclePhase: lifecycle.phase,
      webContentState: 'released',
    });
  }, [foreground, lifecycle.memoryWarningGeneration, lifecycle.phase]);

  useEffect(() => {
    if (!foreground || !source) return;
    void recordRuntimeDiagnostic('web-content', {
      lifecyclePhase: lifecycle.phase,
      webContentState: 'mounted',
    });
  }, [foreground, lifecycle.phase, source]);

  // deps 定稿为 request；settingsKey / prepareErrorFallback 为屏幕级恒定值。
  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let preparedSource: ChartPreviewShellSource | undefined;

    if (!foreground || request.kind !== 'ready') {
      setSource(null);
      return () => {
        cancelled = true;
      };
    }

    setSource(null);
    setReady(false);
    setIsFullscreen(false);
    setPlayerError(null);
    setStageError(null);
    settingsRef.current = {};

    void (async () => {
      const localController = new AbortController();
      controller = localController;
      if (request.timeoutMs !== undefined) {
        timeout = setTimeout(() => localController.abort(), request.timeoutMs);
      }
      try {
        const settings = await loadSettings(settingsKey);
        settingsRef.current = settings;
        const prepared = await request.prepare(localController.signal, settings);
        preparedSource = prepared;
        if (cancelled) prepared.dispose?.();
        else setSource(prepared);
      } catch (error) {
        // 诊断日志：底层原因只进日志，不进用户界面。
        console.log('[chart-preview] prepare error', error);
        if (!cancelled) {
          setStageError(localController.signal.aborted
            ? '准备谱面确认资源超时，请返回重试'
            : prepareErrorFallback);
        }
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    })();

    return () => {
      cancelled = true;
      controller?.abort();
      if (timeout) clearTimeout(timeout);
      // 卸载时停止播放；cleanup 必须读最新 webRef。
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional latest ref
      webRef.current?.injectJavaScript(chartPreviewStopScript());
      preparedSource?.dispose?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps 定稿为 request
  }, [foreground, lifecycle.foregroundGeneration, request]);

  useEffect(() => {
    if (!isFullscreen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      webRef.current?.injectJavaScript(chartPreviewExitFullscreenScript());
      return true;
    });
    return () => subscription.remove();
  }, [isFullscreen]);

  const persistSettings = useCallback((partial: Record<string, unknown>) => {
    settingsRef.current = { ...settingsRef.current, ...partial };
    const serialized = JSON.stringify(settingsRef.current);
    settingsWriteQueueRef.current = settingsWriteQueueRef.current
      .catch(() => undefined)
      .then(() => Storage.setItem(settingsKey, serialized))
      .catch(() => undefined);
  }, [settingsKey]);

  const bridge = useMemo(() => ({
    postMessage: (message: Record<string, unknown>) => {
      webRef.current?.injectJavaScript(chartPreviewPlayerMessageScript(message));
    },
  }), []);

  // 与两屏现状一致：injected 随 request 稳定，不随注入构建器的渲染期引用变化。
  const injected = useMemo(() => {
    if (request.kind === 'ready' && buildInjectedJavaScript) {
      return buildInjectedJavaScript(request.payload);
    }
    return 'true;';
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 注入构建器随屏幕恒定
  }, [request]);

  const blockingError = (request.kind === 'error' ? request.message : null)
    ?? externalError
    ?? stageError
    ?? playerError;

  // 播放器 WebView 的深浅色底色（与播放器 HTML 的 --bg 保持一致，避免加载闪色）。
  const webviewBackground = theme.dark ? '#0b0d12' : '#F7F8FA';
  const loadingOverlayBackground = theme.dark ? 'rgba(11,13,18,0.72)' : 'rgba(247,248,250,0.72)';

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Stack.Screen options={chartPreviewNativeScreenOptions(isFullscreen, Platform.OS)} />
      {/* 入口详情页因深色沉浸头声明了白字状态栏且 push 后仍挂载；壳必须显式接管，否则浅色下白字叠白 header。 */}
      <StatusBar style={theme.statusBar} />
      {blockingError ? (
        <View style={styles.center} accessibilityLabel={`谱面确认错误：${blockingError}`}>
          <Text style={[styles.error, { color: theme.text }]}>{blockingError}</Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>{errorHint}</Text>
        </View>
      ) : !source ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.hint, { color: theme.textMuted }]}>正在准备播放器…</Text>
        </View>
      ) : !foreground ? (
        <View style={styles.center} />
      ) : (
        <View style={styles.webviewWrap}>
          {!ready ? (
            <View style={[styles.loadingOverlay, { backgroundColor: loadingOverlayBackground }]} pointerEvents="none">
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : null}
          <WebView
            key={`chart-preview-${webViewGeneration}`}
            ref={webRef}
            testID={testID}
            accessibilityLabel={accessibilityLabel}
            allowFileAccess={allowFileAccess}
            allowFileAccessFromFileURLs
            allowingReadAccessToURL={source.allowingReadAccessToURL}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['file://*']}
            mixedContentMode="always"
            setSupportMultipleWindows={false}
            source={{ uri: source.uri }}
            onShouldStartLoadWithRequest={(navigation) => navigation.isTopFrame === false
              || navigation.url === source.uri}
            injectedJavaScriptBeforeContentLoaded={injected}
            style={[styles.webview, { backgroundColor: webviewBackground }]}
            onLoadEnd={() => {
              if (!reInjectOnLoadEnd || request.kind !== 'ready') return;
              const script = buildInjectedJavaScript?.(request.payload);
              if (script !== undefined) webRef.current?.injectJavaScript(script);
            }}
            onMessage={(event) => {
              const data = parseChartPreviewBridgeMessage(event.nativeEvent.data);
              if (!data) return;
              if (data.type === 'ready') setReady(true);
              if (data.type === 'fullscreen' && typeof data.active === 'boolean') {
                setIsFullscreen(data.active);
              }
              if (data.type === 'error') {
                // 诊断日志：底层原因只进日志，不进用户界面。
                console.log('[chart-preview] player error', {
                  diagnostic: typeof data.diagnostic === 'string' ? data.diagnostic : undefined,
                  message: typeof data.message === 'string' ? data.message : undefined,
                });
                setIsFullscreen(false);
                setPlayerError('谱面播放失败，请返回重试。');
              }
              if (data.type === 'settings') {
                const { type: _type, message: _message, active: _active, ...settings } = data;
                persistSettings(settings);
              }
              onBridgeMessage?.(data, bridge);
            }}
            onError={(event) => {
              console.log('[chart-preview] webview error', event?.nativeEvent);
              setIsFullscreen(false);
              setPlayerError('播放器加载失败，请返回重试。');
            }}
            onContentProcessDidTerminate={() => {
              setReady(false);
              setIsFullscreen(false);
              setWebViewGeneration((value) => value + 1);
            }}
            onRenderProcessGone={() => {
              setReady(false);
              setIsFullscreen(false);
              setWebViewGeneration((value) => value + 1);
            }}
            onHttpError={(event) => {
              console.log('[chart-preview] webview http error', event?.nativeEvent);
              if (!blockOnHttpError) return;
              setIsFullscreen(false);
              setPlayerError('播放器加载失败，请返回重试。');
            }}
          />
        </View>
      )}
      {Platform.OS === 'web' && !blockingError ? (
        <Text style={[styles.hint, { color: theme.textMuted, padding: 12 }]}>
          Web 端谱面确认依赖本地 file 资源，请在 iOS/Android 上使用。
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  error: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  hint: { fontSize: 13, textAlign: 'center' },
  webviewWrap: { flex: 1 },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
