import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAIMAI_FONT_CACHE_VERSION,
  MAIMAI_FONT_MANIFEST,
  clearMaimaiFontCache,
  createMaimaiFontPreparer,
  type MaimaiFontManifestEntry,
  type MaimaiFontProgress,
} from '@/features/best-image/maimai-font-cache';

const mockFontFs = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  remotes: new Map<string, Uint8Array | Error | (() => Promise<Uint8Array>)>(),
  downloadCalls: [] as string[],
  deletes: [] as string[],
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
    delete() { mockFontFs.deletes.push(this.uri); for (const uri of [...mockFontFs.files.keys()]) {
      if (uri.startsWith(this.uri)) mockFontFs.files.delete(uri);
    } }
    get exists() { return true; }
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

async function fixtureEntry(name: string, contents = `font:${name}`): Promise<MaimaiFontManifestEntry> {
  const fontBytes = Uint8Array.from(Buffer.from(contents));
  const fileName = `${name}.ttf`;
  const url = `https://fonts.test/${fileName}`;
  mockFontFs.remotes.set(url, fontBytes);
  return {
    name,
    fileName,
    cssFileName: fileName,
    url,
    fontBytes: fontBytes.byteLength,
    fontSha256: hex(fontBytes),
  };
}

describe('maimai remote font cache', () => {
  beforeEach(() => {
    mockFontFs.files.clear();
    mockFontFs.remotes.clear();
    mockFontFs.downloadCalls.length = 0;
    mockFontFs.deletes.length = 0;
  });

  it('pins the verified Noto Sans CJK SC variable font archive', () => {
    expect(MAIMAI_FONT_MANIFEST).toHaveLength(1);
    const entry = MAIMAI_FONT_MANIFEST[0]!;
    expect(entry.name).toBe('maimai-noto');
    expect(entry.fileName).toBe('NotoSansCJKsc-VF.ttf');
    expect(entry.cssFileName).toBe('maimai-noto.ttf');
    expect(entry.url).toBe('https://rranker-maimai-data.cn-nb1.rains3.com/fonts/NotoSansCJKsc-VF.ttf');
    expect(entry.fontBytes).toBe(36_144_788);
    expect(entry.fontSha256).toBe('990c807e79c25662a5a9ecf7f971baeb2bf2eab9a559e5ecf15cdfdb8561d21f');
  });

  it('downloads, verifies and caches the font with progress events, then reuses the cache', async () => {
    const entry = await fixtureEntry('maimai');
    const progress: MaimaiFontProgress[] = [];
    const prepare = createMaimaiFontPreparer([entry]);
    const prepared = await prepare((value) => progress.push(value));
    expect(progress.map((value) => value.phase)).toEqual(['checking', 'downloading']);
    await prepared.fullReady;
    expect(progress.map((value) => value.phase)).toEqual(['checking', 'downloading', 'ready']);
    expect(mockFontFs.downloadCalls).toEqual([entry.url]);
    expect([...mockFontFs.files.keys()].filter((uri) => uri.includes(`/${MAIMAI_FONT_CACHE_VERSION}/font/`))).toHaveLength(1);
    expect([...mockFontFs.files.keys()].some((uri) => uri.includes('/tmp/'))).toBe(false);
    expect([...mockFontFs.files.keys()].find((uri) => uri.endsWith(`/font/${entry.cssFileName}`)))
      .toBeTruthy();

    const downloads = mockFontFs.downloadCalls.length;
    const cached = await prepare();
    await cached.fullReady;
    expect(mockFontFs.downloadCalls).toHaveLength(downloads);
  });

  it('rejects a mismatched size and leaves no final or partial font', async () => {
    const entry = await fixtureEntry('broken', 'font:broken');
    mockFontFs.remotes.set(entry.url, Uint8Array.from(Buffer.from('too-short')));
    const prepare = createMaimaiFontPreparer([entry]);
    const prepared = await prepare();
    await expect(prepared.fullReady).rejects.toThrow('字体大小不匹配');
    expect([...mockFontFs.files.keys()].some((uri) => uri.includes('/font/'))).toBe(false);
    expect([...mockFontFs.files.keys()].some((uri) => uri.includes('/tmp/'))).toBe(false);
  });

  it('redownloads a same-size cached font when its hash is corrupted', async () => {
    const entry = await fixtureEntry('maimai');
    const prepare = createMaimaiFontPreparer([entry]);
    const first = await prepare();
    await first.fullReady;
    const cachedUri = [...mockFontFs.files.keys()].find((uri) => uri.endsWith('/font/maimai.ttf'))!;
    const corrupted = Uint8Array.from(mockFontFs.files.get(cachedUri)!);
    corrupted[0] = corrupted[0]! ^ 0xff;
    mockFontFs.files.set(cachedUri, corrupted);

    const second = await prepare();
    await second.fullReady;
    expect(mockFontFs.downloadCalls).toEqual([entry.url, entry.url]);
    expect(hex(mockFontFs.files.get(cachedUri)!)).toBe(entry.fontSha256);
  });

  it('deduplicates concurrent downloads for the same font', async () => {
    const entry = await fixtureEntry('shared');
    const bytes = mockFontFs.remotes.get(entry.url) as Uint8Array;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    mockFontFs.remotes.set(entry.url, async () => { await gate; return bytes; });
    const prepare = createMaimaiFontPreparer([entry]);
    const first = prepare();
    const second = prepare();
    await Promise.resolve();
    expect(mockFontFs.downloadCalls).toEqual([entry.url]);
    release();
    const results = await Promise.all([first, second]);
    await Promise.all(results.map((result) => result.fullReady));
    expect(mockFontFs.downloadCalls).toEqual([entry.url]);
  });

  it('reports download failure and retries cleanly', async () => {
    const entry = await fixtureEntry('maimai');
    mockFontFs.remotes.set(entry.url, new Error('network down'));
    const prepare = createMaimaiFontPreparer([entry]);
    const failed = await prepare();
    await expect(failed.fullReady).rejects.toThrow('字体准备失败');
    expect([...mockFontFs.files.keys()].some((uri) => uri.includes('/font/'))).toBe(false);
    expect([...mockFontFs.files.keys()].some((uri) => uri.includes('/tmp/'))).toBe(false);

    mockFontFs.remotes.set(entry.url, Uint8Array.from(Buffer.from('font:maimai')));
    const retried = await prepare();
    await retried.fullReady;
    expect(mockFontFs.downloadCalls).toEqual([entry.url, entry.url]);
  });

  it('clears the local font cache directory', () => {
    clearMaimaiFontCache();
    expect(mockFontFs.deletes.some((uri) => uri.endsWith('/rranker/maimai-fonts'))).toBe(true);
  });
});
