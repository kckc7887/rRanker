import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

export {
  buildChartPreviewInjectedJavaScript,
  chartPreviewStopScript,
} from './chart-preview-inject';

const HTML_MODULE = require('../../../assets/maimai-chart-preview/index.html') as number;
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

/** 将内联 HTML 与 sensor/answer 资源落到缓存目录，供 file:// WebView 读取。 */
export async function prepareChartPreviewWebViewSource(): Promise<ChartPreviewWebViewSource> {
  const directory = chartPreviewStageDirectory();
  const html = await stageAsset(HTML_MODULE, 'index.html', directory);
  await stageAsset(SENSOR_MODULE, 'sensor.webp', directory);
  await stageAsset(ANSWER_MODULE, 'answer.wav', directory);
  return {
    uri: html.uri,
    allowingReadAccessToURL: directory.uri,
  };
}

export function chartPreviewAllowsFileAccess(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}
