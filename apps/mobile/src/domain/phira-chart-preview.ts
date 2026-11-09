/** info.yml 字段约定来自 TeamFlos/phira 的 prpr；未指定时按扩展名推断。 */

import { infoValue } from './phira-chart-info';
import { rpeBundleRelativePath } from '@/domain/rpe-resource-path';

export { rpeBundleRelativePath as sanitizeRpeBundleFileName, rpeResourceUrl } from '@/domain/rpe-resource-path';

export type PhiraChartZipFileEntry = {
  name: string;
  dir: boolean;
};

export type PhiraChartZipMediaPlan = {
  chartEntryName: string | null;
  musicEntryName: string | null;
  illustrationEntryName: string | null;
};

export type PhiraRpeBundleFile = {
  name: string;
  entryName: string;
  text: boolean;
};

const CHART_EXTENSION_PATTERN = /\.(json|pec|pbc)$/i;
const MUSIC_EXTENSION_PATTERN = /\.(mp3|ogg|wav|m4a|aac|flac)$/i;

export function resolvePhiraChartZipMediaPlan(
  entries: readonly PhiraChartZipFileEntry[],
  infoText: string | null,
): PhiraChartZipMediaPlan {
  const files = entries.filter((entry) => !entry.dir && typeof entry.name === 'string');
  const chartName = infoText ? infoValue(infoText, 'chart') : null;
  const musicName = infoText ? infoValue(infoText, 'music') : null;
  const illustrationName = infoText ? infoValue(infoText, 'illustration') : null;

  const chartEntryName = (chartName && files.some((entry) => entry.name === chartName)
    ? chartName
    : files.find((entry) => CHART_EXTENSION_PATTERN.test(entry.name) && !/(?:^|\/)extra\.json$/i.test(entry.name))?.name) ?? null;
  const musicEntryName = (musicName && files.some((entry) => entry.name === musicName)
    ? musicName
    : files.find((entry) => MUSIC_EXTENSION_PATTERN.test(entry.name))?.name) ?? null;
  const illustrationEntryName = (illustrationName && files.some((entry) => entry.name === illustrationName)
    ? illustrationName
    : null);

  return { chartEntryName, musicEntryName, illustrationEntryName };
}

export const PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE = '暂不支持预览该谱面格式';

const TEXT_BUNDLE_EXTENSION_PATTERN = /\.(glsl|fs|json|ya?ml|txt)$/i;

/** extra.json、info.yml 和着色器按文本注入，不经原生文件 fetch。 */
export function buildPhiraRpeBundlePlan(
  entries: readonly PhiraChartZipFileEntry[],
): PhiraRpeBundleFile[] {
  const seen = new Set<string>();
  const files: PhiraRpeBundleFile[] = [];
  for (const entry of entries) {
    if (entry.dir || typeof entry.name !== 'string') continue;
    const name = rpeBundleRelativePath(entry.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    files.push({ name, entryName: entry.name, text: TEXT_BUNDLE_EXTENSION_PATTERN.test(name) });
  }
  return files;
}
