import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';
import {
  applyPhigrosChartPreviewConfigToHtml,
  type PhigrosChartPreviewConfig,
} from './phigros-chart-preview-inject';
import {
  chartPreviewStageDirectory,
  loadAssetFileUri,
  readAssetText,
  stageAsset,
} from '@/features/maimai-chart-preview/prepare-chart-preview-webview';

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

async function readAssetBase64(moduleId: number, fileName: string): Promise<string> {
  const sourceUri = await loadAssetFileUri(moduleId, fileName);
  return new File(sourceUri).base64();
}

/**
 * 将 HTML / player.js / 内置皮肤落到缓存目录，打击音以 data URL 注入配置。
 * file:// WebView 上比依赖 injectedJavaScriptBeforeContentLoaded 更稳，
 * 且 iOS 下不依赖 file fetch。
 */
export async function preparePhigrosChartPreviewWebViewSource(
  config: PhigrosChartPreviewConfig,
): Promise<PhigrosChartPreviewWebViewSource> {
  const directory = chartPreviewStageDirectory(STAGE_DIRECTORY_NAME);
  await stageAsset(PLAYER_MODULE, 'player.js', directory);

  const skinDirectory = new Directory(directory, 'skin');
  skinDirectory.create({ intermediates: true, idempotent: true });
  for (const { fileName, moduleId } of SKIN_ASSETS) {
    await stageAsset(moduleId, `skin/${fileName}`, directory);
  }

  const hitSounds: NonNullable<PhigrosChartPreviewConfig['hitSounds']> = {};
  for (const { kind, fileName, moduleId } of HIT_SOUND_ASSETS) {
    const base64 = await readAssetBase64(moduleId, fileName);
    hitSounds[kind] = `data:audio/wav;base64,${base64}`;
  }

  const template = await readAssetText(HTML_MODULE);
  const html = applyPhigrosChartPreviewConfigToHtml(template, { ...config, hitSounds });
  const htmlFile = new File(directory, 'index.html');
  htmlFile.create({ overwrite: true });
  htmlFile.write(html);

  return {
    uri: htmlFile.uri,
    allowingReadAccessToURL: directory.uri,
  };
}

/** Phira 谱面音乐落盘到预览 stage 目录，供 WebView 以 file:// URI 播放。 */
export async function stagePhiraChartMusic(bytes: Uint8Array, fileName: string): Promise<string> {
  const directory = chartPreviewStageDirectory(STAGE_DIRECTORY_NAME);
  const file = new File(directory, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  return file.uri;
}

export function phigrosChartPreviewAllowsFileAccess(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}
