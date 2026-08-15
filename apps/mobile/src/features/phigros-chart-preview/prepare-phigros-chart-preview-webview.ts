import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';
import { prepareChartPreviewWebviewFromPlan } from '@/features/chart-preview-shared/prepare-chart-preview-webview-from-plan';
import {
  applyPhigrosChartPreviewConfigToHtml,
  type PhigrosChartPreviewConfig,
} from './phigros-chart-preview-inject';
import { chartPreviewStageDirectory } from '@/features/maimai-chart-preview/prepare-chart-preview-webview';

const HTML_MODULE = require('../../../assets/phigros-chart-preview/index.html') as number;
const PLAYER_MODULE = require('../../../assets/phigros-chart-preview/player.bundle') as number;

const SKIN_ASSETS: readonly { fileName: string; moduleId: number }[] = [
  { fileName: 'Tap2.png', moduleId: require('../../../assets/phigros-chart-preview/skin/Tap2.png') },
  { fileName: 'Tap2HL.png', moduleId: require('../../../assets/phigros-chart-preview/skin/Tap2HL.png') },
  { fileName: 'Drag.png', moduleId: require('../../../assets/phigros-chart-preview/skin/Drag.png') },
  { fileName: 'DragHL.png', moduleId: require('../../../assets/phigros-chart-preview/skin/DragHL.png') },
  { fileName: 'Flick2.png', moduleId: require('../../../assets/phigros-chart-preview/skin/Flick2.png') },
  { fileName: 'Flick2HL.png', moduleId: require('../../../assets/phigros-chart-preview/skin/Flick2HL.png') },
  { fileName: 'Hold2.png', moduleId: require('../../../assets/phigros-chart-preview/skin/Hold2.png') },
  { fileName: 'Hold2HL.png', moduleId: require('../../../assets/phigros-chart-preview/skin/Hold2HL.png') },
  { fileName: 'hit.png', moduleId: require('../../../assets/phigros-chart-preview/skin/hit.png') },
];

const HIT_SOUND_ASSETS: readonly { kind: 'click' | 'drag' | 'flick'; fileName: string; moduleId: number }[] = [
  { kind: 'click', fileName: 'click.wav', moduleId: require('../../../assets/phigros-chart-preview/hit-sounds/click.wav') },
  { kind: 'drag', fileName: 'drag.wav', moduleId: require('../../../assets/phigros-chart-preview/hit-sounds/drag.wav') },
  { kind: 'flick', fileName: 'flick.wav', moduleId: require('../../../assets/phigros-chart-preview/hit-sounds/flick.wav') },
];

export type PhigrosChartPreviewWebViewSource = {
  uri: string;
  allowingReadAccessToURL: string;
};

const STAGE_DIRECTORY_NAME = 'rranker-phigros-chart-preview';

/**
 * 将 HTML / player.js / 内置皮肤落到缓存目录，打击音以 data URL 注入配置，
 * 本地音乐以 base64 写入 music-data.js（iOS file:// 下无法 fetch 本地文件）。
 * file:// WebView 上比依赖 injectedJavaScriptBeforeContentLoaded 更稳。
 */
export async function preparePhigrosChartPreviewWebViewSource(
  config: PhigrosChartPreviewConfig,
  musicDataBase64: string | null = null,
): Promise<PhigrosChartPreviewWebViewSource> {
  return prepareChartPreviewWebviewFromPlan({
    directoryName: STAGE_DIRECTORY_NAME,
    stagedAssets: [
      { fileName: 'player.js', moduleId: PLAYER_MODULE },
      ...SKIN_ASSETS.map(({ fileName, moduleId }) => ({ fileName: `skin/${fileName}`, moduleId })),
    ],
    dataUrlAssets: HIT_SOUND_ASSETS.map(({ kind, fileName, moduleId }) => ({
      key: kind,
      moduleId,
      fileName,
    })),
    writers: [
      async (directory) => {
        const musicDataFile = new File(directory, 'music-data.js');
        musicDataFile.create({ overwrite: true });
        musicDataFile.write(`window.__PHIGROS_MUSIC_DATA__=${musicDataBase64 ? JSON.stringify(musicDataBase64) : 'null'};`);
      },
    ],
    htmlModuleId: HTML_MODULE,
    buildHtml: (template, dataUrls) => applyPhigrosChartPreviewConfigToHtml(template, {
      ...config,
      hitSounds: dataUrls,
    }),
  });
}

/** Phira 谱面音乐落盘到预览 stage 目录，并返回其 base64 供 WebView 解码。 */
export async function stagePhiraChartMusic(bytes: Uint8Array, fileName: string): Promise<{ uri: string; base64: string }> {
  const directory = chartPreviewStageDirectory(STAGE_DIRECTORY_NAME);
  const file = new File(directory, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  return { uri: file.uri, base64: await file.base64() };
}

/**
 * Phira RPE 谱面包资源落盘：全部非文本条目写入 stage 目录 rpe/{chartId}/，
 * 返回相对播放器 HTML 的 basePath（皮肤同机制：file:// WebView 经相对路径加载子资源）。
 * 文本资源（extra.json/info.yml/.glsl）由调用方读文本注入，不经文件 fetch。
 */
export async function stagePhiraRpeBundle(
  chartId: number,
  files: readonly { name: string; bytes: Uint8Array }[],
): Promise<{ basePath: string }> {
  const root = chartPreviewStageDirectory(STAGE_DIRECTORY_NAME);
  const directory = new Directory(root, `rpe/${chartId}`);
  directory.create({ intermediates: true, idempotent: true });
  for (const file of files) {
    const target = new File(directory, file.name);
    if (target.exists) target.delete();
    target.create();
    target.write(file.bytes);
  }
  return { basePath: `./rpe/${chartId}/` };
}

export function phigrosChartPreviewAllowsFileAccess(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}
