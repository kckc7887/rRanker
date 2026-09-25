/**
 * Phigros / Phira 谱面确认“传入阶段”公共路径：
 * 把详情页交接过来的歌曲/谱面信息构建成播放器配置（Phigros 经 OSS 资源定位，
 * Phira 经谱面包解包），并产出需要落盘的本地音乐/谱面包资源数据。
 *
 * 本模块负责资源准备、不直接读写原生文件，谱面确认屏幕与
 * live 演示（tests/chart-preview-input-stage-live.test.ts）共用同一实现，
 * 避免传入逻辑在屏幕内与测试侧各自演化。
 */

import JSZip from 'jszip';
import {
  assertChartPreviewDownloadBytes,
  chartPreviewDeclaredUncompressedSize,
  pauseChartPreviewParse,
  createChartPreviewActualBytes,
  readBudgetedZipEntry,
  readBudgetedZipText,
  scanChartPreviewArchiveEntries,
  type ChartPreviewCancellation,
} from '@/features/chart-preview-shared/chart-preview-resource-budget';
import { bytesToBase64 } from '@/utils/crypto-subset';
import type { PhiraChart } from '@/domain/phira';
import {
  phigrosChartPreviewLevelLabel,
  type PhigrosChartPreviewAsset,
} from '@/domain/phigros-chart-preview';
import { loadPhigrosChartPreviewResources } from '@/services/phigros-chart-preview-resources';
import {
  buildPhiraRpeBundlePlan,
  classifyPhiraChartFormat,
  PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE,
  resolvePhiraChartZipMediaPlan,
} from '@/domain/phira-chart-preview';
import { infoValue, throwIfAborted } from '@/services/phira-chart-notes';
import { phiraProvider } from '@/providers/phira-provider';
import type {
  PhigrosChartPreviewConfig,
  PhigrosChartPreviewSettings,
} from './phigros-chart-preview-inject';

/** 谱面文本经 HTML 配置注入的上限，避免超大谱面拖垮 WebView。 */
export const CHART_TEXT_LIMIT = 6_000_000;
/** RPE 社区谱面普遍远大于 PGR（真实谱面 66661 的 chart JSON 约 24MB），RPE 上限单独放宽。 */
export const RPE_CHART_TEXT_LIMIT = 32_000_000;

export type PhigrosChartPreviewInput = {
  songId: string;
  levelIndex: number;
  title?: string;
  variantIndex?: number;
};

export type PhiraChartPreviewInput = {
  chartId: number;
  title?: string;
  chart?: PhiraChart;
};

export type PreparedChartPreviewInput = {
  config: PhigrosChartPreviewConfig;
  musicDataBase64?: string | null;
};

/** Phira 谱面包资源的落盘能力，由 RN 侧注入（本模块不依赖 expo-file-system）。 */
export type PhiraChartPreviewStaging = {
  stageMusic: (bytes: Uint8Array, fileName: string) => Promise<{ uri: string; base64: string }>;
  stageRpeBundle: (
    chartId: number,
    files: readonly { name: string; bytes: Uint8Array }[],
  ) => Promise<{ basePath: string }>;
  downloadChart?: (url: string, signal: AbortSignal) => Promise<ArrayBuffer>;
};

export async function buildPhigrosChartPreviewInput(
  input: PhigrosChartPreviewInput,
  settings: PhigrosChartPreviewSettings,
  signal: AbortSignal,
  read?: (asset: PhigrosChartPreviewAsset, index: number) => Promise<Uint8Array>,
): Promise<PreparedChartPreviewInput> {
  const resources = await loadPhigrosChartPreviewResources({
    songId: input.songId,
    difficulty: phigrosChartPreviewLevelLabel(input.levelIndex),
    ...(input.variantIndex === undefined ? {} : { variantIndex: input.variantIndex }),
  }, signal, read);
  const { bundle } = resources;
  return {
    musicDataBase64: bytesToBase64(resources.music),
    config: {
      game: 'phigros',
      title: `${input.title ?? `${bundle.song.title} ${bundle.target.difficulty}`}${input.variantIndex ? ` · 里谱 ${input.variantIndex}` : ''}`,
      chartText: new TextDecoder('utf-8', { fatal: true }).decode(resources.chart),
      illustrationUrl: `data:${bundle.illustration.contentType};base64,${bytesToBase64(resources.illustration)}`,
      settings,
    },
  };
}

function zipBasename(entryName: string, fallback: string): string {
  const segments = entryName.split('/').filter((segment) => segment.length > 0);
  const name = segments[segments.length - 1];
  return name && name.length > 0 ? name : fallback;
}

function chartTextByteLimit(entryName: string, formatHint: string | null): number {
  const hint = formatHint?.toLowerCase() ?? '';
  if (hint === 'rpe' || (hint !== 'pgr' && hint !== 'pec' && /\.json$/i.test(entryName))) return RPE_CHART_TEXT_LIMIT;
  return CHART_TEXT_LIMIT;
}

