import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';
import { prepareChartPreviewWebviewFromPlan } from '@/features/chart-preview-shared/prepare-chart-preview-webview-from-plan';
import {
  applyPhigrosChartPreviewConfigToHtml,
  type PhigrosChartPreviewConfig,
} from './phigros-chart-preview-inject';
import { chartPreviewStageDirectory } from '@/features/chart-preview-shared/chart-preview-assets';

// Metro 静态资源模块编号只能在运行时 require 取得（模块级常量），
// 改写为 import 需补齐 .html/.bundle 的模块声明且无行为收益。
 
const HTML_MODULE = require('../../../assets/phigros-chart-preview/index.html') as number;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PLAYER_MODULE = require('../../../assets/phigros-chart-preview/player.bundle') as number;

/** 内置皮肤与命中音源：对象存储 rranker-phigros-data/chart-preview（与本地 assets/phigros-chart-preview 同名同路径）。 */
const PHIGROS_CHART_PREVIEW_ASSET_BASE = 'https://rranker-phigros-data.cn-nb1.rains3.com/chart-preview';

const SKIN_ASSETS: readonly { fileName: string; url: string; bytes: number }[] = [
  { fileName: 'Tap2.png', url: `${PHIGROS_CHART_PREVIEW_ASSET_BASE}/skin/Tap2.png`, bytes: 4_062 },
  { fileName: 'Tap2HL.png', url: `${PHIGROS_CHART_PREVIEW_ASSET_BASE}/skin/Tap2HL.png`, bytes: 18_905 },
  { fileName: 'Drag.png', url: `${PHIGROS_CHART_PREVIEW_ASSET_BASE}/skin/Drag.png`, bytes: 2_481 },
  { fileName: 'DragHL.png', url: `${PHIGROS_CHART_PREVIEW_ASSET_BASE}/skin/DragHL.png`, bytes: 16_064 },
  { fileName: 'Flick2.png', url: `${PHIGROS_CHART_PREVIEW_ASSET_BASE}/skin/Flick2.png`, bytes: 7_508 },
  { fileName: 'Flick2HL.png', url: `${PHIGROS_CHART_PREVIEW_ASSET_BASE}/skin/Flick2HL.png`, bytes: 33_584 },
  { fileName: 'Hold2.png', url: `${PHIGROS_CHART_PREVIEW_ASSET_BASE}/skin/Hold2.png`, bytes: 1_251_031 },
  { fileName: 'Hold2HL.png', url: `${PHIGROS_CHART_PREVIEW_ASSET_BASE}/skin/Hold2HL.png`, bytes: 1_171_989 },
  { fileName: 'hit.png', url: `${PHIGROS_CHART_PREVIEW_ASSET_BASE}/skin/hit.png`, bytes: 356_117 },
];

const HIT_SOUND_ASSETS: readonly { kind: 'click' | 'drag' | 'flick'; fileName: string; url: string; bytes: number }[] = [
  { kind: 'click', fileName: 'hit-sounds/click.wav', url: `${PHIGROS_CHART_PREVIEW_ASSET_BASE}/hit-sounds/click.wav`, bytes: 21_838 },
  { kind: 'drag', fileName: 'hit-sounds/drag.wav', url: `${PHIGROS_CHART_PREVIEW_ASSET_BASE}/hit-sounds/drag.wav`, bytes: 83_354 },
  { kind: 'flick', fileName: 'hit-sounds/flick.wav', url: `${PHIGROS_CHART_PREVIEW_ASSET_BASE}/hit-sounds/flick.wav`, bytes: 71_774 },
];

export type PhigrosChartPreviewWebViewSource = {
  uri: string;
  allowingReadAccessToURL: string;
  dispose: () => void;
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
  directory?: Directory,
  signal?: AbortSignal,
): Promise<PhigrosChartPreviewWebViewSource> {
  return prepareChartPreviewWebviewFromPlan({
    signal,
    directoryName: STAGE_DIRECTORY_NAME,
    directory,
    stagedAssets: [
      { fileName: 'player.js', moduleId: PLAYER_MODULE },
      ...SKIN_ASSETS.map(({ fileName, url, bytes }) => ({ fileName: `skin/${fileName}`, url, bytes })),
    ],
    dataUrlAssets: HIT_SOUND_ASSETS.map(({ kind, fileName, url, bytes }) => ({
      key: kind,
      fileName,
      url,
      bytes,
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
export async function stagePhiraChartMusic(
  bytes: Uint8Array,
  fileName: string,
  directory = chartPreviewStageDirectory(STAGE_DIRECTORY_NAME),
): Promise<{ uri: string; base64: string }> {
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
  root = chartPreviewStageDirectory(STAGE_DIRECTORY_NAME),
): Promise<{ basePath: string }> {
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
