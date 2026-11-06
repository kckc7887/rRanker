import { PHIRA_DIFFICULTY_COLORS } from '@/domain/phira-score-presentation';
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
import type { PhiraChart } from '@/domain/phira';
import {
  buildPhiraRpeBundlePlan,
  PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE,
  resolvePhiraChartZipMediaPlan,
} from '@/domain/phira-chart-preview';
import { rpeBundleRelativePath } from '@/domain/rpe-resource-path';
import { chartJsonFormat } from '../chart-preview-shared/chart-format';
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
  downloadChart: (url: string, signal: AbortSignal) => Promise<ArrayBuffer>;
};

function zipBasename(entryName: string, fallback: string): string {
  const segments = entryName.split('/').filter((segment) => segment.length > 0);
  const name = segments[segments.length - 1];
  return name && name.length > 0 ? name : fallback;
}

async function loadPhiraPreviewArchive(input: PhiraChartPreviewInput, signal: AbortSignal, staging: PhiraChartPreviewStaging) {
  const chart = input.chart ?? await phiraProvider.getChart(input.chartId, signal);
  if (!chart.file) throw new Error('该谱面未提供可下载文件');
  const zipData = await staging.downloadChart(chart.file, signal);
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
  const { zip, plan, cancellation } = archive;
  if (!plan.chartEntryName) throw new Error('谱面包中没有可读取的谱面文件');
  const entry = zip.file(plan.chartEntryName)!;
  let chartText: string, format: ReturnType<typeof chartJsonFormat>;
  try {
    chartText = await readBudgetedZipText(entry, RPE_CHART_TEXT_LIMIT, cancellation);
  } catch (error) {
    if (error instanceof TypeError) throw new Error(PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE);
    throw error;
  }
  let raw: { META?: { background?: string }; judgeLineList?: { Texture?: string }[] };
  try { raw = JSON.parse(chartText); format = chartJsonFormat(raw); }
  catch { throw new Error(PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE); }
  if (!format) throw new Error(PHIRA_CHART_PREVIEW_UNSUPPORTED_MESSAGE);
  if (format === 'pgr' && chartPreviewDeclaredUncompressedSize(entry) > CHART_TEXT_LIMIT) throw new Error('谱面过大，暂不支持预览');
  const resources = new Set<string>();
  if (format === 'rpe') {
    for (const value of [raw.META?.background, ...(raw.judgeLineList ?? []).map(line => line?.Texture)]) {
      const path = value && rpeBundleRelativePath(value);
      if (path) resources.add(path);
    }
  }
  return { chartText, format, resources };
}

async function stagePhiraRpeResources(
  archive: Awaited<ReturnType<typeof loadPhiraPreviewArchive>>,
  chartId: number,
  resources: Set<string>,
  staging: PhiraChartPreviewStaging,
): Promise<PgrPreviewRpeAssets> {
  const { zip, entries, infoText, cancellation } = archive;
  const bundlePlan = buildPhiraRpeBundlePlan(entries);
  const extra = bundlePlan.find(file => file.name === 'extra.json');
  const extraJson = extra ? await readBudgetedZipText(zip.file(extra.entryName)!, RPE_CHART_TEXT_LIMIT, cancellation) : null;
  if (extraJson) {
    const data = JSON.parse(extraJson) as { videos?: { path?: string }[]; effects?: { shader?: string; vars?: Record<string, unknown> }[] } | null;
    const add = (value: unknown) => {
      const path = typeof value === 'string' && rpeBundleRelativePath(value);
      if (path) resources.add(path);
    };
    for (const video of data?.videos ?? []) add(video.path);
    for (const effect of data?.effects ?? []) {
      add(effect.shader);
      for (const value of Object.values(effect.vars ?? {})) add(value);
    }
  }
  const shaders: Record<string, string> = {};
  const stagedFiles: { name: string; bytes: Uint8Array }[] = [];
  for (let index = 0; index < bundlePlan.length; index += 1) {
    const file = bundlePlan[index]!;
    await pauseChartPreviewParse(index, cancellation);
    if (!resources.has(file.name)) continue;
    const entry = zip.file(file.entryName);
    if (!entry) continue;
    if (file.text) {
      if (/\.(glsl|fs)$/i.test(file.name)) shaders[file.name] = await readBudgetedZipText(entry, RPE_CHART_TEXT_LIMIT, cancellation);
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
  const { chartText, format, resources } = await readPhiraPreviewChart(archive);
  if (!plan.musicEntryName) throw new Error('谱面包缺少音乐文件');
  const musicBytes = await readBudgetedZipEntry(zip.file(plan.musicEntryName)!, cancellation);
  const musicFile = await staging.stageMusic(musicBytes, zipBasename(plan.musicEntryName, 'music.bin'));
  throwIfAborted(signal);
  let illustrationUrl = typeof chart.illustration === 'string' && chart.illustration.trim() !== '' ? chart.illustration : undefined;
  if (!illustrationUrl && plan.illustrationEntryName) {
    const imageBytes = await readBudgetedZipEntry(zip.file(plan.illustrationEntryName)!, cancellation);
    illustrationUrl = (await staging.stageMusic(imageBytes, zipBasename(plan.illustrationEntryName, 'illustration.png'))).uri;
  }
  const rpeAssets = format === 'rpe' ? await stagePhiraRpeResources(archive, input.chartId, resources, staging) : undefined;
  throwIfAborted(signal);
  return {
    config: {
      game: 'phira', sourceLabel: 'Phira 谱面', title: input.title ?? chart.name,
      previewDifficulty: { label: chart.level ?? '—', value: Number.isFinite(chart.difficulty) ? chart.difficulty.toFixed(1) : '—',
        background: PHIRA_DIFFICULTY_COLORS.bg, text: PHIRA_DIFFICULTY_COLORS.fg },
      chartText, illustrationUrl, settings,
      format, rpeAssets,
    },
    musicDataBase64: musicFile.base64,
  };
}
