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

/**
 * RPE 内置特效预设（prpr 后处理预设，来源 refer/phira/prpr，GPL-3.0，许可证随 assets/shaders 分发）：
 * 以 prpr 预设名注入 shader 文本，谱面包内同名 shader 优先（与 demo 语义一致）。
 */
const RPE_PRESET_SHADER_ASSETS: readonly { name: string; fileName: string; moduleId: number }[] = [
  { name: 'chromatic', fileName: 'chromatic.glsl', moduleId: require('../../../assets/phigros-chart-preview/shaders/chromatic.glsl') },
  { name: 'circleBlur', fileName: 'circle_blur.glsl', moduleId: require('../../../assets/phigros-chart-preview/shaders/circle_blur.glsl') },
  { name: 'fisheye', fileName: 'fisheye.glsl', moduleId: require('../../../assets/phigros-chart-preview/shaders/fisheye.glsl') },
  { name: 'glitch', fileName: 'glitch.glsl', moduleId: require('../../../assets/phigros-chart-preview/shaders/glitch.glsl') },
  { name: 'grayscale', fileName: 'grayscale.glsl', moduleId: require('../../../assets/phigros-chart-preview/shaders/grayscale.glsl') },
  { name: 'noise', fileName: 'noise.glsl', moduleId: require('../../../assets/phigros-chart-preview/shaders/noise.glsl') },
  { name: 'pixel', fileName: 'pixel.glsl', moduleId: require('../../../assets/phigros-chart-preview/shaders/pixel.glsl') },
  { name: 'radialBlur', fileName: 'radial_blur.glsl', moduleId: require('../../../assets/phigros-chart-preview/shaders/radial_blur.glsl') },
  { name: 'shockwave', fileName: 'shockwave.glsl', moduleId: require('../../../assets/phigros-chart-preview/shaders/shockwave.glsl') },
  { name: 'vignette', fileName: 'vignette.glsl', moduleId: require('../../../assets/phigros-chart-preview/shaders/vignette.glsl') },
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
 * 将 HTML / player.js / 内置皮肤落到缓存目录，打击音以 data URL 注入配置，
 * 本地音乐以 base64 写入 music-data.js（iOS file:// 下无法 fetch 本地文件）。
 * file:// WebView 上比依赖 injectedJavaScriptBeforeContentLoaded 更稳。
 */
export async function preparePhigrosChartPreviewWebViewSource(
  config: PhigrosChartPreviewConfig,
  musicDataBase64: string | null = null,
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

  const musicDataFile = new File(directory, 'music-data.js');
  musicDataFile.create({ overwrite: true });
  musicDataFile.write(`window.__PHIGROS_MUSIC_DATA__=${musicDataBase64 ? JSON.stringify(musicDataBase64) : 'null'};`);

  // RPE：谱面包 shader 之外补齐 prpr 内置预设（同名时谱面包优先，与 demo 语义一致）。
  let rpeAssets = config.rpeAssets ?? null;
  if (config.format === 'rpe' && rpeAssets) {
    const shaders = { ...rpeAssets.shaders };
    for (const { name, moduleId } of RPE_PRESET_SHADER_ASSETS) {
      if (!(name in shaders)) shaders[name] = await readAssetText(moduleId);
    }
    rpeAssets = { ...rpeAssets, shaders };
  }

  const template = await readAssetText(HTML_MODULE);
  const html = applyPhigrosChartPreviewConfigToHtml(template, { ...config, hitSounds, rpeAssets });
  const htmlFile = new File(directory, 'index.html');
  htmlFile.create({ overwrite: true });
  htmlFile.write(html);

  return {
    uri: htmlFile.uri,
    allowingReadAccessToURL: directory.uri,
  };
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
