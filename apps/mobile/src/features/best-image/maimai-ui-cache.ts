import { captureResourceWrites, createInflightGuard, resourceWriteGeneration, invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { downloadChartResource } from '@/features/chart-download-shared/chart-download-shared';
import { sha256 } from '@/utils/resource-integrity';
import { errorMessage } from './best-image-font-cache-core';
import { Directory, File, Paths } from 'expo-file-system';
import JSZip from 'jszip';
import {
  MAIMAI_UI_MANIFEST_ENTRIES,
  MAIMAI_UI_ZIP,
  type MaimaiUiManifestEntry,
} from './maimai-ui-manifest.generated';

/** B50 game 样式拆包素材缓存：Documents/rranker/maimai-assets/{version}/ui/。 */
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
};

type ProgressListener = (progress: MaimaiUiProgress) => void;

let uiDownloadSequence = 0;

export function createMaimaiUiPreparer(
  zipInfo: { url: string; bytes: number; sha256: string } = MAIMAI_UI_ZIP,
  entries: readonly MaimaiUiManifestEntry[] = MAIMAI_UI_MANIFEST_ENTRIES,
) {
  const inFlight = createInflightGuard<string>();

  const directories = () => {
    const directory = new Directory(Paths.document, 'rranker', 'maimai-assets', MAIMAI_UI_CACHE_VERSION);
    const uiDirectory = new Directory(directory, 'ui');
    const temporaryDirectory = new Directory(directory, 'tmp');
    directory.create({ intermediates: true, idempotent: true });
    uiDirectory.create({ intermediates: true, idempotent: true });
    temporaryDirectory.create({ intermediates: true, idempotent: true });
    return { directory, uiDirectory, temporaryDirectory };
  };

  /** zip 内条目带 maimai-ui/ 前缀，落盘时剥掉，使 HTML 可直接用 ui/<文件名> 相对路径引用。 */
  const finalPathOf = (path: string) => path.replace(/^maimai-ui\//u, '');

  async function isValidUi(uiDirectory: Directory): Promise<boolean> {
    for (const entry of entries) {
      const file = new File(uiDirectory, finalPathOf(entry.path));
      if (!file.exists || file.size !== entry.bytes) return false;
      if (await sha256(await file.bytes()) !== entry.sha256) return false;
    }
    return true;
  }

  async function unpack(
    zipBytes: Uint8Array,
    uiDirectory: Directory,
    temporaryDirectory: Directory,
    onEntry: (path: string) => void,
    assertCurrent: () => void,
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
      // 条目可能仍有子目录：移动前确保目标子目录存在（iOS File.move 要求目标目录已存在）
      const slash = finalPath.lastIndexOf('/');
      if (slash > 0) {
        const parent = new Directory(uiDirectory, finalPath.slice(0, slash));
        parent.create({ intermediates: true, idempotent: true });
      }
      const finalFile = new File(uiDirectory, finalPath);
      if (finalFile.exists) finalFile.delete();
      part.move(finalFile);
    }
  }

  async function downloadAndUnpack(
    uiDirectory: Directory,
    temporaryDirectory: Directory,
    onProgress: ProgressListener,
    signal: AbortSignal,
    assertCurrent: () => void,
  ): Promise<void> {
    const archiveFile = new File(temporaryDirectory, 'maimai-ui.zip.part');
    try {
      if (archiveFile.exists) archiveFile.delete();
      onProgress({ phase: 'downloading', completed: 0, total: entries.length, currentEntry: null });
      await downloadChartResource(temporaryDirectory, 'maimai-ui.zip.part', zipInfo.url, signal);
      assertCurrent();
      if (archiveFile.size !== zipInfo.bytes) {
        throw new Error('素材压缩包大小不匹配');
      }
      const archiveBytes = await archiveFile.bytes();
      if (await sha256(archiveBytes) !== zipInfo.sha256) {
        throw new Error('素材压缩包校验失败');
      }
      assertCurrent();
      let done = 0;
      onProgress({ phase: 'unpacking', completed: 0, total: entries.length, currentEntry: null });
      await unpack(archiveBytes, uiDirectory, temporaryDirectory, (path) => {
        done += 1;
        onProgress({ phase: 'unpacking', completed: done, total: entries.length, currentEntry: path });
      }, assertCurrent);
    } finally {
      if (archiveFile.exists) archiveFile.delete();
    }
  }

  return async function prepareMaimaiUi(
    onProgress?: ProgressListener,
    signal?: AbortSignal,
  ): Promise<PreparedMaimaiUi> {
    const { directory, uiDirectory } = directories();
    const emit: ProgressListener = (progress) => { if (!signal?.aborted) onProgress?.(progress); };
    emit({ phase: 'checking', completed: 0, total: entries.length, currentEntry: null });
    const assertGeneration = captureResourceWrites('maimai');
    const pending = inFlight.share(String(resourceWriteGeneration('maimai')), async (requestSignal) => {
      assertGeneration();
      const assertCurrent = captureResourceWrites('maimai', requestSignal);
      const valid = await isValidUi(uiDirectory);
      assertCurrent();
      if (valid) return;
      const temporary = new Directory(Paths.cache, 'rranker-ui-' + Date.now() + '-' + (++uiDownloadSequence));
      temporary.create({ intermediates: true, idempotent: true });
      try { await downloadAndUnpack(uiDirectory, temporary, emit, requestSignal, assertCurrent); }
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
    return { directory, fullReady };
  };
}

export const prepareMaimaiUi = createMaimaiUiPreparer();

/** 清除 B50 game 样式素材本地下载缓存（Documents/rranker/maimai-assets）。 */
export function clearMaimaiUiCache(): void {
  invalidateResourceWrites('maimai');
  const root = new Directory(Paths.document, 'rranker', 'maimai-assets');
  if (root.exists) root.delete();
}
