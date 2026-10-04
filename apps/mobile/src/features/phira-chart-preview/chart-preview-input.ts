import JSZip from 'jszip';
import {
  CHART_PREVIEW_MAX_DOWNLOAD_BYTES,
  assertChartPreviewDownloadBytes,
  chartPreviewDeclaredUncompressedSize,
  pauseChartPreviewParse,
  createChartPreviewActualBytes,
  readBudgetedZipEntry,
  readBudgetedZipText,
  scanChartPreviewArchiveEntries,
  type ChartPreviewCancellation,
} from '@/features/chart-preview-shared/chart-preview-resource-budget';
import type { PhiraChart } from '@/domain/phira';
import {
  buildPhiraRpeBundlePlan,
  classifyPhiraChartFormat,
  PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE,
  resolvePhiraChartZipMediaPlan,
} from '@/domain/phira-chart-preview';
import { infoValue } from '@/domain/phira-chart-info';
import { throwIfAborted } from '@/services/phira-chart-notes';
import { phiraProvider } from '@/providers/phira-provider';
import type { PgrPreviewSettings, PgrPreviewRpeAssets, PreparedPgrPreviewInput } from '@/features/chart-preview-shared/pgr-preview-config';

export const CHART_TEXT_LIMIT = 6_000_000;
/** RPE 社区谱面通常较大，单独设置文本限额。 */
export const RPE_CHART_TEXT_LIMIT = 32_000_000;

export type PhiraChartPreviewInput = {
  chartId: number;
  title?: string;
  chart?: PhiraChart;
};

export type PhiraChartPreviewStaging = {
  stageMusic: (bytes: Uint8Array, fileName: string) => Promise<{ uri: string; base64: string }>;
  stageRpeBundle: (
    chartId: number,
    files: readonly { name: string; bytes: Uint8Array }[],
  ) => Promise<{ basePath: string }>;
  downloadChart?: (url: string, signal: AbortSignal) => Promise<ArrayBuffer>;
};

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

async function loadPhiraPreviewArchive(input: PhiraChartPreviewInput, signal: AbortSignal, staging: PhiraChartPreviewStaging) {
  const chart = input.chart ?? await phiraProvider.getChart(input.chartId, signal);
  if (!chart.file) throw new Error('该谱面未提供可下载文件');
  const zipData = await (staging.downloadChart
    ? staging.downloadChart(chart.file, signal)
    : phiraProvider.downloadChart(chart.file, signal, CHART_PREVIEW_MAX_DOWNLOAD_BYTES));
  const cancellation: ChartPreviewCancellation = { signal, actualBytes: createChartPreviewActualBytes() };
  assertChartPreviewDownloadBytes(zipData.byteLength);
  throwIfAborted(signal);
  const zip = await JSZip.loadAsync(zipData);
  throwIfAborted(signal);
  await scanChartPreviewArchiveEntries(Object.values(zip.files), zipData.byteLength, {
    cancellation,
    uncompressedSize: entry => chartPreviewDeclaredUncompressedSize(entry),
  });
  const entries = Object.values(zip.files).map(entry => ({ name: entry.name, dir: entry.dir }));
  const infoEntry = entries.find(entry => !entry.dir && /(^|\/)info\.ya?ml$/i.test(entry.name));
  const infoText = infoEntry ? await readBudgetedZipText(zip.file(infoEntry.name)!, CHART_TEXT_LIMIT, cancellation) : '';
  throwIfAborted(signal);
  return { chart, zip, entries, infoText, cancellation, plan: resolvePhiraChartZipMediaPlan(entries, infoText || null) };
}

async function readPhiraPreviewChart(archive: Awaited<ReturnType<typeof loadPhiraPreviewArchive>>) {
  const { zip, plan, infoText, cancellation } = archive;
  if (!plan.chartEntryName) throw new Error('谱面包中没有可读取的谱面文件');
  const formatHint = infoText ? infoValue(infoText, 'format') : null;
  if (['pbc', 'pec'].includes(formatHint?.toLowerCase() ?? '') || /\.(pbc|pec)$/i.test(plan.chartEntryName)) {
    throw new Error(PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE);
  }
  const chartText = await readBudgetedZipText(zip.file(plan.chartEntryName)!, chartTextByteLimit(plan.chartEntryName, formatHint), cancellation);
  const format = classifyPhiraChartFormat(plan.chartEntryName, formatHint, chartText);
  if (format !== 'pgr' && format !== 'rpe') throw new Error(PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE);
  if (chartText.length > (format === 'rpe' ? RPE_CHART_TEXT_LIMIT : CHART_TEXT_LIMIT)) throw new Error('谱面过大，暂不支持预览');
  return { chartText, format };
}

async function stagePhiraRpeResources(
  archive: Awaited<ReturnType<typeof loadPhiraPreviewArchive>>,
  chartId: number,
  staging: PhiraChartPreviewStaging,
): Promise<PgrPreviewRpeAssets> {
  const { zip, entries, infoText, cancellation } = archive;
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
      if (file.name === 'extra.json') extraJson = await readBudgetedZipText(entry, RPE_CHART_TEXT_LIMIT, cancellation);
      else if (/\.glsl$/i.test(file.name)) shaders[file.name] = await readBudgetedZipText(entry, RPE_CHART_TEXT_LIMIT, cancellation);
      continue;
    }
    stagedFiles.push({ name: file.name, bytes: await readBudgetedZipEntry(entry, cancellation) });
  }
  const { basePath } = await staging.stageRpeBundle(chartId, stagedFiles);
  throwIfAborted(cancellation.signal!);
  return { basePath, extraJson, infoYml: infoText || null, shaders };
}

export async function buildPhiraChartPreviewInput(
  input: PhiraChartPreviewInput,
  settings: PgrPreviewSettings,
  signal: AbortSignal,
  staging: PhiraChartPreviewStaging,
): Promise<PreparedPgrPreviewInput> {
  const archive = await loadPhiraPreviewArchive(input, signal, staging);
  const { zip, chart, plan, cancellation } = archive;
  const { chartText, format } = await readPhiraPreviewChart(archive);
  if (!plan.musicEntryName) throw new Error('谱面包缺少音乐文件');
  const musicBytes = await readBudgetedZipEntry(zip.file(plan.musicEntryName)!, cancellation);
  const musicFile = await staging.stageMusic(musicBytes, zipBasename(plan.musicEntryName, 'music.bin'));
  throwIfAborted(signal);
  let illustrationUrl = typeof chart.illustration === 'string' && chart.illustration.trim() !== '' ? chart.illustration : undefined;
  if (!illustrationUrl && plan.illustrationEntryName) {
    const imageBytes = await readBudgetedZipEntry(zip.file(plan.illustrationEntryName)!, cancellation);
    illustrationUrl = (await staging.stageMusic(imageBytes, zipBasename(plan.illustrationEntryName, 'illustration.png'))).uri;
  }
  const rpeAssets = format === 'rpe' ? await stagePhiraRpeResources(archive, input.chartId, staging) : undefined;
  throwIfAborted(signal);
  return {
    config: {
      game: 'phira', sourceLabel: 'Phira 谱面', title: input.title ?? chart.name,
      chartText, illustrationUrl, settings,
      ...(rpeAssets ? { format: 'rpe', rpeAssets } : {}),
    },
    musicDataBase64: musicFile.base64,
  };
}
