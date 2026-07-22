import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PHIGROS_FONT_MANIFEST,
  createPhigrosFontPreparer,
  type PhigrosFontManifestEntry,
  type PhigrosFontProgress,
} from '@/features/phigros-best-image/phigros-font-cache';

const mockFontFs = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  remotes: new Map<string, Uint8Array | Error | (() => Promise<Uint8Array>)>(),
  downloadCalls: [] as string[],
}));

vi.mock('expo-file-system', () => {
  const joinUri = (base: string | { uri: string }, parts: string[]) => {
    const root = typeof base === 'string' ? base : base.uri;
    return `${root.replace(/\/+$/u, '')}/${parts.map((part) => part.replace(/^\/+|\/+$/gu, '')).join('/')}`;
  };
  class Directory {
    readonly uri: string;
    constructor(base: string | { uri: string }, ...parts: string[]) { this.uri = joinUri(base, parts); }
    create() { /* in-memory directories always exist */ }
  }
  class File {
    uri: string;
    constructor(base: string | { uri: string }, ...parts: string[]) { this.uri = joinUri(base, parts); }
    get exists() { return mockFontFs.files.has(this.uri); }
    get size() { return mockFontFs.files.get(this.uri)?.byteLength ?? 0; }
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
  return { Directory, File, Paths: { document: new Directory('file://', 'document') } };
});

function hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fixtureEntry(name: string, core: boolean, contents = `font:${name}`): Promise<PhigrosFontManifestEntry> {
  const fontBytes = Uint8Array.from(Buffer.from(contents));
  const archiveEntryName = `${name}.ttf`;
  const zip = new JSZip();
  zip.file(archiveEntryName, fontBytes);
  const archive = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const url = `https://fonts.test/${name}.zip`;
  mockFontFs.remotes.set(url, archive);
  return {
    name,
    cssFileName: archiveEntryName,
    archiveFileName: `${name}.zip`,
    archiveEntryName,
    url,
    archiveBytes: archive.byteLength,
    archiveSha256: hex(archive),
    fontBytes: fontBytes.byteLength,
    fontSha256: hex(fontBytes),
    core,
  };
}

describe('Phigros remote font cache', () => {
  beforeEach(() => {
    mockFontFs.files.clear();
    mockFontFs.remotes.clear();
    mockFontFs.downloadCalls.length = 0;
  });

  it('pins all verified public font archives and the HIMALAYA CSS filename', () => {
    expect(PHIGROS_FONT_MANIFEST).toHaveLength(12);
    expect(PHIGROS_FONT_MANIFEST.filter((entry) => entry.core).map((entry) => entry.name)).toEqual(['phi', 'Aldrich-Regular']);
    expect(PHIGROS_FONT_MANIFEST.every((entry) => entry.url.startsWith('https://rranker-phigros-data.cn-nb1.rains3.com/fonts/'))).toBe(true);
    expect(PHIGROS_FONT_MANIFEST.find((entry) => entry.name === 'HIMALAYA')).toMatchObject({
      archiveEntryName: 'HIMALAYA.ttf', cssFileName: 'HIMALAYA.TTF',
    });
  });

  it('makes core fonts available first, then fills extensions sequentially and reuses cache', async () => {
    const manifest = [
      await fixtureEntry('core-a', true),
      await fixtureEntry('core-b', true),
      await fixtureEntry('extension-a', false),
      await fixtureEntry('extension-b', false),
    ];
    const progress: PhigrosFontProgress[] = [];
    const prepare = createPhigrosFontPreparer(manifest);
    const prepared = await prepare((value) => progress.push(value));
    expect(progress.some((value) => value.phase === 'core-ready' && value.completed === 2)).toBe(true);
    await prepared.fullReady;
    expect(progress.at(-1)).toMatchObject({ phase: 'ready', completed: 4, total: 4 });
    expect(mockFontFs.downloadCalls.slice(2)).toEqual([
      'https://fonts.test/extension-a.zip', 'https://fonts.test/extension-b.zip',
    ]);
    expect([...mockFontFs.files.keys()].filter((uri) => uri.includes('/font/'))).toHaveLength(4);
    expect([...mockFontFs.files.keys()].some((uri) => uri.includes('/tmp/'))).toBe(false);

    const downloads = mockFontFs.downloadCalls.length;
    const cached = await prepare();
    await cached.fullReady;
    expect(mockFontFs.downloadCalls).toHaveLength(downloads);
  });

  it('redownloads a same-size cached font when its hash is corrupted', async () => {
    const entry = await fixtureEntry('core', true);
    const prepare = createPhigrosFontPreparer([entry]);
    const first = await prepare();
    await first.fullReady;
    const cachedUri = [...mockFontFs.files.keys()].find((uri) => uri.endsWith('/font/core.ttf'))!;
    const corrupted = Uint8Array.from(mockFontFs.files.get(cachedUri)!);
    corrupted[0] = corrupted[0]! ^ 0xff;
    mockFontFs.files.set(cachedUri, corrupted);

    const second = await prepare();
    await second.fullReady;
    expect(mockFontFs.downloadCalls).toEqual([entry.url, entry.url]);
    expect(hex(mockFontFs.files.get(cachedUri)!)).toBe(entry.fontSha256);
  });

  it('deduplicates concurrent downloads for the same font', async () => {
    const entry = await fixtureEntry('shared-core', true);
    const archive = mockFontFs.remotes.get(entry.url) as Uint8Array;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    mockFontFs.remotes.set(entry.url, async () => { await gate; return archive; });
    const prepare = createPhigrosFontPreparer([entry]);
    const first = prepare();
    const second = prepare();
    await Promise.resolve();
    expect(mockFontFs.downloadCalls).toEqual([entry.url]);
    release();
    const results = await Promise.all([first, second]);
    await Promise.all(results.map((result) => result.fullReady));
    expect(mockFontFs.downloadCalls).toEqual([entry.url]);
  });

  it('keeps the core preview cache when an extension fails and retries only the extension', async () => {
    const core = await fixtureEntry('core', true);
    const extension = await fixtureEntry('extension', false);
    const validArchive = mockFontFs.remotes.get(extension.url) as Uint8Array;
    mockFontFs.remotes.set(extension.url, new Error('network down'));
    const prepare = createPhigrosFontPreparer([core, extension]);
    const prepared = await prepare();
    await expect(prepared.fullReady).rejects.toThrow('扩展字体准备失败');
    expect([...mockFontFs.files.keys()].some((uri) => uri.endsWith('/font/core.ttf'))).toBe(true);
    expect([...mockFontFs.files.keys()].some((uri) => uri.includes('/tmp/'))).toBe(false);

    mockFontFs.remotes.set(extension.url, validArchive);
    const retried = await prepare();
    await retried.fullReady;
    expect(mockFontFs.downloadCalls.filter((url) => url === core.url)).toHaveLength(1);
    expect(mockFontFs.downloadCalls.filter((url) => url === extension.url)).toHaveLength(2);
  });

  it('rejects an unexpected ZIP entry or hash and leaves no final or partial font', async () => {
    const entry = await fixtureEntry('broken', true);
    const wrongZip = new JSZip();
    wrongZip.file('other.ttf', 'wrong');
    const archive = await wrongZip.generateAsync({ type: 'uint8array' });
    mockFontFs.remotes.set(entry.url, archive);
    const brokenManifest = [{ ...entry, archiveBytes: archive.byteLength, archiveSha256: hex(archive) }];
    await expect(createPhigrosFontPreparer(brokenManifest)()).rejects.toThrow('压缩包内容不符合预期');
    expect(mockFontFs.files.size).toBe(0);
  });

  it('rejects archive size, archive hash, and extracted font hash mismatches', async () => {
    const sizeEntry = await fixtureEntry('wrong-size', true);
    const sizeArchive = mockFontFs.remotes.get(sizeEntry.url) as Uint8Array;
    mockFontFs.remotes.set(sizeEntry.url, Uint8Array.from([...sizeArchive, 0]));
    await expect(createPhigrosFontPreparer([sizeEntry])()).rejects.toThrow('压缩包大小不匹配');
    expect(mockFontFs.files.size).toBe(0);

    const archiveHashEntry = await fixtureEntry('wrong-archive-hash', true);
    await expect(createPhigrosFontPreparer([{ ...archiveHashEntry, archiveSha256: '0'.repeat(64) }])()).rejects.toThrow('压缩包校验失败');
    expect(mockFontFs.files.size).toBe(0);

    const fontHashEntry = await fixtureEntry('wrong-font-hash', true);
    await expect(createPhigrosFontPreparer([{ ...fontHashEntry, fontSha256: '0'.repeat(64) }])()).rejects.toThrow('字体校验失败');
    expect(mockFontFs.files.size).toBe(0);
  });

  it('downloads only the requested extension fonts after core', async () => {
    const manifest = [
      await fixtureEntry('core-a', true),
      await fixtureEntry('core-b', true),
      await fixtureEntry('extension-a', false),
      await fixtureEntry('extension-b', false),
    ];
    const progress: PhigrosFontProgress[] = [];
    const prepare = createPhigrosFontPreparer(manifest);
    const prepared = await prepare((value) => progress.push(value), { neededNames: ['core-a', 'core-b', 'extension-a'] });
    expect(progress.some((value) => value.phase === 'core-ready' && value.completed === 2 && value.total === 3)).toBe(true);
    await prepared.fullReady;
    expect(progress.at(-1)).toMatchObject({ phase: 'ready', completed: 3, total: 3 });
    expect(mockFontFs.downloadCalls).toHaveLength(3);
    expect(new Set(mockFontFs.downloadCalls.slice(0, 2))).toEqual(new Set([
      'https://fonts.test/core-a.zip',
      'https://fonts.test/core-b.zip',
    ]));
    expect(mockFontFs.downloadCalls[2]).toBe('https://fonts.test/extension-a.zip');
    expect([...mockFontFs.files.keys()].filter((uri) => uri.includes('/font/'))).toHaveLength(3);
  });

  it('skips all extensions when only core fonts are needed', async () => {
    const manifest = [
      await fixtureEntry('core-a', true),
      await fixtureEntry('extension-a', false),
    ];
    const prepare = createPhigrosFontPreparer(manifest);
    const prepared = await prepare(undefined, { neededNames: ['core-a'] });
    await prepared.fullReady;
    expect(mockFontFs.downloadCalls).toEqual(['https://fonts.test/core-a.zip']);
  });
});
