import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import {
  applyChartPreviewConfigToHtml,
  type ChartPreviewInjectConfig,
} from './chart-preview-inject';

export {
  applyChartPreviewConfigToHtml,
  buildChartPreviewConfigScript,
  buildChartPreviewInjectedJavaScript,
  chartPreviewStopScript,
  type ChartPreviewInjectConfig,
} from './chart-preview-inject';

const HTML_MODULE = require('../../../assets/maimai-chart-preview/index.html') as number;
const PLAYER_MODULE = require('../../../assets/maimai-chart-preview/player.bundle') as number;
const SENSOR_MODULE = require('../../../assets/maimai-chart-preview/sensor.webp') as number;
const ANSWER_MODULE = require('../../../assets/maimai-chart-preview/answer.wav') as number;

export type ChartPreviewWebViewSource = {
  uri: string;
  allowingReadAccessToURL: string;
};

function chartPreviewStageDirectory(): Directory {
  const directory = new Directory(Paths.cache, 'rranker-chart-preview');
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

async function stageAsset(moduleId: number, fileName: string, directory: Directory): Promise<File> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error(`无法加载资源 ${fileName}`);
  const target = new File(directory, fileName);
  const source = new File(asset.localUri);
  if (target.exists) target.delete();
  source.copy(target);
  return target;
}

async function readAssetText(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('无法读取谱面预览 HTML');
  return await new File(asset.localUri).text();
}

/**
 * 将 HTML / player.js / sensor / answer 落到缓存目录，并在 HTML 内写入谱面参数。
 * file:// WebView 上比依赖 injectedJavaScriptBeforeContentLoaded 更稳。
 */
export async function prepareChartPreviewWebViewSource(
  config: ChartPreviewInjectConfig,
): Promise<ChartPreviewWebViewSource> {
  const directory = chartPreviewStageDirectory();
  await stageAsset(PLAYER_MODULE, 'player.js', directory);
  await stageAsset(SENSOR_MODULE, 'sensor.webp', directory);
  await stageAsset(ANSWER_MODULE, 'answer.wav', directory);

  const template = await readAssetText(HTML_MODULE);
  const html = applyChartPreviewConfigToHtml(template, config);
  const htmlFile = new File(directory, 'index.html');
  htmlFile.create({ overwrite: true });
  htmlFile.write(html);

  return {
    uri: htmlFile.uri,
    allowingReadAccessToURL: directory.uri,
  };
}

export function chartPreviewAllowsFileAccess(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}
