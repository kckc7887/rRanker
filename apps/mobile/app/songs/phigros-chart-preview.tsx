import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import Storage from 'expo-sqlite/kv-store';
import {
  type PhigrosChartPreviewSettings,
} from '@/features/phigros-chart-preview/phigros-chart-preview-inject';
import {
  buildPhigrosChartPreviewInput,
  buildPhiraChartPreviewInput,
} from '@/features/phigros-chart-preview/chart-preview-input';
import {
  phigrosChartPreviewAllowsFileAccess,
  preparePhigrosChartPreviewWebViewSource,
  stagePhiraChartMusic,
  stagePhiraRpeBundle,
  type PhigrosChartPreviewWebViewSource,
} from '@/features/phigros-chart-preview/prepare-phigros-chart-preview-webview';
import {
  chartPreviewExitFullscreenScript,
  chartPreviewStopScript,
  parseChartPreviewBridgeMessage,
} from '@/features/maimai-chart-preview/chart-preview-inject';
import { chartPreviewNativeScreenOptions } from '@/features/maimai-chart-preview/chart-preview-native-screen';
import { usePhiraChart } from '@/hooks/use-phira';
import { useAppTheme } from '@/theme/app-theme';
import type { PhiraChart } from '@/domain/phira';
import { resolveChartPreviewNavigation } from '@/features/phigros-chart-preview/chart-preview-navigation';

const SETTINGS_KEY = 'phigros-chart-preview-settings';
/** Phigros 仅需读取 OSS 的三个 JSON 指针文件，超时给得短。 */
const PHIGROS_PREPARE_TIMEOUT_MS = 20_000;
/** Phira 需要下载并解包谱面 ZIP，社区文件可能较大，超时放宽。 */
const PHIRA_PREPARE_TIMEOUT_MS = 60_000;

async function loadSettings(): Promise<PhigrosChartPreviewSettings> {
  try {
    const raw = await Storage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PhigrosChartPreviewSettings;
  } catch {
    return {};
  }
}

