/**
 * 谱面确认公共屏幕壳（公共路径）：
 * 承接各游戏谱面确认屏幕的全部共有逻辑——prepare 执行与超时中止、
 * 卸载停播、返回键退出全屏、ready/fullscreen/error/settings/progress 桥接、
 * 播放器设置 KV 读写合并、错误/加载分支与 WebView 属性透传。
 * 游戏差异仅通过 props 表达（请求对象、文案、testID、注入策略），
 * 壳不感知具体游戏，不出现游戏 ID / Storage key 字面量分支。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
import {
  CHART_PREVIEW_PLAYER_LABEL,
  chartPreviewPrepareProgress,
  chartPreviewWebViewProgress,
  clampChartPreviewProgress,
  mergeChartPreviewProgress,
  type ChartPreviewLoadProgress,
} from './chart-preview-progress';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { recordRuntimeDiagnostic } from '@/services/runtime-diagnostics';
import { createRuntimeOperation } from '@/services/runtime-diagnostics-recorder';
import { ProviderError, providerErrorToUserMessage } from '@/providers/errors';
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
      readyTimeoutMs?: number;
      prepare: (
        signal: AbortSignal,
        settings: unknown,
        onProgress?: (progress: ChartPreviewLoadProgress) => void,
      ) => Promise<ChartPreviewShellSource>;
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

const INITIAL_LOAD_PROGRESS: ChartPreviewLoadProgress = {
  label: CHART_PREVIEW_PLAYER_LABEL,
  value: 0,
};

type PreviewSession = {
  active: boolean;
  generation: object;
  memoryWarningGeneration: number;
  operation: ReturnType<typeof createRuntimeOperation>;
  release: () => void;
  markReady: () => void;
};

type PreparedPreview = { source: ChartPreviewShellSource; session: PreviewSession };
type ReleaseReason = 'memory' | 'process';
const PREPARE_TIMEOUT_MS = 120_000;
const READY_TIMEOUT_MS = 60_000;

async function loadSettings(settingsKey: string): Promise<Record<string, unknown>> {
  try {
    const raw = await Storage.getItem(settingsKey);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function ChartPreviewLoadProgressBar({
  progress,
  accent,
  track,
  labelColor,
  valueColor,
}: {
  progress: ChartPreviewLoadProgress;
  accent: string;
  track: string;
  labelColor: string;
  valueColor: string;
}) {
  // 进度条只在 ready 前显示；下载、解码完成不能代替播放器的 ready 握手。
  const percent = Math.min(99, Math.round(clampChartPreviewProgress(progress.value) * 100));
  const spokenLabel = progress.label.replace(/…$/u, '');
  return (
    <View
      accessibilityLabel={`${spokenLabel} ${percent}%`}
      style={styles.progress}
      testID="chart-preview-load-progress"
    >
      <View style={styles.progressHeader}>
        <Text style={[styles.progressLabel, { color: labelColor }]}>{progress.label}</Text>
        <Text style={[styles.progressValue, { color: valueColor }]}>{percent}%</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: track }]}>
        <View style={[styles.progressFill, {
          backgroundColor: accent,
          width: `${percent}%` as `${number}%`,
        }]} />
      </View>
    </View>
  );
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

  const [preparedView, setPreparedView] = useState<PreparedPreview | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reloadGeneration, setReloadGeneration] = useState(0);
  const [backgroundBlocked, setBackgroundBlocked] = useState(!foreground);
  const [releaseReason, setReleaseReason] = useState<ReleaseReason | null>(null);
  const reloadPendingRef = useRef(false);
  const [loadProgress, setLoadProgress] = useState<ChartPreviewLoadProgress>(INITIAL_LOAD_PROGRESS);
  const loadProgressRef = useRef(loadProgress);
  const progressFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memoryWarningRef = useRef(lifecycle.memoryWarningGeneration);
  // 请求或真正的重载一发生，旧回调在 effect 清理之前也立即失效。
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dependencies identify the preparation lifetime
  const generation = useMemo(() => ({}), [request, externalError, lifecycle.foregroundGeneration, reloadGeneration]);
  const generationRef = useRef(generation);
  generationRef.current = generation;
  const lifecycleRef = useRef(lifecycle);
  lifecycleRef.current = lifecycle;
  const sessionRef = useRef<PreviewSession | null>(null);
  const isCurrentSession = useCallback((session: PreviewSession) => session.active
    && sessionRef.current === session
    && generationRef.current === session.generation
    && lifecycleRef.current.phase !== 'background'
    && lifecycleRef.current.memoryWarningGeneration === session.memoryWarningGeneration, []);
  const source = preparedView?.source;
  const viewSession = preparedView?.session;
  const isCurrentView = () => viewSession !== undefined && isCurrentSession(viewSession);
  const recordView = (phase: string, fields: Readonly<Record<string, unknown>> = {}) => {
    if (isCurrentView()) viewSession?.operation.record(phase, fields);
  };
  const backgrounded = lifecycle.phase === 'background';
  const heavyContentMounted = !backgroundBlocked && releaseReason === null && !externalError;
  const prepareGeneration = heavyContentMounted ? generation : null;

  const applyLoadProgress = useCallback((next: ChartPreviewLoadProgress) => {
    const merged = mergeChartPreviewProgress(loadProgressRef.current, next);
    loadProgressRef.current = merged;
    if (progressFlushRef.current !== null) return;
    progressFlushRef.current = setTimeout(() => {
      progressFlushRef.current = null;
      setLoadProgress(loadProgressRef.current);
    }, 50);
  }, []);

  const commitLoadProgress = useCallback((next?: ChartPreviewLoadProgress) => {
    if (progressFlushRef.current !== null) {
      clearTimeout(progressFlushRef.current);
      progressFlushRef.current = null;
    }
    if (next) loadProgressRef.current = mergeChartPreviewProgress(loadProgressRef.current, next);
    setLoadProgress(loadProgressRef.current);
  }, []);

  const resetLoadProgress = useCallback(() => {
    if (progressFlushRef.current !== null) {
      clearTimeout(progressFlushRef.current);
      progressFlushRef.current = null;
    }
    loadProgressRef.current = INITIAL_LOAD_PROGRESS;
    setLoadProgress(INITIAL_LOAD_PROGRESS);
  }, []);

  const releasePlayer = useCallback((reason?: ReleaseReason) => {
    sessionRef.current?.release();
    setPreparedView(null);
    setReady(false);
    setIsFullscreen(false);
    resetLoadProgress();
    if (reason) {
      setReleaseReason(reason);
      setStageError(null);
      setPlayerError(null);
    }
  }, [resetLoadProgress]);

  useEffect(() => () => {
    if (progressFlushRef.current !== null) clearTimeout(progressFlushRef.current);
  }, []);

  useEffect(() => {
    const memoryWarning = lifecycle.memoryWarningGeneration > memoryWarningRef.current
      && sessionRef.current !== null;
    memoryWarningRef.current = lifecycle.memoryWarningGeneration;
    if (!backgrounded && !memoryWarning) return;
    if (backgrounded) setBackgroundBlocked(true);
    releasePlayer(memoryWarning ? 'memory' : undefined);
    void recordRuntimeDiagnostic('web-content', {
      source: 'chart-preview',
      lifecyclePhase: lifecycle.phase,
      webContentState: 'released',
    });
  }, [backgrounded, lifecycle.memoryWarningGeneration, lifecycle.phase, releasePlayer]);

  useEffect(() => {
    if (lifecycle.phase !== 'inactive') return;
    webRef.current?.injectJavaScript(chartPreviewStopScript());
    setIsFullscreen(false);
  }, [lifecycle.phase]);

  useEffect(() => {
    if (!foreground) return;
    setBackgroundBlocked(false);
  }, [foreground, lifecycle.foregroundGeneration]);

  useEffect(() => {
    if (!heavyContentMounted || !source) return;
    void recordRuntimeDiagnostic('web-content', {
      source: 'chart-preview',
      lifecyclePhase: lifecycle.phase,
      webContentState: 'mounted',
    });
  }, [heavyContentMounted, lifecycle.phase, source]);

  // settingsKey / prepareErrorFallback 为屏幕级恒定值。
  useEffect(() => {
    reloadPendingRef.current = false;
    setPreparedView(null);
    setReady(false);
    setIsFullscreen(false);
    setPlayerError(null);
    setStageError(null);
    resetLoadProgress();
    if (prepareGeneration === null || request.kind !== 'ready') return;

    const controller = new AbortController();
    let prepareTimeout: ReturnType<typeof setTimeout> | undefined;
    let readyTimeout: ReturnType<typeof setTimeout> | undefined;
    let preparedSource: ChartPreviewShellSource | undefined;
    let finished = false;
    settingsRef.current = {};
    const operation = createRuntimeOperation('chart-preview');
    operation.record('prepare', { result: 'start' });
    const finish = (result: string, error?: unknown) => {
      if (finished) return;
      finished = true;
      operation.record('prepare', { result, errorCode: result === 'timeout' ? 'timeout' : result === 'cancelled' ? 'cancelled' : undefined, error });
    };
    const session: PreviewSession = {
      active: true,
      generation: prepareGeneration,
      memoryWarningGeneration: lifecycleRef.current.memoryWarningGeneration,
      operation,
      release: () => {
        if (!session.active) return;
        session.active = false;
        finish('cancelled');
        if (prepareTimeout !== undefined) clearTimeout(prepareTimeout);
        if (readyTimeout !== undefined) clearTimeout(readyTimeout);
        if (sessionRef.current === session) {
          sessionRef.current = null;
          // 卸载前停止最新实例；旧会话清理不得向新实例注入脚本。
          webRef.current?.injectJavaScript(chartPreviewStopScript());
          if (progressFlushRef.current !== null) {
            clearTimeout(progressFlushRef.current);
            progressFlushRef.current = null;
          }
        }
        controller.abort();
        preparedSource?.dispose?.();
        preparedSource = undefined;
      },
      markReady: () => {
        if (readyTimeout !== undefined) clearTimeout(readyTimeout);
        readyTimeout = undefined;
      },
    };
    sessionRef.current = session;
    const fail = (error: unknown, fallback: string, timeoutMessage?: string) => {
      session.release();
      setPreparedView(null);
      setReady(false);
      setIsFullscreen(false);
      setStageError(providerErrorToUserMessage(error, fallback, {
        permission: '谱面资源暂时不可用，请稍后重试。',
        ...(timeoutMessage ? { timeout: timeoutMessage } : {}),
      }));
    };
    prepareTimeout = setTimeout(() => {
      if (!isCurrentSession(session)) return;
      finish('timeout');
      fail(new ProviderError('timeout', 'Chart preparation timed out', true),
        prepareErrorFallback, '准备谱面确认资源超时，请重新加载。');
    }, request.timeoutMs ?? PREPARE_TIMEOUT_MS);

    void (async () => {
      try {
        await settingsWriteQueueRef.current;
        if (!isCurrentSession(session)) return;
        const settings = await loadSettings(settingsKey);
        if (!isCurrentSession(session)) return;
        settingsRef.current = settings;
        const prepared = await request.prepare(controller.signal, settings, (progress) => {
          if (isCurrentSession(session)) applyLoadProgress(chartPreviewPrepareProgress(progress));
        });
        if (!isCurrentSession(session)) {
          prepared.dispose?.();
          return;
        }
        preparedSource = prepared;
        if (prepareTimeout !== undefined) clearTimeout(prepareTimeout);
        prepareTimeout = undefined;
        finish('success');
        commitLoadProgress();
        setPreparedView({ source: prepared, session });
        readyTimeout = setTimeout(() => {
          if (!isCurrentSession(session)) return;
          operation.record('ready-timeout', { result: 'timeout', errorCode: 'timeout' });
          fail(new ProviderError('timeout', 'Chart player ready timed out', true),
            prepareErrorFallback, '播放器准备超时，请重新加载。');
        }, request.readyTimeoutMs ?? READY_TIMEOUT_MS);
      } catch (error) {
        if (!isCurrentSession(session)) return;
        finish('error', error);
        // 诊断日志：底层原因只进日志，不进用户界面。
        console.log('[chart-preview] prepare error', error);
        fail(error, prepareErrorFallback);
      }
    })();

    return session.release;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 屏幕级配置引用恒定
  }, [prepareGeneration, request]);

  const reload = () => {
    if (!foreground || request.kind !== 'ready' || reloadPendingRef.current) return;
    reloadPendingRef.current = true;
    releasePlayer();
    setStageError(null);
    setPlayerError(null);
    setReleaseReason(null);
    setReloadGeneration((value) => value + 1);
  };

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
      if (!viewSession || !isCurrentSession(viewSession)) return;
      webRef.current?.injectJavaScript(chartPreviewPlayerMessageScript(message));
    },
  }), [isCurrentSession, viewSession]);

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
  const canReload = request.kind === 'ready' && !externalError;
  const reloadButton = canReload ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="重新加载"
      disabled={!foreground}
      onPress={reload}
      style={[styles.reloadButton, { backgroundColor: theme.accent, opacity: foreground ? 1 : 0.5 }]}
    >
      <Text style={styles.reloadText}>重新加载</Text>
    </Pressable>
  ) : null;
  const failPlayer = (message: string) => {
    releasePlayer();
    setPlayerError(message);
  };

  // 播放器 WebView 的深浅色底色（与播放器 HTML 的 --bg 保持一致，避免加载闪色）。
  const webviewBackground = theme.dark ? '#0b0d12' : '#F7F8FA';
  const loadingOverlayBackground = theme.dark ? 'rgba(11,13,18,0.72)' : 'rgba(247,248,250,0.72)';
  const progressBar = (
    <ChartPreviewLoadProgressBar
      accent={theme.accent}
      labelColor={theme.textMuted}
      progress={loadProgress}
      track={theme.surfaceMuted}
      valueColor={theme.text}
    />
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Stack.Screen options={chartPreviewNativeScreenOptions(isFullscreen, Platform.OS)} />
      {/* 入口详情页因深色沉浸头声明了白字状态栏且 push 后仍挂载；壳必须显式接管，否则浅色下白字叠白 header。 */}
      <StatusBar style={theme.statusBar} />
      {blockingError ? (
        <View style={styles.center} accessibilityLabel={`谱面确认错误：${blockingError}`}>
          <Text style={[styles.error, { color: theme.text }]}>{blockingError}</Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>{errorHint}</Text>
          {reloadButton}
        </View>
      ) : releaseReason ? (
        <View style={styles.center} accessibilityLabel="谱面确认已暂停">
          <Text style={[styles.error, { color: theme.text }]}>
            {releaseReason === 'memory' ? '设备内存紧张，播放器已暂停。' : '播放器意外停止，请重新加载。'}
          </Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>重新加载后，点击播放继续看谱。</Text>
          {reloadButton}
        </View>
      ) : !heavyContentMounted ? (
        <View style={styles.center} />
      ) : !source ? (
        <View style={styles.center}>{progressBar}</View>
      ) : (
        <View style={styles.webviewWrap}>
          {!ready ? (
            <View style={[styles.loadingOverlay, { backgroundColor: loadingOverlayBackground }]} pointerEvents="none">
              {progressBar}
            </View>
          ) : null}
          <WebView
            key={`chart-preview-${viewSession?.operation.operationId}`}
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
            onShouldStartLoadWithRequest={(navigation) => isCurrentView() && (navigation.isTopFrame === false
              || navigation.url === source.uri)}
            injectedJavaScriptBeforeContentLoaded={injected}
            style={[styles.webview, { backgroundColor: webviewBackground }]}
            onLoadEnd={() => {
              if (!isCurrentView()) return;
              recordView('loaded');
              if (!reInjectOnLoadEnd || request.kind !== 'ready') return;
              const script = buildInjectedJavaScript?.(request.payload);
              if (script !== undefined) webRef.current?.injectJavaScript(script);
            }}
            onMessage={(event) => {
              if (!isCurrentView()) return;
              const data = parseChartPreviewBridgeMessage(event.nativeEvent.data);
              if (!data) return;
              if (data.type === 'progress') {
                applyLoadProgress(chartPreviewWebViewProgress({
                  label: typeof data.label === 'string' && data.label ? data.label : CHART_PREVIEW_PLAYER_LABEL,
                  value: typeof data.value === 'number' ? data.value : 0,
                }));
              }
              if (data.type === 'ready') {
                recordView('ready');
                viewSession?.markReady();
                commitLoadProgress({ label: CHART_PREVIEW_PLAYER_LABEL, value: 1 });
                setReady(true);
              }
              if (data.type === 'fullscreen' && typeof data.active === 'boolean') {
                setIsFullscreen(data.active);
              }
              if (data.type === 'error') {
                recordView('player-error', { result: 'error', error: data });
                // 诊断日志：底层原因只进日志，不进用户界面。
                console.log('[chart-preview] player error', {
                  diagnostic: typeof data.diagnostic === 'string' ? data.diagnostic : undefined,
                  message: typeof data.message === 'string' ? data.message : undefined,
                });
                failPlayer('谱面播放失败，请返回重试。');
                return;
              }
              if (data.type === 'settings') {
                const { type: _type, message: _message, active: _active, ...settings } = data;
                persistSettings(settings);
              }
              onBridgeMessage?.(data, bridge);
            }}
            onError={(event) => {
              if (!isCurrentView()) return;
              recordView('load-error', { result: 'error', error: event?.nativeEvent });
              console.log('[chart-preview] webview error', event?.nativeEvent);
              failPlayer('播放器加载失败，请返回重试。');
            }}
            onContentProcessDidTerminate={() => {
              if (!isCurrentView()) return;
              recordView('terminated');
              releasePlayer('process');
            }}
            onRenderProcessGone={() => {
              if (!isCurrentView()) return;
              recordView('process-gone');
              releasePlayer('process');
            }}
            onHttpError={(event) => {
              if (!isCurrentView()) return;
              void recordRuntimeDiagnostic('request', { source: 'chart-preview', result: 'error', status: event?.nativeEvent?.statusCode });
              console.log('[chart-preview] webview http error', event?.nativeEvent);
              if (!blockOnHttpError) return;
              failPlayer('播放器加载失败，请返回重试。');
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
  reloadButton: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginTop: 4 },
  reloadText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  webviewWrap: { flex: 1 },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  progress: { width: '80%', maxWidth: 320, gap: 7 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  progressLabel: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  progressValue: { fontSize: 13, lineHeight: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
});
