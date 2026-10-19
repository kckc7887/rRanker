import type { BestImageRatingStyle } from './best-image-style-preferences';
import { captureResourceWrites, createInflightGuard, resourceWriteGeneration, invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { downloadChartResource } from '@/features/chart-download-shared/chart-download-shared';
import { sha256, sha256FileAsync } from '@/utils/resource-integrity';
import { errorMessage } from './best-image-font-cache-core';
import { Directory, File, Paths } from 'expo-file-system';
import JSZip from 'jszip';
import {
  MAIMAI_UI_MANIFEST_ENTRIES,
  MAIMAI_UI_ZIP,
  MAIMAI_APP_UI_ZIP,
  MAIMAI_APP_UI_MANIFEST_ENTRIES,
  type MaimaiUiManifestEntry,
} from './maimai-ui-manifest.generated';

export const MAIMAI_UI_CACHE_VERSION = 'v1';

export type MaimaiUiProgressPhase =
  | 'checking'
  | 'downloading'
  | 'unpacking'
  | 'ready'
  | 'error';

export type MaimaiUiProgress = {
  phase: MaimaiUiProgressPhase;
  completed: number;
  total: number;
  currentEntry: string | null;
  error?: string;
};

export type PreparedMaimaiUi = {
  directory: Directory;
  fullReady: Promise<void>;
  files: readonly string[];
};

type ProgressListener = (progress: MaimaiUiProgress) => void;

let uiDownloadSequence = 0;

const inFlight = createInflightGuard<string>();

const directories = (style: BestImageRatingStyle) => {
  const directory = new Directory(Paths.document, 'rranker', 'maimai-assets', MAIMAI_UI_CACHE_VERSION, ...(style === 'app' ? ['app'] : []));
  directory.create({ intermediates: true, idempotent: true });
  return directory;
};

/** 两套素材保留各自的会话相对路径。 */
const finalPathOf = (path: string) => path.replace(/^maimai-ui\//u, 'ui/');

async function isValidUi(uiDirectory: Directory, entries: readonly MaimaiUiManifestEntry[]): Promise<boolean> {
  for (const entry of entries) {
    const file = new File(uiDirectory, finalPathOf(entry.path));
    if (!file.exists || file.size !== entry.bytes) return false;
    if (await sha256FileAsync(file.uri) !== entry.sha256) return false;
  }
  return true;
}

async function unpack(
  zipBytes: Uint8Array,
  uiDirectory: Directory,
  temporaryDirectory: Directory,
  onEntry: (path: string) => void,
  assertCurrent: () => void,
  entries: readonly MaimaiUiManifestEntry[],
): Promise<void> {
  const zip = await JSZip.loadAsync(zipBytes);
  for (const entry of entries) {
    assertCurrent();
    onEntry(entry.path);
    const zipFile = zip.file(entry.path);
    if (!zipFile) throw new Error(`压缩包缺少 ${entry.path}`);
    const bytes = await zipFile.async('uint8array');
    if (bytes.byteLength !== entry.bytes || await sha256(bytes) !== entry.sha256) {
      throw new Error(`${entry.path} 校验失败`);
    }
    assertCurrent();
    const finalPath = finalPathOf(entry.path);
    const part = new File(temporaryDirectory, `entry-${finalPath.replace(/[\\/]/gu, '_')}.part`);
    if (part.exists) part.delete();
    part.create({ overwrite: true });
    part.write(bytes);
    /** iOS 文件移动要求目标目录已存在。 */
    const slash = finalPath.lastIndexOf('/');
    if (slash > 0) {
      const parent = new Directory(uiDirectory, finalPath.slice(0, slash));
      parent.create({ intermediates: true, idempotent: true });
    }
    const finalFile = new File(uiDirectory, finalPath);
    if (finalFile.exists) finalFile.delete();
    part.moveSync(finalFile);
  }
}

async function downloadAndUnpack(
  uiDirectory: Directory,
  temporaryDirectory: Directory,
  onProgress: ProgressListener,
  signal: AbortSignal,
  assertCurrent: () => void,
  entries: readonly MaimaiUiManifestEntry[],
  archive: typeof MAIMAI_UI_ZIP | typeof MAIMAI_APP_UI_ZIP,
): Promise<void> {
  const archiveFile = new File(temporaryDirectory, 'maimai-ui.zip.part');
  try {
    if (archiveFile.exists) archiveFile.delete();
    onProgress({ phase: 'downloading', completed: 0, total: entries.length, currentEntry: null });
    await downloadChartResource(temporaryDirectory, 'maimai-ui.zip.part', archive.url, signal);
    assertCurrent();
    if (archiveFile.size !== archive.bytes) {
      throw new Error('素材压缩包大小不匹配');
    }
    if (await sha256FileAsync(archiveFile.uri) !== archive.sha256) {
      throw new Error('素材压缩包校验失败');
    }
    assertCurrent();
    const archiveBytes = await archiveFile.bytes();
    let done = 0;
    onProgress({ phase: 'unpacking', completed: 0, total: entries.length, currentEntry: null });
    await unpack(archiveBytes, uiDirectory, temporaryDirectory, (path) => {
      done += 1;
      onProgress({ phase: 'unpacking', completed: done, total: entries.length, currentEntry: path });
    }, assertCurrent, entries);
  } finally {
    if (archiveFile.exists) archiveFile.delete();
  }
}

export async function prepareMaimaiUi(
  style: BestImageRatingStyle,
  onProgress?: ProgressListener,
  signal?: AbortSignal,
): Promise<PreparedMaimaiUi> {
  const directory = directories(style);
  const entries = style === 'app' ? MAIMAI_APP_UI_MANIFEST_ENTRIES : MAIMAI_UI_MANIFEST_ENTRIES;
  const archive = style === 'app' ? MAIMAI_APP_UI_ZIP : MAIMAI_UI_ZIP;
  const emit: ProgressListener = (progress) => { if (!signal?.aborted) onProgress?.(progress); };
  emit({ phase: 'checking', completed: 0, total: entries.length, currentEntry: null });
  const assertGeneration = captureResourceWrites('maimai');
  const pending = inFlight.share(style + ':' + resourceWriteGeneration('maimai'), async (requestSignal) => {
    assertGeneration();
    const assertCurrent = captureResourceWrites('maimai', requestSignal);
    const valid = await isValidUi(directory, entries);
    assertCurrent();
    if (valid) return;
    const temporary = new Directory(Paths.cache, 'rranker-ui-' + Date.now() + '-' + (++uiDownloadSequence));
    temporary.create({ intermediates: true, idempotent: true });
    try { await downloadAndUnpack(directory, temporary, emit, requestSignal, assertCurrent, entries, archive); }
    finally { if (temporary.exists) temporary.delete(); }
  }, signal);
  const fullReady = pending.then(
    () => { emit({ phase: 'ready', completed: entries.length, total: entries.length, currentEntry: null }); },
    (error: unknown) => {
      const message = errorMessage(error);
      emit({ phase: 'error', completed: 0, total: entries.length, currentEntry: null, error: message });
      throw new Error(`素材准备失败：${message}`, { cause: error });
    },
  );
  return { directory, fullReady, files: entries.map(entry => finalPathOf(entry.path)) };
}


export function clearMaimaiUiCache(): void {
  invalidateResourceWrites('maimai');
  const root = new Directory(Paths.document, 'rranker', 'maimai-assets');
  if (root.exists) root.delete();
}
