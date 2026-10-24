import { captureResourceWrites, createInflightGuard, resourceWriteGeneration } from '@/services/snapshot-cache-utils';
import { downloadChartResource } from '@/features/chart-download-shared/chart-download-shared';
import { sha256, sha256FileAsync } from '@/utils/resource-integrity';
import { errorMessage } from './best-image-font-cache-core';
import { Directory, File, Paths } from 'expo-file-system';
import JSZip from 'jszip';
export type UiManifestEntry = { path: string; bytes: number; sha256: string; targetPath?: string };
export type UiArchive = { url: string; bytes: number; sha256: string };

export type UiProgressPhase =
  | 'checking'
  | 'downloading'
  | 'unpacking'
  | 'ready'
  | 'error';

export type UiProgress = {
  phase: UiProgressPhase;
  completed: number;
  total: number;
  currentEntry: string | null;
  error?: string;
};

export type PreparedUi = {
  directory: Directory;
  fullReady: Promise<void>;
  files: readonly string[];
};

type ProgressListener = (progress: UiProgress) => void;

export function bestImageUiProgress(progress: UiProgress): number {
  const fraction = progress.total > 0 ? progress.completed / progress.total : 0;
  return progress.phase === 'ready' ? .95
    : progress.phase === 'unpacking' ? .8 + .15 * fraction
      : progress.phase === 'downloading' ? .8 * fraction : 0;
}

let uiDownloadSequence = 0;

const inFlight = createInflightGuard<string>();

async function isValidUi(uiDirectory: Directory, entries: readonly UiManifestEntry[]): Promise<boolean> {
  for (const entry of entries) {
    const file = new File(uiDirectory, (entry.targetPath ?? entry.path));
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
  entries: readonly UiManifestEntry[],
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
    const finalPath = (entry.targetPath ?? entry.path);
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
  entries: readonly UiManifestEntry[],
  archive: UiArchive,
): Promise<void> {
  const archiveFile = new File(temporaryDirectory, 'ui.zip.part');
  try {
    if (archiveFile.exists) archiveFile.delete();
    onProgress({ phase: 'downloading', completed: 0, total: archive.bytes, currentEntry: null });
    await downloadChartResource(temporaryDirectory, 'ui.zip.part', archive.url, signal, progress => {
      onProgress({ phase: 'downloading', completed: progress.totalBytesWritten,
        total: archive.bytes, currentEntry: null });
    });
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

export async function prepareBestImageUi(
  scope: string,
  directory: Directory,
  entries: readonly UiManifestEntry[],
  archive: UiArchive,
  onProgress?: ProgressListener,
  signal?: AbortSignal,
): Promise<PreparedUi> {
  directory.create({ intermediates: true, idempotent: true });
  const emit: ProgressListener = (progress) => { if (!signal?.aborted) onProgress?.(progress); };
  emit({ phase: 'checking', completed: 0, total: entries.length, currentEntry: null });
  const assertGeneration = captureResourceWrites(scope);
  const pending = inFlight.share(directory.uri + ':' + archive.sha256 + ':' + resourceWriteGeneration(scope), async (requestSignal) => {
    assertGeneration();
    const assertCurrent = captureResourceWrites(scope, requestSignal);
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
  return { directory, fullReady, files: entries.map(entry => (entry.targetPath ?? entry.path)) };
}


