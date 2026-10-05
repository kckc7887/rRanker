import { downloadChartResource } from '@/features/chart-download-shared/chart-download-shared';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { Directory, File } from 'expo-file-system';
import {
  clearFontCacheDirectory,
  ensureFontCacheDirectories,
  createFontCacheGuard,
  errorMessage,
  sha256,
} from './best-image-font-cache-core';

const FONT_BASE_URL = 'https://rranker-maimai-data.cn-nb1.rains3.com/fonts';
export const MAIMAI_FONT_CACHE_VERSION = 'v1';

export type MaimaiFontManifestEntry = {
  name: string;

  fileName: string;

  cssFileName: string;
  url: string;
  fontBytes: number;
  fontSha256: string;
};

const FONT_ENTRY: MaimaiFontManifestEntry = {
  name: 'maimai-noto',
  fileName: 'NotoSansCJKsc-VF.ttf',
  cssFileName: 'maimai-noto.ttf',
  url: `${FONT_BASE_URL}/${encodeURIComponent('NotoSansCJKsc-VF.ttf')}`,
  fontBytes: 36_144_788,
  fontSha256: '990c807e79c25662a5a9ecf7f971baeb2bf2eab9a559e5ecf15cdfdb8561d21f',
};

export const MAIMAI_FONT_MANIFEST: readonly MaimaiFontManifestEntry[] = [FONT_ENTRY];

export type MaimaiFontProgressPhase =
  | 'checking'
  | 'downloading'
  | 'ready'
  | 'error';

export type MaimaiFontProgress = {
  phase: MaimaiFontProgressPhase;
  completed: number;
  total: number;
  currentFont: string | null;
  error?: string;
};

export type PreparedMaimaiFonts = {
  directory: Directory;
  fullReady: Promise<void>;
};

type ProgressListener = (progress: MaimaiFontProgress) => void;


async function downloadFont(
  entry: MaimaiFontManifestEntry,
  fontDirectory: Directory,
  temporaryDirectory: Directory,
  signal: AbortSignal,
  assertCurrent: () => void,
): Promise<File> {
  const finalFile = new File(fontDirectory, entry.cssFileName);
  const fontPartFile = new File(temporaryDirectory, `${entry.cssFileName}.part`);
  let fontPartMoved = false;
  try {
    if (fontPartFile.exists) fontPartFile.delete();
    await downloadChartResource(temporaryDirectory, `${entry.cssFileName}.part`, entry.url, signal);
    assertCurrent();
    if (fontPartFile.size !== entry.fontBytes) {
      throw new Error(`${entry.name} 字体大小不匹配`);
    }
    const fontBytes = await fontPartFile.bytes();
    if (await sha256(fontBytes) !== entry.fontSha256) {
      throw new Error(`${entry.name} 字体校验失败`);
    }
    assertCurrent();
    if (finalFile.exists) finalFile.delete();
    fontPartFile.move(finalFile);
    fontPartMoved = true;
    return finalFile;
  } finally {
    if (!fontPartMoved && fontPartFile.exists) fontPartFile.delete();
  }
}

const { ensureFont } = createFontCacheGuard({ downloadFont, scope: 'maimai' });

export async function prepareMaimaiFonts(
  onProgress?: ProgressListener,
  signal?: AbortSignal,
): Promise<PreparedMaimaiFonts> {
  const { directory, fontDirectory } = ensureFontCacheDirectories('maimai-assets', MAIMAI_FONT_CACHE_VERSION);
  const emit = (phase: MaimaiFontProgressPhase, currentFont: string | null, error?: string) => {
    if (!signal?.aborted) onProgress?.({ phase, completed: 0, total: MAIMAI_FONT_MANIFEST.length, currentFont, error });
  };
  emit('checking', null);
  const fullReady = (async () => {
    try {
      for (const entry of MAIMAI_FONT_MANIFEST) {
        await ensureFont(entry, fontDirectory, () => emit('downloading', entry.name), signal);
      }
      emit('ready', null);
    } catch (error) {
      const message = errorMessage(error);
      emit('error', null, message);
      throw new Error(`字体准备失败：${message}`, { cause: error });
    }
  })();
  return { directory, fullReady };
}


export function clearMaimaiFontCache(): void {
  invalidateResourceWrites('maimai');
  clearFontCacheDirectory('maimai-assets');
}
