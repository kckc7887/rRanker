import { majdataAsset } from '@/domain/majdata';
import { loadMajdataSong, loadMajdataParsedChart } from '@/services/majdata-service';
import { useCallback, useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { ChartType } from '@/domain/models';
import {
  maimaiChartPreviewBuddyEngineDifficulty,
  maimaiChartPreviewChartId,
  maimaiChartPreviewEngineDifficulty,
  maimaiChartPreviewVideoUrl,
  maimaiChartPreviewSimaiUrl,
  maimaiChartPreviewMusicUrl,
} from '@/domain/maimai-chart-preview';
import { maimaiJacketUrl } from '@/domain/maimai-assets';
import {
  buildChartPreviewInjectedJavaScript,
  chartPreviewAllowsFileAccess,
  prepareChartPreviewWebViewSource,
} from '@/features/simai-chart-preview/prepare-chart-preview-webview';
import type { BuddyPreviewSide, ChartPreviewSettings } from '@/features/simai-chart-preview/chart-preview-inject';
import { ChartPreviewScreenShell } from '@/features/chart-preview-shared/chart-preview-screen-shell';
import type { ChartPreviewBridgeMessage } from '@/features/chart-preview-shared/chart-preview-bridge';
import { useNotification } from '@/components/AppNotification';
import { useAppTheme } from '@/theme/app-theme';

function parseChartType(value: string | undefined): ChartType | null {
  if (value === 'SD' || value === 'DX' || value === 'UTAGE') return value;
  return null;
}

type MappedPreview =
  | { error: string }
  | {
      chartId: number | string;
      hash?: string;
      chartUrl: string;
      musicUrl: string;
      difficulty: number;
      buddySide: BuddyPreviewSide | undefined;
      title: string | undefined;
      backgroundImageUrl: string;
      backgroundVideoUrl: string;
    };

export default function MaimaiChartPreviewScreen() {
  const theme = useAppTheme();
  const { showActionNotification } = useNotification();
  const isDark = theme.dark;
  const params = useLocalSearchParams<{
    songId?: string;
    gameId?: string;
    hash?: string;
    chartType?: string;
    levelIndex?: string;
    buddySide?: string;
    title?: string;
  }>();

  const mapped = useMemo(
    (): MappedPreview => {
      const songId = params.songId?.trim();
      const chartType = parseChartType(params.chartType);
      const levelIndex = params.levelIndex === undefined ? NaN : Number(params.levelIndex);
      const buddySide: BuddyPreviewSide | undefined =
        params.buddySide === '0' || params.buddySide === '1' || params.buddySide === 'dual'
          ? params.buddySide
          : undefined;
      if (params.gameId === 'majdata-net') {
        if (!songId || !Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex > 6) return { error: '所选难度不存在' };
        return { chartId: songId, hash: params.hash, difficulty: levelIndex + 1, chartUrl: majdataAsset(songId, 'chart'), musicUrl: majdataAsset(songId, 'track'), title: params.title, buddySide: undefined, backgroundImageUrl: majdataAsset(songId, 'image', true), backgroundVideoUrl: majdataAsset(songId, 'video') };
      }
      if (!songId || !chartType) return { error: '缺少歌曲或谱面类型参数' as string };
      try {
        const chartId = maimaiChartPreviewChartId(songId, chartType);
        const difficulty =
          buddySide === 'dual'
            ? maimaiChartPreviewEngineDifficulty(3)
            : buddySide === '0' || buddySide === '1'
              ? maimaiChartPreviewBuddyEngineDifficulty(buddySide === '0' ? 0 : 1)
              : maimaiChartPreviewEngineDifficulty(
                Number.isInteger(levelIndex) && levelIndex >= 0 ? levelIndex : 3,
              );
        return {
          chartId,
          chartUrl: maimaiChartPreviewSimaiUrl(chartId),
          musicUrl: maimaiChartPreviewMusicUrl(chartId),
          difficulty,
          buddySide,
          title: typeof params.title === 'string' ? params.title : undefined,
          backgroundImageUrl: maimaiJacketUrl(songId),
          backgroundVideoUrl: maimaiChartPreviewVideoUrl(chartId),
        };
      } catch {
        return { error: '无法打开该谱面，请返回歌曲详情重试。' };
      }
    },
    [params.hash, params.gameId, params.buddySide, params.chartType, params.levelIndex, params.songId, params.title],
  );

  const request = useMemo(
    () => ('error' in mapped
      ? { kind: 'error' as const, message: mapped.error }
      : {
          kind: 'ready' as const,
          payload: mapped,
          prepare: async (signal: AbortSignal, settings: unknown) => {
            const song = typeof mapped.chartId === 'string' ? await loadMajdataSong(mapped.chartId, signal) : undefined;
            if (mapped.hash && song?.hash !== mapped.hash) throw new Error('谱面已更新，请返回歌曲详情重试');
            const parsed = song ? await loadMajdataParsedChart(song, mapped.difficulty - 1, signal) : undefined;
            if (signal.aborted) throw signal.reason;
            return prepareChartPreviewWebViewSource({
              parsedChart: parsed?.chart,
              ...mapped,
              settings: settings as ChartPreviewSettings,
              theme: isDark ? 'dark' : 'light',
            });
          },
        }),
    [mapped, isDark],
  );

  const handleBridgeMessage = useCallback((
    message: ChartPreviewBridgeMessage,
    bridge: { postMessage: (message: Record<string, unknown>) => void },
  ) => {
    if (message.type !== 'background-video-confirmation') return;
    showActionNotification({
      title: '启用视频背景？',
      message: '视频背景会使用网络流量。',
      variant: 'warning',
      actions: [
        {
          label: '暂不启用',
          tone: 'cancel',
          onPress: () => bridge.postMessage({
            type: 'background-video-confirmation-result',
            accepted: false,
          }),
        },
        {
          label: '启用',
          onPress: () => bridge.postMessage({
            type: 'background-video-confirmation-result',
            accepted: true,
          }),
        },
      ],
    });
  }, [showActionNotification]);

  return (
    <ChartPreviewScreenShell
      request={request}
      settingsKey="maimai-chart-preview-settings"
      testID="maimai-chart-preview-webview"
      accessibilityLabel="谱面确认播放器"
      errorHint="可返回歌曲详情重试，或改用搜索谱面确认。"
      prepareErrorFallback="无法准备谱面预览资源"
      allowFileAccess={chartPreviewAllowsFileAccess()}
      buildInjectedJavaScript={(m) => buildChartPreviewInjectedJavaScript(m)}
      blockOnHttpError={false}
      reInjectOnLoadEnd
      onBridgeMessage={handleBridgeMessage}
    />
  );
}
