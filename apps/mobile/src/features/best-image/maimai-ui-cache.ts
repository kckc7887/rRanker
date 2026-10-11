import { captureResourceWrites, createInflightGuard, resourceWriteGeneration, invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { downloadChartResource } from '@/features/chart-download-shared/chart-download-shared';
import { sha256, sha256FileAsync } from '@/utils/resource-integrity';
import { errorMessage } from './best-image-font-cache-core';
import { Directory, File, Paths } from 'expo-file-system';
import JSZip from 'jszip';
import {
  MAIMAI_UI_MANIFEST_ENTRIES,
  MAIMAI_UI_ZIP,
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
};

type ProgressListener = (progress: MaimaiUiProgress) => void;

let uiDownloadSequence = 0;

const inFlight = createInflightGuard<string>();

const directories = () => {
  const directory = new Directory(Paths.document, 'rranker', 'maimai-assets', MAIMAI_UI_CACHE_VERSION);
  const uiDirectory = new Directory(directory, 'ui');
  directory.create({ intermediates: true, idempotent: true });
  uiDirectory.create({ intermediates: true, idempotent: true });
  return { directory, uiDirectory };
};

/** 去掉压缩包根目录，使 HTML 按 ui/ 相对路径读素材。 */
const finalPathOf = (path: string) => path.replace(/^maimai-ui\//u, '');

async function isValidUi(uiDirectory: Directory): Promise<boolean> {
  for (const entry of MAIMAI_UI_MANIFEST_ENTRIES) {
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
): Promise<void> {
  const zip = await JSZip.loadAsync(zipBytes);
  for (const entry of MAIMAI_UI_MANIFEST_ENTRIES) {
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
    /** iOS File.move 要求目标目录已存在。 */
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
    onProgress({ phase: 'downloading', completed: 0, total: MAIMAI_UI_MANIFEST_ENTRIES.length, currentEntry: null });
    await downloadChartResource(temporaryDirectory, 'maimai-ui.zip.part', MAIMAI_UI_ZIP.url, signal);
    assertCurrent();
    if (archiveFile.size !== MAIMAI_UI_ZIP.bytes) {
      throw new Error('素材压缩包大小不匹配');
    }
    if (await sha256FileAsync(archiveFile.uri) !== MAIMAI_UI_ZIP.sha256) {
      throw new Error('素材压缩包校验失败');
    }
    assertCurrent();
    const archiveBytes = await archiveFile.bytes();
    let done = 0;
    onProgress({ phase: 'unpacking', completed: 0, total: MAIMAI_UI_MANIFEST_ENTRIES.length, currentEntry: null });
    await unpack(archiveBytes, uiDirectory, temporaryDirectory, (path) => {
      done += 1;
      onProgress({ phase: 'unpacking', completed: done, total: MAIMAI_UI_MANIFEST_ENTRIES.length, currentEntry: path });
    }, assertCurrent);
  } finally {
    if (archiveFile.exists) archiveFile.delete();
  }
}

export async function prepareMaimaiUi(
  onProgress?: ProgressListener,
  signal?: AbortSignal,
): Promise<PreparedMaimaiUi> {
  const { directory, uiDirectory } = directories();
  const emit: ProgressListener = (progress) => { if (!signal?.aborted) onProgress?.(progress); };
  emit({ phase: 'checking', completed: 0, total: MAIMAI_UI_MANIFEST_ENTRIES.length, currentEntry: null });
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
    () => { emit({ phase: 'ready', completed: MAIMAI_UI_MANIFEST_ENTRIES.length, total: MAIMAI_UI_MANIFEST_ENTRIES.length, currentEntry: null }); },
    (error: unknown) => {
      const message = errorMessage(error);
      emit({ phase: 'error', completed: 0, total: MAIMAI_UI_MANIFEST_ENTRIES.length, currentEntry: null, error: message });
      throw new Error(`素材准备失败：${message}`, { cause: error });
    },
  );
  return { directory, fullReady };
}


export function clearMaimaiUiCache(): void {
  invalidateResourceWrites('maimai');
  const root = new Directory(Paths.document, 'rranker', 'maimai-assets');
  if (root.exists) root.delete();
}
