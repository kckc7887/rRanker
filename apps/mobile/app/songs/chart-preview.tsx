import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import Storage from 'expo-sqlite/kv-store';
import type { ChartType } from '@/domain/models';
import {
  maimaiChartPreviewBuddyEngineDifficulty,
  maimaiChartPreviewChartId,
  maimaiChartPreviewEngineDifficulty,
} from '@/domain/maimai-chart-preview';
import {
  buildChartPreviewInjectedJavaScript,
  chartPreviewAllowsFileAccess,
  chartPreviewExitFullscreenScript,
  chartPreviewStopScript,
  parseChartPreviewBridgeMessage,
  prepareChartPreviewWebViewSource,
  type ChartPreviewWebViewSource,
} from '@/features/maimai-chart-preview/prepare-chart-preview-webview';
import type { ChartPreviewSettings } from '@/features/maimai-chart-preview/chart-preview-inject';
import { useAppTheme } from '@/theme/app-theme';

function parseChartType(value: string | undefined): ChartType | null {
  if (value === 'SD' || value === 'DX' || value === 'UTAGE') return value;
  return null;
}

const SETTINGS_KEY = 'maimai-chart-preview-settings';

async function loadSettings(): Promise<ChartPreviewSettings> {
  try {
    const raw = await Storage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ChartPreviewSettings;
  } catch {
    return {};
  }
}

async function saveSettings(partial: ChartPreviewSettings): Promise<void> {
  try {
    const raw = await Storage.getItem(SETTINGS_KEY);
    const current: ChartPreviewSettings = raw ? JSON.parse(raw) : {};
    const merged = { ...current, ...partial };
    await Storage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
}

export default function MaimaiChartPreviewScreen() {
  const theme = useAppTheme();
  const webRef = useRef<WebView>(null);
  const params = useLocalSearchParams<{
    songId?: string;
    chartType?: string;
    levelIndex?: string;
    buddySide?: string;
    title?: string;
  }>();

  const mapped = useMemo(() => {
    const songId = params.songId?.trim();
    const chartType = parseChartType(params.chartType);
    const levelIndex = params.levelIndex === undefined ? NaN : Number(params.levelIndex);
    const buddySideRaw = params.buddySide === undefined ? null : Number(params.buddySide);
    if (!songId || !chartType) return { error: '缺少歌曲或谱面类型参数' as string };
    try {
      const chartId = maimaiChartPreviewChartId(songId, chartType);
      const difficulty = buddySideRaw === 0 || buddySideRaw === 1
        ? maimaiChartPreviewBuddyEngineDifficulty(buddySideRaw)
        : maimaiChartPreviewEngineDifficulty(
          Number.isInteger(levelIndex) && levelIndex >= 0 ? levelIndex : 3,
        );
      return {
        chartId,
        difficulty,
        title: typeof params.title === 'string' ? params.title : undefined,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : '谱面参数无效' };
    }
  }, [params.buddySide, params.chartType, params.levelIndex, params.songId, params.title]);

  const [source, setSource] = useState<ChartPreviewWebViewSource | null>(null);
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

    setSource(null);
    setReady(false);
    setIsFullscreen(false);
    setPlayerError(null);
    setStageError(null);

    void (async () => {
      try {
        const settings = await loadSettings();
        const prepared = await prepareChartPreviewWebViewSource({ ...mapped, settings });
        if (!cancelled) setSource(prepared);
      } catch (error) {
        if (!cancelled) {
          setStageError(error instanceof Error ? error.message : '无法准备谱面预览资源');
        }
      }
    })();

    return () => {
      cancelled = true;
      // 卸载时停止播放；cleanup 必须读最新 webRef。
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional latest ref
      webRef.current?.injectJavaScript(chartPreviewStopScript());
    };
  }, [mapped]);

  useEffect(() => {
    if (!isFullscreen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      webRef.current?.injectJavaScript(chartPreviewExitFullscreenScript());
      return true;
    });
    return () => subscription.remove();
  }, [isFullscreen]);

  const injected = useMemo(() => {
    if ('error' in mapped) return 'true;';
    return buildChartPreviewInjectedJavaScript(mapped);
  }, [mapped]);

  const blockingError = ('error' in mapped ? mapped.error : null) ?? stageError ?? playerError;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{
        title: '谱面确认',
        headerShown: !isFullscreen,
        orientation: isFullscreen ? 'landscape' : 'portrait_up',
        statusBarHidden: isFullscreen,
        navigationBarHidden: isFullscreen,
        autoHideHomeIndicator: isFullscreen,
      }} />
      {blockingError ? (
        <View style={styles.center} accessibilityLabel={`谱面确认错误：${blockingError}`}>
          <Text style={[styles.error, { color: theme.text }]}>{blockingError}</Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>可返回歌曲详情重试，或改用搜索谱面确认。</Text>
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
            testID="maimai-chart-preview-webview"
            accessibilityLabel="舞萌谱面确认播放器"
            allowFileAccess={chartPreviewAllowsFileAccess()}
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
            onLoadEnd={() => {
              if ('error' in mapped) return;
              webRef.current?.injectJavaScript(buildChartPreviewInjectedJavaScript(mapped));
            }}
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
