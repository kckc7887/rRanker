import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import Storage from 'expo-sqlite/kv-store';
import JSZip from 'jszip';
import {
  type PhigrosChartPreviewConfig,
  type PhigrosChartPreviewSettings,
} from '@/features/phigros-chart-preview/phigros-chart-preview-inject';
import {
  phigrosChartPreviewAllowsFileAccess,
  preparePhigrosChartPreviewWebViewSource,
  stagePhiraChartMusic,
  type PhigrosChartPreviewWebViewSource,
} from '@/features/phigros-chart-preview/prepare-phigros-chart-preview-webview';
import {
  chartPreviewExitFullscreenScript,
  chartPreviewStopScript,
  parseChartPreviewBridgeMessage,
} from '@/features/maimai-chart-preview/chart-preview-inject';
import { chartPreviewNativeScreenOptions } from '@/features/maimai-chart-preview/chart-preview-native-screen';
import {
  loadPhigrosChartPreviewBundle,
  phigrosChartPreviewLevelLabel,
} from '@/domain/phigros-chart-preview';
import {
  classifyPhiraChartFormat,
  PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE,
  resolvePhiraChartZipMediaPlan,
} from '@/domain/phira-chart-preview';
import { infoValue, throwIfAborted } from '@/services/phira-chart-notes';
import { usePhiraChart } from '@/hooks/use-phira';
import { phiraProvider } from '@/providers/phira-provider';
import { useAppTheme } from '@/theme/app-theme';

const SETTINGS_KEY = 'phigros-chart-preview-settings';
/** 谱面文本经 HTML 配置注入的上限，避免超大谱面拖垮 WebView。 */
const CHART_TEXT_LIMIT = 6_000_000;

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
  | { game: 'phira'; chartId: number; title?: string };

function mapParams(params: {
  game?: string;
  songId?: string;
  levelIndex?: string;
  chartId?: string;
  title?: string;
}): MappedPreview {
  const title = typeof params.title === 'string' && params.title.trim() !== '' ? params.title.trim() : undefined;
  if (params.game === 'phigros') {
    const songId = params.songId?.trim();
    const levelIndex = params.levelIndex === undefined ? NaN : Number(params.levelIndex);
    if (!songId) return { error: '缺少歌曲参数' };
    if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex > 3) return { error: '缺少或无效的难度参数' };
    return { game: 'phigros', songId, levelIndex, title };
  }
  if (params.game === 'phira') {
    const chartId = Number(params.chartId);
    if (!Number.isInteger(chartId) || chartId <= 0) return { error: '缺少或无效的谱面 ID' };
    return { game: 'phira', chartId, title };
  }
  return { error: '缺少游戏参数' };
}

async function buildPhigrosConfig(
  mapped: Extract<MappedPreview, { game: 'phigros' }>,
  settings: PhigrosChartPreviewSettings,
  signal: AbortSignal,
): Promise<PhigrosChartPreviewConfig> {
  const bundle = await loadPhigrosChartPreviewBundle({
    songId: mapped.songId,
    difficulty: phigrosChartPreviewLevelLabel(mapped.levelIndex),
  }, signal);
  return {
    game: 'phigros',
    title: mapped.title ?? `${bundle.song.title} ${bundle.target.difficulty}`,
    chartUrl: bundle.chart.url,
    musicUrl: bundle.music.url,
    illustrationUrl: bundle.illustration.url,
    settings,
  };
}

function zipBasename(entryName: string, fallback: string): string {
  const segments = entryName.split('/').filter((segment) => segment.length > 0);
  const name = segments[segments.length - 1];
  return name && name.length > 0 ? name : fallback;
}

