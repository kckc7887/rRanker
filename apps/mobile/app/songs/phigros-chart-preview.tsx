import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  type PhigrosChartPreviewSettings,
} from '@/features/phigros-chart-preview/phigros-chart-preview-inject';
import { buildPhigrosChartPreviewInput } from '@/features/phigros-chart-preview/chart-preview-input';
import { buildPhiraChartPreviewInput } from '@/features/phira-chart-preview/chart-preview-input';
import {
  phigrosChartPreviewAllowsFileAccess,
  preparePhigrosChartPreviewWebViewSource,
  stagePhiraChartMusic,
  stagePhiraRpeBundle,
  createPhigrosPreviewResourceRead,
  downloadPhiraChartPreviewZip,
} from '@/features/phigros-chart-preview/prepare-phigros-chart-preview-webview';
import type { PhiraChart } from '@/domain/phira';
import { resolveChartPreviewNavigation } from '@/features/chart-preview-shared/chart-preview-navigation';
import { ChartPreviewScreenShell } from '@/features/chart-preview-shared/chart-preview-screen-shell';
import {
  CHART_PREVIEW_PLAYER_LABEL,
  mapChartPreviewProgress,
  type ChartPreviewLoadProgress,
} from '@/features/chart-preview-shared/chart-preview-progress';
import {
  createChartPreviewSessionDirectory,
  disposeChartPreviewSessionDirectory,
} from '@/features/chart-preview-shared/chart-preview-assets';
import { useAppTheme } from '@/theme/app-theme';
import { usePhigrosChartVariantSelection } from '@/features/phigros-chart-preview/use-phigros-chart-variant-selection';

const PHIGROS_PREPARE_TIMEOUT_MS = 120_000;
/** 元数据、谱面包和暂存共用准备期限。 */
const PHIRA_PREPARE_TIMEOUT_MS = 120_000;

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
    [params.requestId, handedRequest, params.game, params.songId, params.levelIndex, params.chartId, params.title],
  );
  const variantSelection = usePhigrosChartVariantSelection(!('error' in mapped) && mapped.game === 'phigros' ? mapped : null);

  const request = useMemo(() => {
    if ('error' in mapped) return { kind: 'error' as const, message: mapped.error };
    if (mapped.game === 'phigros' && !variantSelection) return { kind: 'waiting' as const };
    if (variantSelection?.error) return { kind: 'error' as const, message: variantSelection.error };
    return {
      kind: 'ready' as const,
      payload: mapped,
      timeoutMs: mapped.game === 'phigros' ? PHIGROS_PREPARE_TIMEOUT_MS : PHIRA_PREPARE_TIMEOUT_MS,
      prepare: async (signal: AbortSignal, settings: unknown, onProgress?: (progress: ChartPreviewLoadProgress) => void) => {
        const directory = await createChartPreviewSessionDirectory('rranker-phigros-chart-preview');
        const resourceEnd = 0.7;
        try {
          const prepared = mapped.game === 'phigros'
            ? await buildPhigrosChartPreviewInput(
              { ...mapped, variantIndex: variantSelection?.variantIndex },
              settings as PhigrosChartPreviewSettings,
              signal,
              createPhigrosPreviewResourceRead(directory, signal, (progress) => {
                onProgress?.({
                  label: progress.label,
                  value: mapChartPreviewProgress(progress.value, 0, resourceEnd),
                });
              }),
            )
            : await buildPhiraChartPreviewInput(mapped, settings as PhigrosChartPreviewSettings, signal, {
                downloadChart: (url, downloadSignal) => downloadPhiraChartPreviewZip(
                  directory,
                  url,
                  downloadSignal,
                  (progress) => {
                    onProgress?.({
                      label: progress.label,
                      value: mapChartPreviewProgress(progress.value, 0, resourceEnd),
                    });
                  },
                ),
                stageMusic: (bytes, fileName) => stagePhiraChartMusic(bytes, fileName, directory, signal),
                stageRpeBundle: (chartId, files) => stagePhiraRpeBundle(chartId, files, directory, signal),
              });
          onProgress?.({ label: CHART_PREVIEW_PLAYER_LABEL, value: resourceEnd });
          return await preparePhigrosChartPreviewWebViewSource(
            { ...prepared.config, theme: isDark ? 'dark' : 'light' },
            prepared.musicDataBase64 ?? null,
            directory,
            signal,
            (progress) => {
              onProgress?.({
                label: progress.label,
                value: mapChartPreviewProgress(progress.value, resourceEnd, 1),
              });
            },
          );
        } catch (error) {
          await disposeChartPreviewSessionDirectory(directory);
          throw error;
        }
      },
    };
  }, [mapped, isDark, variantSelection]);

  return (
    <ChartPreviewScreenShell
      request={request}
      settingsKey="phigros-chart-preview-settings"
      testID="phigros-chart-preview-webview"
      accessibilityLabel="Phigros/Phira 谱面确认播放器"
      errorHint="可返回歌曲详情重试。"
      prepareErrorFallback="无法准备谱面确认资源"
      allowFileAccess={phigrosChartPreviewAllowsFileAccess()}
    />
  );
}
