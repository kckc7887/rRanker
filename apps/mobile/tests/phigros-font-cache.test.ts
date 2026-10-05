import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PHIGROS_FONT_MANIFEST,
  preparePhigrosFonts,
  type PhigrosFontManifestEntry,
} from '@/features/phigros-best-image/phigros-font-cache';

const mockFontFs = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  metadata: new Map<string, { length: number; size: number }>(),
  digests: new Map<string, string>(),
  remotes: new Map<string, Uint8Array | Error | (() => Promise<Uint8Array>)>(),
  downloadCalls: [] as string[],
}));

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: async (_algorithm: string, bytes: Uint8Array) => Uint8Array.from(Buffer.from(
    mockFontFs.digests.get(`${bytes.byteLength}:${Buffer.from(bytes.subarray(0, 64)).toString('hex')}`) ?? createHash('sha256').update(bytes).digest('hex'), 'hex',
  )).buffer,
}));

vi.mock('expo-file-system', () => {
  const joinUri = (base: string | { uri: string }, parts: string[]) => {
    const root = typeof base === 'string' ? base : base.uri;
    return `${root.replace(/\/+$/u, '')}/${parts.map((part) => part.replace(/^\/+|\/+$/gu, '')).join('/')}`;
  };
  class Directory {
    readonly uri: string;
    constructor(base: string | { uri: string }, ...parts: string[]) { this.uri = joinUri(base, parts); }
    create() {}
    get exists() { return true; }
    delete() { for (const uri of [...mockFontFs.files.keys()]) if (uri.startsWith(this.uri)) mockFontFs.files.delete(uri); }
  }
  class File {
    uri: string;
    constructor(base: string | { uri: string }, ...parts: string[]) { this.uri = joinUri(base, parts); }
    get exists() { return mockFontFs.files.has(this.uri); }
    get size() {
      const bytes = mockFontFs.files.get(this.uri);
      if (!bytes) return 0;
      const name = this.uri.split('/').at(-1)!.replace(/\.part$/u, '');
      const metadata = mockFontFs.metadata.get(name);
      return metadata?.length === bytes.byteLength ? metadata.size : bytes.byteLength;
    }
    async bytes() { return Uint8Array.from(mockFontFs.files.get(this.uri) ?? []); }
    create() { mockFontFs.files.set(this.uri, new Uint8Array()); }
    write(content: Uint8Array) { mockFontFs.files.set(this.uri, Uint8Array.from(content)); }
    delete() { mockFontFs.files.delete(this.uri); }
    move(destination: File) {
      const bytes = mockFontFs.files.get(this.uri);
      if (!bytes) throw new Error('source does not exist');
      mockFontFs.files.set(destination.uri, bytes);
      mockFontFs.files.delete(this.uri);
      this.uri = destination.uri;
    }
    static async downloadFileAsync(url: string, destination: File) {
      mockFontFs.downloadCalls.push(url);
      const remote = mockFontFs.remotes.get(url);
      if (remote instanceof Error) {
        mockFontFs.files.set(destination.uri, new Uint8Array([1, 2, 3]));
        throw remote;
      }
      const bytes = typeof remote === 'function' ? await remote() : remote;
      if (!bytes) throw new Error(`missing remote ${url}`);
      mockFontFs.files.set(destination.uri, Uint8Array.from(bytes));
      return destination;
    }
  }
  return { Directory, File, Paths: { document: new Directory('file://', 'document'), cache: new Directory('file://', 'cache') } };
});

async function fixtureEntry(entry: PhigrosFontManifestEntry): Promise<Uint8Array> {
  const font = new Uint8Array(entry.fontBytes); font.set(Buffer.from(`font:${entry.name}`));
  const zip = await new JSZip().file(entry.archiveEntryName, font).generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  mockFontFs.remotes.set(entry.url, zip);
  mockFontFs.metadata.set(entry.archiveFileName, { length: zip.byteLength, size: entry.archiveBytes });
  mockFontFs.metadata.set(entry.cssFileName, { length: font.byteLength, size: entry.fontBytes });
  mockFontFs.digests.set(`${zip.byteLength}:${Buffer.from(zip.subarray(0, 64)).toString('hex')}`, entry.archiveSha256);
  mockFontFs.digests.set(`${font.byteLength}:${Buffer.from(font.subarray(0, 64)).toString('hex')}`, entry.fontSha256);
  return zip;
}