async function buildPhiraConfig(
  mapped: Extract<MappedPreview, { game: 'phira' }>,
  settings: PhigrosChartPreviewSettings,
  signal: AbortSignal,
): Promise<PhigrosChartPreviewConfig> {
  const chart = await phiraProvider.getChart(mapped.chartId, signal);
  if (!chart.file) throw new Error('该谱面未提供可下载文件');
  const zipData = await phiraProvider.downloadChart(chart.file, signal);
  const zip = await JSZip.loadAsync(zipData);
  throwIfAborted(signal);
  const entries = Object.values(zip.files).map((entry) => ({ name: entry.name, dir: entry.dir }));
  const infoEntry = entries.find((entry) => !entry.dir && /(^|\/)info\.ya?ml$/i.test(entry.name));
  const infoText = infoEntry ? await zip.file(infoEntry.name)!.async('text') : '';
  throwIfAborted(signal);

  const plan = resolvePhiraChartZipMediaPlan(entries, infoText || null);
  if (!plan.chartEntryName) throw new Error('谱面包中没有可读取的谱面文件');
  const chartEntry = zip.file(plan.chartEntryName)!;
  const chartBytes = await chartEntry.async('uint8array', () => throwIfAborted(signal));
  throwIfAborted(signal);
  const formatHint = infoText ? infoValue(infoText, 'format') : null;
  if (formatHint?.toLowerCase() === 'pbc' || /\.pbc$/i.test(plan.chartEntryName)) {
    throw new Error(PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE);
  }
  const chartText = new TextDecoder('utf-8', { fatal: true }).decode(chartBytes);
  const format = classifyPhiraChartFormat(plan.chartEntryName, formatHint, chartText);
  if (format !== 'pgr') throw new Error(PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE);
  if (chartText.length > CHART_TEXT_LIMIT) throw new Error('谱面过大，暂不支持预览');

  if (!plan.musicEntryName) throw new Error('谱面包缺少音乐文件');
  const musicBytes = await zip.file(plan.musicEntryName)!.async('uint8array', () => throwIfAborted(signal));
  throwIfAborted(signal);
  const musicUrl = await stagePhiraChartMusic(musicBytes, zipBasename(plan.musicEntryName, 'music.bin'));

  let illustrationUrl = typeof chart.illustration === 'string' && chart.illustration.trim() !== ''
    ? chart.illustration
    : undefined;
  if (!illustrationUrl && plan.illustrationEntryName) {
    const imageBytes = await zip.file(plan.illustrationEntryName)!.async('uint8array', () => throwIfAborted(signal));
    throwIfAborted(signal);
    illustrationUrl = await stagePhiraChartMusic(imageBytes, zipBasename(plan.illustrationEntryName, 'illustration.png'));
  }

  return {
    game: 'phira',
    title: mapped.title ?? chart.name,
    chartText,
    musicUrl,
    illustrationUrl,
    settings,
  };
}

export default function PhigrosChartPreviewScreen() {
  const theme = useAppTheme();
  const webRef = useRef<WebView>(null);
  const params = useLocalSearchParams<{
    game?: string;
    songId?: string;
    levelIndex?: string;
    chartId?: string;
    title?: string;
  }>();

  const mapped = useMemo(() => mapParams(params), [params]);
  const phiraChartId = !('error' in mapped) && mapped.game === 'phira' ? mapped.chartId : null;
  const phiraChart = usePhiraChart(phiraChartId);

  const [source, setSource] = useState<PhigrosChartPreviewWebViewSource | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if ('error' in mapped) {
      setSource(null);
      return () => {
        cancelled = true;
      };
    }
    if (mapped.game === 'phira' && phiraChart.data === undefined && !phiraChart.isError) {
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
      try {
        const settings = await loadSettings();
        const controller = new AbortController();
        const config = mapped.game === 'phigros'
          ? await buildPhigrosConfig(mapped, settings, controller.signal)
          : await buildPhiraConfig(mapped, settings, controller.signal);
        if (cancelled) return;
        const prepared = await preparePhigrosChartPreviewWebViewSource(config);
        if (!cancelled) setSource(prepared);
      } catch (error) {
        if (!cancelled) {
          setStageError(error instanceof Error ? error.message : '无法准备谱面确认资源');
        }
      }
    })();

    return () => {
      cancelled = true;
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
