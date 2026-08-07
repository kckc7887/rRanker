import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

/** 舞萌导出图思源黑体字体源：对象存储 rranker-maimai-data/fonts。 */
const FONT_BASE_URL = 'https://rranker-maimai-data.cn-nb1.rains3.com/fonts';
export const MAIMAI_FONT_CACHE_VERSION = 'v1';

export type MaimaiFontManifestEntry = {
  name: string;
  /** 对象存储中的文件名（下载源）。 */
  fileName: string;
  /** 缓存目录中的文件名（HTML @font-face 相对路径引用）。 */
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

function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const stableBytes = new Uint8Array(bytes.byteLength);
  stableBytes.set(bytes);
  return bytesToHex(await digest(CryptoDigestAlgorithm.SHA256, stableBytes));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createMaimaiFontPreparer(
  manifest: readonly MaimaiFontManifestEntry[] = MAIMAI_FONT_MANIFEST,
) {
  const inFlightFonts = new Map<string, Promise<File>>();

  const directories = () => {
    const directory = new Directory(Paths.document, 'rranker', 'maimai-fonts', MAIMAI_FONT_CACHE_VERSION);
    const fontDirectory = new Directory(directory, 'font');
    const temporaryDirectory = new Directory(directory, 'tmp');
    directory.create({ intermediates: true, idempotent: true });
    fontDirectory.create({ intermediates: true, idempotent: true });
    temporaryDirectory.create({ intermediates: true, idempotent: true });
    return { directory, fontDirectory, temporaryDirectory };
  };

  async function isValidFont(file: File, entry: MaimaiFontManifestEntry): Promise<boolean> {
    if (!file.exists || file.size !== entry.fontBytes) return false;
    return await sha256(await file.bytes()) === entry.fontSha256;
  }

  async function downloadFont(
    entry: MaimaiFontManifestEntry,
    fontDirectory: Directory,
    temporaryDirectory: Directory,
  ): Promise<File> {
    const finalFile = new File(fontDirectory, entry.cssFileName);
    const fontPartFile = new File(temporaryDirectory, `${entry.cssFileName}.part`);
    let fontPartMoved = false;
    try {
      if (fontPartFile.exists) fontPartFile.delete();
      await File.downloadFileAsync(entry.url, fontPartFile, { idempotent: true });
      if (fontPartFile.size !== entry.fontBytes) {
        throw new Error(`${entry.name} 字体大小不匹配`);
      }
      const fontBytes = await fontPartFile.bytes();
      if (await sha256(fontBytes) !== entry.fontSha256) {
        throw new Error(`${entry.name} 字体校验失败`);
      }
      if (finalFile.exists) finalFile.delete();
      fontPartFile.move(finalFile);
      fontPartMoved = true;
      return finalFile;
    } finally {
      if (!fontPartMoved && fontPartFile.exists) fontPartFile.delete();
    }
  }

  async function ensureFont(
    entry: MaimaiFontManifestEntry,
    fontDirectory: Directory,
    temporaryDirectory: Directory,
    onDownloadStart: () => void,
  ): Promise<File> {
    const file = new File(fontDirectory, entry.cssFileName);
    if (await isValidFont(file, entry)) return file;
    if (file.exists) file.delete();
    const existing = inFlightFonts.get(entry.name);
    if (existing) return existing;
    onDownloadStart();
    const pending = downloadFont(entry, fontDirectory, temporaryDirectory)
      .finally(() => inFlightFonts.delete(entry.name));
    inFlightFonts.set(entry.name, pending);
    return pending;
  }

  return async function prepareMaimaiFonts(
    onProgress?: ProgressListener,
  ): Promise<PreparedMaimaiFonts> {
    const { directory, fontDirectory, temporaryDirectory } = directories();
    const emit = (phase: MaimaiFontProgressPhase, currentFont: string | null, error?: string) => {
      onProgress?.({ phase, completed: 0, total: manifest.length, currentFont, error });
    };
    emit('checking', null);
    const fullReady = (async () => {
      try {
        for (const entry of manifest) {
          await ensureFont(entry, fontDirectory, temporaryDirectory, () => emit('downloading', entry.name));
        }
        emit('ready', null);
      } catch (error) {
        const message = errorMessage(error);
        emit('error', null, message);
        throw new Error(`字体准备失败：${message}`, { cause: error });
      }
    })();
    return { directory, fullReady };
  };
}

export const prepareMaimaiFonts = createMaimaiFontPreparer();

/** 清除成绩图字体本地下载缓存（Documents/rranker/maimai-fonts）。 */
export function clearMaimaiFontCache(): void {
  const root = new Directory(Paths.document, 'rranker', 'maimai-fonts');
  if (root.exists) root.delete();
}