export async function buildPhiraChartPreviewInput(
  input: PhiraChartPreviewInput,
  settings: PhigrosChartPreviewSettings,
  signal: AbortSignal,
  staging: PhiraChartPreviewStaging,
): Promise<PreparedChartPreviewInput> {
  const chart = input.chart ?? await phiraProvider.getChart(input.chartId, signal);
  if (!chart.file) throw new Error('该谱面未提供可下载文件');
  const zipData = await (staging.downloadChart
    ? staging.downloadChart(chart.file, signal)
    : phiraProvider.downloadChart(chart.file, signal));
  const cancellation: ChartPreviewCancellation = { signal, actualBytes: createChartPreviewActualBytes() };
  assertChartPreviewDownloadBytes(zipData.byteLength);
  throwIfAborted(signal);
  const zip = await JSZip.loadAsync(zipData);
  throwIfAborted(signal);
  await scanChartPreviewArchiveEntries(Object.values(zip.files), zipData.byteLength, {
    cancellation,
    uncompressedSize: (entry) => chartPreviewDeclaredUncompressedSize(entry),
  });
  const entries = Object.values(zip.files).map((entry) => ({ name: entry.name, dir: entry.dir }));
  const infoEntry = entries.find((entry) => !entry.dir && /(^|\/)info\.ya?ml$/i.test(entry.name));
  const infoText = infoEntry
    ? await readBudgetedZipText(zip.file(infoEntry.name)!, CHART_TEXT_LIMIT, cancellation)
    : '';
  throwIfAborted(signal);

  const plan = resolvePhiraChartZipMediaPlan(entries, infoText || null);
  if (!plan.chartEntryName) throw new Error('谱面包中没有可读取的谱面文件');
  const chartEntry = zip.file(plan.chartEntryName)!;
  const formatHint = infoText ? infoValue(infoText, 'format') : null;
  if (formatHint?.toLowerCase() === 'pbc' || /\.pbc$/i.test(plan.chartEntryName)
    || formatHint?.toLowerCase() === 'pec' || /\.pec$/i.test(plan.chartEntryName)) {
    throw new Error(PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE);
  }
  // 用声明的解压长度预检，避免先解压再解码才发现谱面文本超限。
  const chartText = await readBudgetedZipText(chartEntry, chartTextByteLimit(plan.chartEntryName, formatHint), cancellation);
  const format = classifyPhiraChartFormat(plan.chartEntryName, formatHint, chartText);
  if (format !== 'pgr' && format !== 'rpe') throw new Error(PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE);
  const chartTextLimit = format === 'rpe' ? RPE_CHART_TEXT_LIMIT : CHART_TEXT_LIMIT;
  if (chartText.length > chartTextLimit) throw new Error('谱面过大，暂不支持预览');

  if (!plan.musicEntryName) throw new Error('谱面包缺少音乐文件');
  const musicBytes = await readBudgetedZipEntry(zip.file(plan.musicEntryName)!, cancellation);
  const musicFile = await staging.stageMusic(musicBytes, zipBasename(plan.musicEntryName, 'music.bin'));

  let illustrationUrl = typeof chart.illustration === 'string' && chart.illustration.trim() !== ''
    ? chart.illustration
    : undefined;
  if (!illustrationUrl && plan.illustrationEntryName) {
    const imageBytes = await readBudgetedZipEntry(zip.file(plan.illustrationEntryName)!, cancellation);
    illustrationUrl = (await staging.stageMusic(imageBytes, zipBasename(plan.illustrationEntryName, 'illustration.png'))).uri;
  }

  if (format === 'rpe') {
    // RPE 谱面包资源：文本资源读文本注入（extra.json/info.yml/.glsl），其余落盘到 rpe/{chartId}/。
    const bundlePlan = buildPhiraRpeBundlePlan(entries);
    let extraJson: string | null = null;
    const shaders: Record<string, string> = {};
    const stagedFiles: { name: string; bytes: Uint8Array }[] = [];
    for (let index = 0; index < bundlePlan.length; index += 1) {
      const file = bundlePlan[index]!;
      await pauseChartPreviewParse(index, cancellation);
      const entry = zip.file(file.entryName);
      if (!entry) continue;
      if (file.text) {
        if (file.name === 'extra.json') {
          extraJson = await readBudgetedZipText(entry, RPE_CHART_TEXT_LIMIT, cancellation);
        } else if (/\.glsl$/i.test(file.name)) {
          shaders[file.name] = await readBudgetedZipText(entry, RPE_CHART_TEXT_LIMIT, cancellation);
        }
        // info.yml 已随 infoText 读取注入；info.txt 等其余文本条目播放器不引用，不落盘。
        continue;
      }
      stagedFiles.push({ name: file.name, bytes: await readBudgetedZipEntry(entry, cancellation) });
    }
    const { basePath } = await staging.stageRpeBundle(input.chartId, stagedFiles);
    return {
      config: {
        game: 'phira',
        title: input.title ?? chart.name,
        chartText,
        illustrationUrl,
        settings,
        format: 'rpe',
        rpeAssets: { basePath, extraJson, infoYml: infoText || null, shaders },
      },
      musicDataBase64: musicFile.base64,
    };
  }

  return {
    config: {
      game: 'phira',
      title: input.title ?? chart.name,
      chartText,
      illustrationUrl,
      settings,
    },
    musicDataBase64: musicFile.base64,
  };
}
