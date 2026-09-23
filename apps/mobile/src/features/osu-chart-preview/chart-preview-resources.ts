import JSZip from 'jszip';
import {
  assertChartPreviewDownloadBytes,
  chartPreviewDeclaredUncompressedSize,
  readBudgetedZipEntry,
  scanChartPreviewArchiveEntries,
  type ChartPreviewCancellation,
} from '@/features/chart-preview-shared/chart-preview-resource-budget';
import { bytesToBase64 } from '@/utils/crypto-subset';
import type { OsuChartPreviewFile, OsuChartPreviewTarget } from './configuration';
import { parseBeatmap } from './webview-player/engine/parsers/BeatmapParser';
import { selectPreviewOsbPaths, selectPreviewResources } from './webview-player/resource-plan';
import { decodeOsuText, normalizeArchivePath } from './webview-player/osu-text';

export type OsuChartPreviewResources = {
  chartPath: string;
  files: OsuChartPreviewFile[];
  audio: Record<string, string>;
};

export type OsuChartPreviewResourceReader = {
  assertCurrent: () => void;
  stageMedia: (path: string, bytes: Uint8Array) => Promise<string>;
  onProgress?: (progress: number) => void;
};

export function osuPreviewResourceMime(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  const types: Record<string, string> = {
    osu: 'text/plain', osb: 'text/plain', png: 'image/png', jpg: 'image/jpeg',
    jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
    mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4',
    flac: 'audio/flac', aac: 'audio/aac',
  };
  return types[extension] ?? 'application/octet-stream';
}

function archivePath(path: string): string {
  const normalized = path.replace(/\\/gu, '/');
  if (/^[a-z]+:|^\/|\u0000/iu.test(normalized)
    || normalized.split('/').some((part) => part === '..')) {
    throw new Error('谱面包包含无效的资源路径');
  }
  const identity = normalizeArchivePath(normalized);
  if (!identity) throw new Error('谱面包包含无效的资源路径');
  return identity;
}

export async function readOsuChartPreviewArchive(
  archive: Uint8Array,
  target: OsuChartPreviewTarget,
  reader: OsuChartPreviewResourceReader,
  options?: { includeVideo?: boolean },
): Promise<OsuChartPreviewResources> {
  const cancellation: ChartPreviewCancellation = { assertCurrent: reader.assertCurrent };
  assertChartPreviewDownloadBytes(archive.byteLength);
  reader.assertCurrent();
  const zip = await JSZip.loadAsync(archive);
  reader.assertCurrent();
  const entries = new Map<string, JSZip.JSZipObject>();
  const foldedPaths = new Set<string>();
  await scanChartPreviewArchiveEntries(Object.values(zip.files), archive.byteLength, {
    cancellation,
    uncompressedSize: (entry) => chartPreviewDeclaredUncompressedSize(entry),
    visit: (entry) => {
      archivePath(entry.unsafeOriginalName ?? entry.name);
      const path = archivePath(entry.name);
      const folded = path.toLowerCase();
      if (foldedPaths.has(folded)) throw new Error('谱面包包含重复的资源路径');
      foldedPaths.add(folded);
      entries.set(path, entry);
    },
  });

  let selected: { path: string; text: string } | undefined;
  for (const [path, entry] of entries) {
    if (!/\.osu$/iu.test(path)) continue;
    const bytes = await readBudgetedZipEntry(entry, cancellation);
    const text = decodeOsuText(bytes);
    const beatmap = parseBeatmap(text);
    if (beatmap.beatmapId !== target.beatmapId) continue;
    if (beatmap.beatmapsetId != null && beatmap.beatmapsetId > 0
      && beatmap.beatmapsetId !== target.beatmapsetId) {
      throw new Error('谱面与歌曲不匹配');
    }
    if (selected) throw new Error('谱面包包含重复的难度');
    selected = { path, text };
  }
  if (!selected) throw new Error('谱面包中没有所选难度');

  const osbSources: { path: string; text: string }[] = [];
  for (const path of selectPreviewOsbPaths(selected.path, [...entries.keys()])) {
    const bytes = await readBudgetedZipEntry(entries.get(path)!, cancellation);
    osbSources.push({ path, text: decodeOsuText(bytes) });
  }
  const plan = selectPreviewResources({
    osuText: selected.text,
    osuPath: selected.path,
    osbSources,
    availablePaths: [...entries.keys()],
    includeVideo: options?.includeVideo,
    cancellation,
  });
  const files: OsuChartPreviewFile[] = [selected, ...osbSources].map(({ path, text }) => ({
    path, text, mime: 'text/plain',
  }));
  const audio: Record<string, string> = Object.create(null) as Record<string, string>;
  const mediaPaths = [...new Set([...plan.imagePaths, ...(plan.videoPath ? [plan.videoPath] : [])])];
  const audioPaths = [...new Set(plan.audioPaths)];
  const total = mediaPaths.length + audioPaths.length;
  let completed = 0;
  const stagedMedia: { path: string; bytes: Uint8Array }[] = [];
  for (const path of audioPaths) {
    const entry = entries.get(path);
    if (!entry) throw new Error('谱面音频资源不存在');
    const bytes = await readBudgetedZipEntry(entry, cancellation);
    audio[path] = bytesToBase64(bytes);
    reader.onProgress?.(++completed / Math.max(1, total));
  }
  for (const path of mediaPaths) {
    const entry = entries.get(path);
    if (!entry) throw new Error('谱面媒体资源不存在');
    stagedMedia.push({ path, bytes: await readBudgetedZipEntry(entry, cancellation) });
  }
  for (const item of stagedMedia) {
    const uri = await reader.stageMedia(item.path, item.bytes);
    reader.assertCurrent();
    files.push({ path: item.path, uri, mime: osuPreviewResourceMime(item.path) });
    reader.onProgress?.(++completed / Math.max(1, total));
  }
  reader.assertCurrent();
  reader.onProgress?.(1);
  return { chartPath: selected.path, files, audio };
}
