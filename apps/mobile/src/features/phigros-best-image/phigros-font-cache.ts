import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import JSZip from 'jszip';

const FONT_BASE_URL = 'https://rranker-phigros-data.cn-nb1.rains3.com/fonts';
export const PHIGROS_FONT_CACHE_VERSION = 'v1';

export type PhigrosFontManifestEntry = {
  name: string;
  cssFileName: string;
  archiveFileName: string;
  archiveEntryName: string;
  url: string;
  archiveBytes: number;
  archiveSha256: string;
  fontBytes: number;
  fontSha256: string;
  core: boolean;
};

function fontEntry(
  name: string,
  archiveBytes: number,
  archiveSha256: string,
  fontBytes: number,
  fontSha256: string,
  core = false,
  cssFileName = `${name}.ttf`,
): PhigrosFontManifestEntry {
  const archiveFileName = `${name}.zip`;
  return {
    name,
    cssFileName,
    archiveFileName,
    archiveEntryName: `${name}.ttf`,
    url: `${FONT_BASE_URL}/${encodeURIComponent(archiveFileName)}`,
    archiveBytes,
    archiveSha256,
    fontBytes,
    fontSha256,
    core,
  };
}

export const PHIGROS_FONT_MANIFEST: readonly PhigrosFontManifestEntry[] = [
  fontEntry('phi', 5_356_111, '643c0034eebc7a421bcab120733ebd059d9ae59f62fa2fdf3402ed4aada53d75', 8_473_168, 'ee10bff7853ee617e2672a25ad1aa510747ee10b162557c70196c978271ffd6a', true),
  fontEntry('Aldrich-Regular', 25_575, '969a24117c87683ab8e507b19aa662dfcf5f63b09ac2818ce7cede27030e998e', 53_324, '4441ed91b9726b93e39cb3b438f0f929ee4e91be8d06827ab496e7ac1beaf5cf', true),
  fontEntry('NotoSansArabic', 349_276, '756677a0ea1ad29e3e99a38812ce78c1b66392ad6d7bd14a5eba57db1a789d23', 765_740, 'ee489b994b3e62def9874c918145e32b133b625abaf98cec60502bdb40102c56'),
  fontEntry('NotoSansSymbols2', 529_497, '8ade2f40f6c54ee6e7b0b71c7b1573142dd490b9f3849b38b7ac1843a00e3cf6', 1_214_812, '89bc5910a17d9c99f98a4013cb82c844971b5966b42b2903a5e5a1f47e5d25c8'),
  fontEntry('NotoSans-Regular', 263_735, '1701f1f764ce1082e31a1bbf984b62fb8c44359cde18919e3b2783a6f24c9a60', 556_216, '2ec33f84606cbaa0a1a944488e14f97faf2f6a25ecdd8354f5358f06da13c7d9'),
  fontEntry('NotoSansJP', 5_826_846, 'f13cafa8954d6c5e84f3468c83f85ff165b4763a11b4187a69c38caa12443c78', 9_532_768, 'd0a07584de49d2e79ed831cea5aa2f18086986e0bccf8b0c3742b36408bf3de7'),
  fontEntry('NotoSansKannada', 292_259, '3072bd87c6bdd621b854a32e142fe62dc622db8b3992ffdfa21c76b175a0f919', 559_224, '126c3db93826445ce5ebada9cbbdd8ce8653588390833e9d1178e767b05fbf66'),
  fontEntry('NotoSansCanadianAboriginal', 135_038, '504a506f83f66222061464e1c9825f23df0402c4c831d86d12086b7c7a50a1e8', 260_284, 'f9788b6c19775722b2c89212218f6b0703ad848e8b425e90d6be8866d1e95827'),
  fontEntry('NotoColorEmoji-Regular', 7_581_378, 'c04e2b4d1b7b2f1ba55fd0004a089f567049fca51ff112dde9ecd2af05e0cea2', 24_015_992, 'a6ed1ecf278da058568b79d71438a0d789efe749b54b7f65135a6a1a5739bdc7'),
  fontEntry('HIMALAYA', 323_535, '8aa5d8efe3cd771d4c2b0e8f6f94d62b5950c243019753d85cf375ee9e77a707', 572_776, 'fdec3a7efacd57913d3c14111837908ccbabea5b0b44ec62527eb73acf743afb', false, 'HIMALAYA.TTF'),
  fontEntry('吞弥恰俊', 153_155, '55aa9a62a18eca466813e84ddace6c1cf7cd5cf382d83d0bdec5cb20afb5cfda', 354_616, 'a3acee6b972901266b6d36e3b3b027ab6c7ddd621125922503c453535aef05d5'),
  fontEntry('NotoSansMath-Regular', 318_438, 'ae9a20127f4fe8c02dd4671545651baba93c121d78f5ec68ca82facbdad90971', 586_780, 'e1b12670fd0fd466a643f19a73ab48343cb7fe4702afa59183e7be8b47a90912'),
];

export type PhigrosFontProgressPhase =
  | 'checking'
  | 'downloading-core'
  | 'core-ready'
  | 'downloading-extensions'
  | 'ready'
  | 'error';

export type PhigrosFontProgress = {
  phase: PhigrosFontProgressPhase;
  completed: number;
  total: number;
  currentFont: string | null;
  error?: string;
};

