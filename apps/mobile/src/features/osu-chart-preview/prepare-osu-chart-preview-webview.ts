import { Directory, File } from 'expo-file-system';
import { throwIfChartDownloadCancelled } from '@/features/chart-download-shared/chart-download-shared';
import { downloadOsuBeatmapsetArchive } from '@/features/osu-beatmapset-download/osu-beatmapset-download';
import {
  createChartPreviewSessionDirectory,
  disposeChartPreviewSessionDirectory,
} from '@/features/chart-preview-shared/chart-preview-assets';
import { prepareChartPreviewWebviewFromPlan } from '@/features/chart-preview-shared/prepare-chart-preview-webview-from-plan';
import {
  CHART_PREVIEW_PLAYER_LABEL,
  CHART_PREVIEW_RESOURCE_LABEL,
  chartPreviewDownloadFraction,
  mapChartPreviewProgress,
  type ChartPreviewLoadProgress,
} from '@/features/chart-preview-shared/chart-preview-progress';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { OSU_MODE_INT_BY_GAME_ID } from '@/domain/osu';
import { readOsuChartPreviewArchive, type OsuChartPreviewResources } from './chart-preview-resources';
import {
  normalizeOsuChartPreviewSettings,
  type OsuChartPreviewConfig,
  type OsuChartPreviewTarget,
} from './configuration';
import { applyOsuChartPreviewConfigToHtml, buildOsuChartPreviewAudioScript } from './osu-chart-preview-inject';

const DIRECTORY_NAME = 'rranker-osu-chart-preview';

export async function prepareOsuChartPreviewWebViewSource(
  target: OsuChartPreviewTarget,
  theme: 'light' | 'dark',
  settings: unknown,
  signal: AbortSignal,
  onProgress?: (progress: ChartPreviewLoadProgress) => void,
) {
  const assertCurrent = captureResourceWrites('shared', signal);
  assertCurrent();
  const directory = createChartPreviewSessionDirectory(DIRECTORY_NAME);
  try {
    let resources: OsuChartPreviewResources | undefined;
    let candidateSequence = 0;
    const archive = await downloadOsuBeatmapsetArchive(directory, { beatmapsetId: target.beatmapsetId, includeVideo: true }, {
      signal,
      onProgress: ({ totalBytesWritten, totalBytesExpectedToWrite }) => onProgress?.({
        label: CHART_PREVIEW_RESOURCE_LABEL,
        value: chartPreviewDownloadFraction(totalBytesWritten, totalBytesExpectedToWrite) * 0.7,
      }),
      validate: async (file, attemptSignal) => {
        const assertAttempt = () => { assertCurrent(); throwIfChartDownloadCancelled(attemptSignal); };
        const candidateDirectory = new Directory(directory, `candidate-${++candidateSequence}`);
        try {
          assertAttempt();
          candidateDirectory.create({ intermediates: true, idempotent: true });
          const bytes = await file.bytes();
          let mediaIndex = 0;
          const candidateResources = await readOsuChartPreviewArchive(bytes, target, {
            assertCurrent: assertAttempt,
            onProgress: (value) => onProgress?.({
              label: CHART_PREVIEW_PLAYER_LABEL, value: mapChartPreviewProgress(value, 0.7, 0.9),
            }),
            stageMedia: async (path, content) => {
              assertAttempt();
              const media = new Directory(candidateDirectory, 'media');
              media.create({ intermediates: true, idempotent: true });
              const extension = path.match(/\.([a-z0-9]+)$/iu)?.[1]?.toLowerCase() ?? 'bin';
              const staged = new File(media, `${mediaIndex++}.${extension}`);
              staged.create({ overwrite: true });
              staged.write(content);
              return staged.uri;
            },
          });
          assertAttempt();
          resources = candidateResources;
        } catch (error) {
          disposeChartPreviewSessionDirectory(candidateDirectory);
          throw error;
        }
      },
    });
    assertCurrent();
    if (!resources) throw new Error('谱面包中没有所选难度');
    const preparedResources = resources;
    archive.delete();
    const config: OsuChartPreviewConfig = {
      theme,
      title: target.title,
      requestedMode: OSU_MODE_INT_BY_GAME_ID[target.gameId] as 0 | 1 | 2 | 3,
      chartPath: preparedResources.chartPath,
      files: preparedResources.files,
      settings: normalizeOsuChartPreviewSettings(settings),
    };
    const prepared = await prepareChartPreviewWebviewFromPlan({
      directoryName: DIRECTORY_NAME,
      directory,
      stagedAssets: [
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        { fileName: 'player.js', moduleId: require('../../../assets/osu-chart-preview/player.bundle') as number },
      ],
      htmlModuleId: require('../../../assets/osu-chart-preview/index.html') as number,
      writers: [async (session) => {
        assertCurrent();
        const file = new File(session, 'audio-data.js');
        file.create({ overwrite: true });
        file.write(buildOsuChartPreviewAudioScript(preparedResources.audio));
      }],
      buildHtml: (template) => {
        assertCurrent();
        return applyOsuChartPreviewConfigToHtml(template, config);
      },
    }, signal, (progress) => onProgress?.({
      label: progress.label, value: mapChartPreviewProgress(progress.value, 0.9, 1),
    }));
    assertCurrent();
    return prepared;
  } catch (error) {
    disposeChartPreviewSessionDirectory(directory);
    throw error;
  }
}
