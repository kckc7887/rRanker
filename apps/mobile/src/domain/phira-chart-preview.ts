/**
 * Phira 谱面 ZIP 内容定位，语义与 @/services/phira-chart-notes 的 countPhiraChartZip
 * 以及 refer/phira prpr 的 info.yml 读取约定一致：
 * info.yml 提供 chart/music/illustration/format 键，缺失时按扩展名推断。
 * PGR 与 RPE 谱面支持观赏预览，PEC/PBC 由调用方给出明确提示。
 */

import { infoValue } from '@/services/phira-chart-notes';

export type PhiraChartZipFileEntry = {
  name: string;
  dir: boolean;
};

export type PhiraChartFormat = 'pgr' | 'rpe' | 'pec' | 'pbc';

export type PhiraChartZipMediaPlan = {
  chartEntryName: string | null;
  musicEntryName: string | null;
  illustrationEntryName: string | null;
};

export type PhiraRpeBundleFile = {
  /** 清洗后的扁平文件名（basename，防路径穿越）。 */
  name: string;
  entryName: string;
  /** 是否文本资源（extra.json/info.yml/.glsl），由 RN 侧读文本注入。 */
  text: boolean;
};

const CHART_EXTENSION_PATTERN = /\.(json|pec|pbc)$/i;
const MUSIC_EXTENSION_PATTERN = /\.(mp3|ogg|wav|m4a|aac|flac)$/i;

/** 按 info.yml 键或扩展名推断定位谱面、音乐与曲绘条目；不解析谱面内容。 */
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
    : files.find((entry) => CHART_EXTENSION_PATTERN.test(entry.name))?.name) ?? null;
  const musicEntryName = (musicName && files.some((entry) => entry.name === musicName)
    ? musicName
    : files.find((entry) => MUSIC_EXTENSION_PATTERN.test(entry.name))?.name) ?? null;
  const illustrationEntryName = (illustrationName && files.some((entry) => entry.name === illustrationName)
    ? illustrationName
    : null);

  return { chartEntryName, musicEntryName, illustrationEntryName };
}

/**
 * 判定谱面格式，分支与 countPhiraChartZip 一致：
 * pbc/pec 优先按 info.yml format 与扩展名，JSON 文本按 META 键区分 RPE 与 PGR。
 */
export function classifyPhiraChartFormat(
  entryName: string,
  formatHint: string | null,
  text: string,
): PhiraChartFormat {
  const hint = formatHint?.toLowerCase() ?? null;
  if (hint === 'pbc' || /\.pbc$/i.test(entryName)) return 'pbc';
  if (hint === 'pec' || /\.pec$/i.test(entryName) || !text.trimStart().startsWith('{')) return 'pec';
  return hint === 'rpe' || text.includes('"META"') ? 'rpe' : 'pgr';
}

export const PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE = '暂不支持预览该谱面格式（仅支持 PGR 与 RPE）';

const TEXT_BUNDLE_EXTENSION_PATTERN = /\.(glsl|json|ya?ml|txt)$/i;

/** 文件名清洗：取 basename 并剔除危险字符，防路径穿越；重名时先到先得（调用方保证顺序稳定）。 */
export function sanitizeRpeBundleFileName(entryName: string): string {
  const segments = entryName.split('/').filter((segment) => segment.length > 0);
  const basename = segments[segments.length - 1] ?? entryName;
  const cleaned = basename.replace(/[^A-Za-z0-9._-]/g, '_');
  return cleaned && cleaned.length > 0 ? cleaned : 'file.bin';
}

/**
 * RPE 谱面包资源计划：ZIP 内全部非目录条目扁平化为 basename 落盘。
 * extra.json/info.yml/文本条目标 text（RN 侧读文本注入，不经文件 fetch）；
 * 其余（背景/贴图/gif/视频/音乐）落盘为本地文件。
 */
export function buildPhiraRpeBundlePlan(
  entries: readonly PhiraChartZipFileEntry[],
): PhiraRpeBundleFile[] {
  const seen = new Set<string>();
  const files: PhiraRpeBundleFile[] = [];
  for (const entry of entries) {
    if (entry.dir || typeof entry.name !== 'string') continue;
    const name = sanitizeRpeBundleFileName(entry.name);
    if (seen.has(name)) continue; // 重名先到先得
    seen.add(name);
    files.push({ name, entryName: entry.name, text: TEXT_BUNDLE_EXTENSION_PATTERN.test(name) });
  }
  return files;
}
