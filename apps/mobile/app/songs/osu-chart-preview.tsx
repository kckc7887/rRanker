import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ChartPreviewScreenShell } from '@/features/chart-preview-shared/chart-preview-screen-shell';
import type { ChartPreviewLoadProgress } from '@/features/chart-preview-shared/chart-preview-progress';
import { parseOsuChartPreviewTarget } from '@/features/osu-chart-preview/configuration';
import { prepareOsuChartPreviewWebViewSource } from '@/features/osu-chart-preview/prepare-osu-chart-preview-webview';
import { useAppTheme } from '@/theme/app-theme';

export default function OsuChartPreviewScreen() {
  const params = useLocalSearchParams<{
    gameId?: string;
    beatmapsetId?: string;
    beatmapId?: string;
    title?: string;
  }>();
  const dark = useAppTheme().dark;
  const request = useMemo(() => {
    const target = parseOsuChartPreviewTarget({
      gameId: params.gameId,
      beatmapsetId: params.beatmapsetId,
      beatmapId: params.beatmapId,
      title: params.title,
    });
    if (!target) return { kind: 'error' as const, message: '缺少或无效的谱面参数，请返回歌曲详情重试。' };
    return {
      kind: 'ready' as const,
      payload: target,
      timeoutMs: 120_000,
      prepare: (signal: AbortSignal, settings: unknown, onProgress?: (progress: ChartPreviewLoadProgress) => void) =>
        prepareOsuChartPreviewWebViewSource(target, dark ? 'dark' : 'light', settings, signal, onProgress),
    };
  }, [params.gameId, params.beatmapsetId, params.beatmapId, params.title, dark]);
  return (
    <ChartPreviewScreenShell
      request={request}
      settingsKey="rranker.osu-chart-preview.settings.v1"
      testID="osu-chart-preview-webview"
      accessibilityLabel="osu! 谱面确认播放器"
      errorHint="请返回歌曲详情重试，并确认网络连接正常。"
      prepareErrorFallback="谱面暂时无法加载，请稍后重试。"
      allowFileAccess
    />
  );
}
