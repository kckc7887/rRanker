import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ChartPreviewScreenShell } from '@/features/chart-preview-shared/chart-preview-screen-shell';
import type { ChartPreviewLoadProgress } from '@/features/chart-preview-shared/chart-preview-progress';
import { parseRizlineChartPreviewTarget } from '@/features/rizline-chart-preview/configuration';
import {
  prepareRizlineChartPreviewWebViewSource,
  rizlineChartPreviewAllowsFileAccess,
} from '@/features/rizline-chart-preview/prepare-rizline-chart-preview-webview';
import { useAppTheme } from '@/theme/app-theme';

const RIZLINE_PREPARE_TIMEOUT_MS = 120_000;

export default function RizlineChartPreviewScreen() {
  const params = useLocalSearchParams<{
    songId?: string;
    levelIndex?: string;
    title?: string;
  }>();
  const dark = useAppTheme().dark;
  const request = useMemo(() => {
    const target = parseRizlineChartPreviewTarget({
      songId: params.songId,
      levelIndex: params.levelIndex,
      title: params.title,
    });
    if (!target) return { kind: 'error' as const, message: '缺少或无效的谱面参数，请返回歌曲详情重试。' };
    return {
      kind: 'ready' as const,
      payload: target,
      timeoutMs: RIZLINE_PREPARE_TIMEOUT_MS,
      prepare: (signal: AbortSignal, settings: unknown, onProgress?: (progress: ChartPreviewLoadProgress) => void) =>
        prepareRizlineChartPreviewWebViewSource(target, dark ? 'dark' : 'light', settings, signal, onProgress),
    };
  }, [params.songId, params.levelIndex, params.title, dark]);
  return (
    <ChartPreviewScreenShell
      request={request}
      settingsKey="rranker.rizline-chart-preview.settings.v1"
      testID="rizline-chart-preview-webview"
      accessibilityLabel="Rizline 谱面确认播放器"
      errorHint="可返回歌曲详情重试。"
      prepareErrorFallback="谱面暂时无法加载，请稍后重试。"
      allowFileAccess={rizlineChartPreviewAllowsFileAccess()}
      fullscreenOrientation="portrait_up"
    />
  );
}