async function saveSettings(partial: PhigrosChartPreviewSettings): Promise<void> {
  try {
    const raw = await Storage.getItem(SETTINGS_KEY);
    const current: PhigrosChartPreviewSettings = raw ? JSON.parse(raw) : {};
    const merged = { ...current, ...partial };
    await Storage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
}

type MappedPreview =
  | { error: string }
  | { game: 'phigros'; songId: string; levelIndex: number; title?: string }
  | { game: 'phira'; chartId: number; title?: string; chart?: PhiraChart };

function mapParams(
  game: string | undefined,
  songId: string | undefined,
  levelIndex: string | undefined,
  chartId: string | undefined,
  title: string | undefined,
): MappedPreview {
  const normalizedTitle = typeof title === 'string' && title.trim() !== '' ? title.trim() : undefined;
  if (game === 'phigros') {
    const normalizedSongId = songId?.trim();
    const parsedLevelIndex = levelIndex === undefined ? NaN : Number(levelIndex);
    if (!normalizedSongId) return { error: '缺少歌曲参数' };
    if (!Number.isInteger(parsedLevelIndex) || parsedLevelIndex < 0 || parsedLevelIndex > 3) return { error: '缺少或无效的难度参数' };
    return { game: 'phigros', songId: normalizedSongId, levelIndex: parsedLevelIndex, title: normalizedTitle };
  }
  if (game === 'phira') {
    const parsedChartId = Number(chartId);
    if (!Number.isInteger(parsedChartId) || parsedChartId <= 0) return { error: '缺少或无效的谱面 ID' };
    return { game: 'phira', chartId: parsedChartId, title: normalizedTitle };
  }
  return { error: '缺少游戏参数' };
}

export default function PhigrosChartPreviewScreen() {
  const theme = useAppTheme();
  const webRef = useRef<WebView>(null);
  const params = useLocalSearchParams<{
    requestId?: string;
    game?: string;
    songId?: string;
    levelIndex?: string;
    chartId?: string;
    title?: string;
  }>();

  const handedRequest = useMemo(
    () => resolveChartPreviewNavigation(params.requestId),
    [params.requestId],
  );

  const mapped = useMemo(
    (): MappedPreview => {
      if (params.requestId) {
        if (!handedRequest) return { error: '谱面确认请求已失效，请返回歌曲详情重试' };
        if (handedRequest.game === 'phigros') return handedRequest;
        return {
          game: 'phira',
          chartId: handedRequest.chart.id,
          title: handedRequest.chart.name,
          chart: handedRequest.chart,
        };
      }
      return mapParams(params.game, params.songId, params.levelIndex, params.chartId, params.title);
    },
    // useLocalSearchParams 每次渲染都返回新对象，必须依赖字符串字段而不是 params 本身。
    [params.requestId, handedRequest, params.game, params.songId, params.levelIndex, params.chartId, params.title],
  );
  const phiraChartId = !('error' in mapped) && mapped.game === 'phira' && !mapped.chart ? mapped.chartId : null;
  const phiraChart = usePhiraChart(phiraChartId);

  const [source, setSource] = useState<PhigrosChartPreviewWebViewSource | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if ('error' in mapped) {
      setSource(null);
      return () => {
        cancelled = true;
      };
    }
    if (mapped.game === 'phira' && !mapped.chart && phiraChart.data === undefined && !phiraChart.isError) {
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

    void (async () => {
      controller = new AbortController();
      timeout = setTimeout(
        () => controller?.abort(),
        mapped.game === 'phigros' ? PHIGROS_PREPARE_TIMEOUT_MS : PHIRA_PREPARE_TIMEOUT_MS,
      );
      try {
        const settings = await loadSettings();
        const preparedConfig = mapped.game === 'phigros'
          ? await buildPhigrosChartPreviewInput(mapped, settings, controller.signal)
          : await buildPhiraChartPreviewInput(mapped, settings, controller.signal, {
              stageMusic: stagePhiraChartMusic,
              stageRpeBundle: stagePhiraRpeBundle,
            });
        if (cancelled) return;
        const prepared = await preparePhigrosChartPreviewWebViewSource(
          preparedConfig.config,
          preparedConfig.musicDataBase64 ?? null,
        );
        if (!cancelled) setSource(prepared);
      } catch (error) {
        if (!cancelled) {
          setStageError(controller?.signal.aborted
            ? '准备谱面确认资源超时，请返回重试'
            : error instanceof Error ? error.message : '无法准备谱面确认资源');
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
    };
  }, [mapped, phiraChart.data, phiraChart.isError]);

  useEffect(() => {
    if (!isFullscreen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      webRef.current?.injectJavaScript(chartPreviewExitFullscreenScript());
      return true;
    });
    return () => subscription.remove();
  }, [isFullscreen]);

  // 配置已由 prepare 写入 HTML（file:// 下比注入脚本更可靠），
  // 谱面文本可能较大，不经注入脚本重复传递。
  const injected = 'true;';

  const blockingError = ('error' in mapped ? mapped.error : null)
    ?? (phiraChartId !== null && phiraChart.isError
      ? (phiraChart.error instanceof Error ? phiraChart.error.message : '无法读取 Phira 谱面信息')
      : null)
    ?? stageError
    ?? playerError;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Stack.Screen options={chartPreviewNativeScreenOptions(isFullscreen, Platform.OS)} />
      {blockingError ? (
        <View style={styles.center} accessibilityLabel={`谱面确认错误：${blockingError}`}>
          <Text style={[styles.error, { color: theme.text }]}>{blockingError}</Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>可返回歌曲详情重试。</Text>
        </View>
      ) : !source ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.hint, { color: theme.textMuted }]}>正在准备播放器…</Text>
        </View>
      ) : (
        <View style={styles.webviewWrap}>
          {!ready ? (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : null}
          <WebView
            ref={webRef}
            testID="phigros-chart-preview-webview"
            accessibilityLabel="Phigros/Phira 谱面确认播放器"
            allowFileAccess={phigrosChartPreviewAllowsFileAccess()}
            allowFileAccessFromFileURLs
            allowingReadAccessToURL={source.allowingReadAccessToURL}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            mixedContentMode="always"
            setSupportMultipleWindows={false}
            source={{ uri: source.uri }}
            injectedJavaScriptBeforeContentLoaded={injected}
            style={styles.webview}
            onMessage={(event) => {
              const data = parseChartPreviewBridgeMessage(event.nativeEvent.data);
              if (!data) return;
              if (data.type === 'ready') setReady(true);
              if (data.type === 'fullscreen' && typeof data.active === 'boolean') {
                setIsFullscreen(data.active);
              }
              if (data.type === 'error') {
                setIsFullscreen(false);
                setPlayerError(data.message ?? '谱面播放失败');
              }
              if (data.type === 'settings') {
                const { type: _type, message: _message, active: _active, ...settings } = data;
                void saveSettings(settings);
              }
            }}
            onError={() => {
              setIsFullscreen(false);
              setPlayerError('WebView 加载失败');
            }}
            onHttpError={() => {
              setIsFullscreen(false);
              setPlayerError('WebView 资源加载失败');
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
  webview: { flex: 1, backgroundColor: '#0b0d12' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,13,18,0.72)',
  },
});