export type PreparedPhigrosFonts = {
  directory: Directory;
  fullReady: Promise<void>;
};

type ProgressListener = (progress: PhigrosFontProgress) => void;

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

export type PreparePhigrosFontsOptions = {
  /** 仅准备这些字体；未提供时准备完整清单。核心字体始终包含。 */
  neededNames?: readonly string[];
};

export function createPhigrosFontPreparer(
  manifest: readonly PhigrosFontManifestEntry[] = PHIGROS_FONT_MANIFEST,
) {
  const inFlightFonts = new Map<string, Promise<File>>();

  const directories = () => {
    const directory = new Directory(Paths.document, 'rranker', 'phigros-fonts', PHIGROS_FONT_CACHE_VERSION);
    const fontDirectory = new Directory(directory, 'font');
    const temporaryDirectory = new Directory(directory, 'tmp');
    directory.create({ intermediates: true, idempotent: true });
    fontDirectory.create({ intermediates: true, idempotent: true });
    temporaryDirectory.create({ intermediates: true, idempotent: true });
    return { directory, fontDirectory, temporaryDirectory };
  };

  async function isValidFont(file: File, entry: PhigrosFontManifestEntry): Promise<boolean> {
    if (!file.exists || file.size !== entry.fontBytes) return false;
    return await sha256(await file.bytes()) === entry.fontSha256;
  }

  async function downloadFont(
    entry: PhigrosFontManifestEntry,
    fontDirectory: Directory,
    temporaryDirectory: Directory,
  ): Promise<File> {
    const finalFile = new File(fontDirectory, entry.cssFileName);
    const archiveFile = new File(temporaryDirectory, `${entry.archiveFileName}.part`);
    const fontPartFile = new File(temporaryDirectory, `${entry.cssFileName}.part`);
    let fontPartMoved = false;
    try {
      if (archiveFile.exists) archiveFile.delete();
      if (fontPartFile.exists) fontPartFile.delete();
      await File.downloadFileAsync(entry.url, archiveFile, { idempotent: true });
      if (archiveFile.size !== entry.archiveBytes) {
        throw new Error(`${entry.name} 压缩包大小不匹配`);
      }
      const archiveBytes = await archiveFile.bytes();
      if (await sha256(archiveBytes) !== entry.archiveSha256) {
        throw new Error(`${entry.name} 压缩包校验失败`);
      }
      const zip = await JSZip.loadAsync(archiveBytes);
      const files = Object.values(zip.files).filter((file) => !file.dir);
      if (files.length !== 1 || files[0]?.name !== entry.archiveEntryName) {
        throw new Error(`${entry.name} 压缩包内容不符合预期`);
      }
      const fontBytes = await files[0].async('uint8array');
      if (fontBytes.byteLength !== entry.fontBytes || await sha256(fontBytes) !== entry.fontSha256) {
        throw new Error(`${entry.name} 字体校验失败`);
      }
      fontPartFile.create({ overwrite: true });
      fontPartFile.write(fontBytes);
      if (finalFile.exists) finalFile.delete();
      fontPartFile.move(finalFile);
      fontPartMoved = true;
      return finalFile;
    } finally {
      if (archiveFile.exists) archiveFile.delete();
      if (!fontPartMoved && fontPartFile.exists) fontPartFile.delete();
    }
  }

  async function ensureFont(
    entry: PhigrosFontManifestEntry,
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

  return async function preparePhigrosFonts(
    onProgress?: ProgressListener,
    options?: PreparePhigrosFontsOptions,
  ): Promise<PreparedPhigrosFonts> {
    const { directory, fontDirectory, temporaryDirectory } = directories();
    const neededSet = options?.neededNames ? new Set(options.neededNames) : null;
    const selected = neededSet
      ? manifest.filter((entry) => entry.core || neededSet.has(entry.name))
      : [...manifest];
    const completed = new Set<string>();
    const total = selected.length;
    const emit = (phase: PhigrosFontProgressPhase, currentFont: string | null, error?: string) => {
      onProgress?.({ phase, completed: completed.size, total, currentFont, error });
    };
    const core = selected.filter((entry) => entry.core);
    const extensions = selected.filter((entry) => !entry.core);
    emit('checking', null);
    try {
      await Promise.all(core.map(async (entry) => {
        await ensureFont(entry, fontDirectory, temporaryDirectory, () => emit('downloading-core', entry.name));
        completed.add(entry.name);
        emit('downloading-core', entry.name);
      }));
    } catch (error) {
      const message = errorMessage(error);
      emit('error', null, message);
      throw new Error(`核心字体准备失败：${message}`, { cause: error });
    }
    emit('core-ready', null);

    const fullReady = (async () => {
      try {
        for (const entry of extensions) {
          emit('checking', entry.name);
          await ensureFont(entry, fontDirectory, temporaryDirectory, () => emit('downloading-extensions', entry.name));
          completed.add(entry.name);
          emit('downloading-extensions', entry.name);
        }
        emit('ready', null);
      } catch (error) {
        const message = errorMessage(error);
        emit('error', null, message);
        throw new Error(`扩展字体准备失败：${message}`, { cause: error });
      }
    })();
    return { directory, fullReady };
  };
}

export const preparePhigrosFonts = createPhigrosFontPreparer();