const core = PHIGROS_FONT_MANIFEST.filter(entry => entry.core);
const extension = PHIGROS_FONT_MANIFEST.find(entry => !entry.core)!;
const prepare = (names: readonly string[] = []) => preparePhigrosFonts(undefined, { neededNames: names });
const cached = (name: string) => [...mockFontFs.files.keys()].find(uri => uri.endsWith(`/font/${name}`));

describe('Phigros remote font cache', () => {
  beforeEach(async () => {
    mockFontFs.files.clear(); mockFontFs.remotes.clear(); mockFontFs.metadata.clear(); mockFontFs.digests.clear();
    mockFontFs.downloadCalls.length = 0;
    for (const entry of [...core, extension]) await fixtureEntry(entry);
  });

  it('makes core fonts available before requested extensions, and reuses intact files', async () => {
    const progress: string[] = [];
    const prepared = await preparePhigrosFonts(value => progress.push(value.phase), { neededNames: [extension.name] });
    for (const entry of core) expect(cached(entry.cssFileName)).toBeTruthy();
    expect(progress).toContain('core-ready');
    await prepared.fullReady;
    expect(cached(extension.cssFileName)).toBeTruthy();
    expect(progress.at(-1)).toBe('ready');
    mockFontFs.remotes.clear();
    await (await prepare([extension.name])).fullReady;
    expect([...mockFontFs.files.keys()].filter(uri => uri.includes('/font/'))).toHaveLength(core.length + 1);
  });

  it('replaces a corrupt cached font', async () => {
    await (await prepare()).fullReady;
    const uri = cached(core[0]!.cssFileName)!;
    const valid = mockFontFs.files.get(uri)!;
    const corrupt = Uint8Array.from(valid); corrupt[0] ^= 0xff; mockFontFs.files.set(uri, corrupt);
    await (await prepare()).fullReady;
    expect(createHash('sha256').update(mockFontFs.files.get(uri)!).digest('hex')).toBe(createHash('sha256').update(valid).digest('hex'));
  });

  it('keeps core fonts when an extension download fails and can retry it', async () => {
    const archive = mockFontFs.remotes.get(extension.url)!;
    mockFontFs.remotes.set(extension.url, new Error('network down'));
    const prepared = await prepare([extension.name]);
    await expect(prepared.fullReady).rejects.toThrow('扩展字体准备失败');
    for (const entry of core) expect(cached(entry.cssFileName)).toBeTruthy();
    expect(cached(extension.cssFileName)).toBeUndefined();
    mockFontFs.remotes.set(extension.url, archive);
    await (await prepare([extension.name])).fullReady;
    expect(cached(extension.cssFileName)).toBeTruthy();
  });

  it('rejects invalid archive size or hash before publishing a font', async () => {
    const target = core[0]!;
    const valid = mockFontFs.remotes.get(target.url) as Uint8Array;
    mockFontFs.remotes.set(target.url, Uint8Array.from([...valid, 0]));
    await expect(prepare()).rejects.toThrow('压缩包大小不匹配');
    expect(cached(target.cssFileName)).toBeUndefined();
    const corrupt = Uint8Array.from(valid); corrupt[0] ^= 0xff;
    mockFontFs.remotes.set(target.url, corrupt);
    await expect(prepare()).rejects.toThrow('压缩包校验失败');
    expect(cached(target.cssFileName)).toBeUndefined();
  });

  it('rejects missing archive content without publishing the bad font', async () => {
    const target = core[0]!;
    const wrong = await new JSZip().file('other.ttf', 'font').generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    mockFontFs.remotes.set(target.url, wrong);
    mockFontFs.metadata.set(target.archiveFileName, { length: wrong.byteLength, size: target.archiveBytes });
    mockFontFs.digests.set(`${wrong.byteLength}:${Buffer.from(wrong.subarray(0, 64)).toString('hex')}`, target.archiveSha256);
    await expect(prepare()).rejects.toThrow('压缩包内容不符合预期');
    expect(cached(target.cssFileName)).toBeUndefined();
  });

  it('downloads only core fonts when no extensions are needed', async () => {
    await (await prepare()).fullReady;
    expect(new Set(mockFontFs.downloadCalls)).toEqual(new Set(core.map(entry => entry.url)));
    expect(cached(extension.cssFileName)).toBeUndefined();
  });
});

vi.mock('@/features/chart-download-shared/chart-download-shared', async () => {
  const { File } = await import('expo-file-system');
  return { downloadChartResource: (directory: import('expo-file-system').Directory, name: string, url: string) => File.downloadFileAsync(url, new File(directory, name)) };
});
