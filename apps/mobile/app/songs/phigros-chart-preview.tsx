import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
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
} from '@/features/phigros-chart-preview/prepare-phigros-chart-preview-webview';
import { usePhiraChart } from '@/hooks/use-phira';
import type { PhiraChart } from '@/domain/phira';
import { resolveChartPreviewNavigation } from '@/features/phigros-chart-preview/chart-preview-navigation';
import { ChartPreviewScreenShell } from '@/features/chart-preview-shared/chart-preview-screen-shell';
import {
  createChartPreviewSessionDirectory,
  disposeChartPreviewSessionDirectory,
} from '@/features/chart-preview-shared/chart-preview-assets';
import { useAppTheme } from '@/theme/app-theme';

/** Phigros 资源较小，使用较短等待时间。 */
const PHIGROS_PREPARE_TIMEOUT_MS = 20_000;
/** Phira 谱面包较大，使用较长等待时间。 */
const PHIRA_PREPARE_TIMEOUT_MS = 60_000;

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
  const isDark = useAppTheme().dark;
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
    // 字段级依赖避免路由对象引用变化触发重复准备。
    [params.requestId, handedRequest, params.game, params.songId, params.levelIndex, params.chartId, params.title],
  );
  const phiraChartId = !('error' in mapped) && mapped.game === 'phira' && !mapped.chart ? mapped.chartId : null;
  const phiraChart = usePhiraChart(phiraChartId);

  const request = useMemo(() => {
    if ('error' in mapped) return { kind: 'error' as const, message: mapped.error };
    if (mapped.game === 'phira' && !mapped.chart && phiraChart.data === undefined && !phiraChart.isError) {
      return { kind: 'waiting' as const };
    }
    return {
      kind: 'ready' as const,
      payload: mapped,
      timeoutMs: mapped.game === 'phigros' ? PHIGROS_PREPARE_TIMEOUT_MS : PHIRA_PREPARE_TIMEOUT_MS,
      prepare: async (signal: AbortSignal, settings: unknown) => {
        const directory = createChartPreviewSessionDirectory('rranker-phigros-chart-preview');
        try {
          const prepared = mapped.game === 'phigros'
            ? await buildPhigrosChartPreviewInput(mapped, settings as PhigrosChartPreviewSettings, signal)
            : await buildPhiraChartPreviewInput(mapped, settings as PhigrosChartPreviewSettings, signal, {
                stageMusic: (bytes, fileName) => stagePhiraChartMusic(bytes, fileName, directory),
                stageRpeBundle: (chartId, files) => stagePhiraRpeBundle(chartId, files, directory),
              });
          return await preparePhigrosChartPreviewWebViewSource(
            { ...prepared.config, theme: isDark ? 'dark' : 'light' },
            prepared.musicDataBase64 ?? null,
            directory,
            signal,
          );
        } catch (error) {
          disposeChartPreviewSessionDirectory(directory);
          throw error;
        }
      },
    };
  }, [mapped, phiraChart.data, phiraChart.isError, isDark]);

  const externalError = phiraChartId !== null && phiraChart.isError
    ? '无法读取 Phira 谱面，请重试。'
    : null;

  return (
    <ChartPreviewScreenShell
      request={request}
      settingsKey="phigros-chart-preview-settings"
      testID="phigros-chart-preview-webview"
      accessibilityLabel="Phigros/Phira 谱面确认播放器"
      errorHint="可返回歌曲详情重试。"
      prepareErrorFallback="无法准备谱面确认资源"
      externalError={externalError}
      allowFileAccess={phigrosChartPreviewAllowsFileAccess()}
    />
  );
}
