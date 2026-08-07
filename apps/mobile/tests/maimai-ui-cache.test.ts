import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAIMAI_UI_CACHE_VERSION,
  clearMaimaiUiCache,
  createMaimaiUiPreparer,
  type MaimaiUiProgress,
} from '@/features/best-image/maimai-ui-cache';
import {
  MAIMAI_UI_MANIFEST_ENTRIES,
  MAIMAI_UI_ZIP,
  type MaimaiUiManifestEntry,
} from '@/features/best-image/maimai-ui-manifest.generated';

const mockUiFs = vi.hoisted(() => ({
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
    delete() { mockUiFs.deletes.push(this.uri); for (const uri of [...mockUiFs.files.keys()]) {
      if (uri.startsWith(this.uri)) mockUiFs.files.delete(uri);
    } }
    get exists() { return true; }
  }
  class File {
    uri: string;
    constructor(base: string | { uri: string }, ...parts: string[]) { this.uri = joinUri(base, parts); }
    get exists() { return mockUiFs.files.has(this.uri); }
    get size() { return mockUiFs.files.get(this.uri)?.byteLength ?? 0; }
    async bytes() { return Uint8Array.from(mockUiFs.files.get(this.uri) ?? []); }
    create() { mockUiFs.files.set(this.uri, new Uint8Array()); }
    write(content: Uint8Array) { mockUiFs.files.set(this.uri, Uint8Array.from(content)); }
    delete() { mockUiFs.files.delete(this.uri); }
    move(destination: File) {
      const bytes = mockUiFs.files.get(this.uri);
      if (!bytes) throw new Error('source does not exist');
      mockUiFs.files.set(destination.uri, bytes);
      mockUiFs.files.delete(this.uri);
      this.uri = destination.uri;
    }
    static async downloadFileAsync(url: string, destination: File) {
      mockUiFs.downloadCalls.push(url);
      const remote = mockUiFs.remotes.get(url);
      if (remote instanceof Error) {
        mockUiFs.files.set(destination.uri, new Uint8Array([1, 2, 3]));
        throw remote;
      }
      const bytes = typeof remote === 'function' ? await remote() : remote;
      if (!bytes) throw new Error(`missing remote ${url}`);
      mockUiFs.files.set(destination.uri, Uint8Array.from(bytes));
      return destination;
    }
  }
  return { Directory, File, Paths: { document: new Directory('file://', 'document') } };
});

function hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fixture(
  contents: Record<string, string>,
  zipBytesOverride?: Uint8Array,
): Promise<{ entries: MaimaiUiManifestEntry[]; zip: { url: string; bytes: number; sha256: string }; rawZip: Uint8Array }> {
  const zip = new JSZip();
  for (const [path, text] of Object.entries(contents)) zip.file(path, text);
  const rawZip = zipBytesOverride ?? await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const url = 'https://ui.test/maimai-ui.zip';
  mockUiFs.remotes.set(url, rawZip);
  const entries = Object.entries(contents).map(([path, text]) => {
    const bytes = Uint8Array.from(Buffer.from(text));
    return { path, bytes: bytes.byteLength, sha256: hex(bytes) };
  });
  return { entries, zip: { url, bytes: rawZip.byteLength, sha256: hex(rawZip) }, rawZip };
}

describe('maimai ui asset cache', () => {
  beforeEach(() => {
    mockUiFs.files.clear();
    mockUiFs.remotes.clear();
    mockUiFs.downloadCalls.length = 0;
    mockUiFs.deletes.length = 0;
  });

  it('pins the uploaded ui archive and covers every game-style asset path', () => {
    expect(MAIMAI_UI_ZIP.url).toBe('https://rranker-maimai-data.cn-nb1.rains3.com/maimai-ui/maimai-ui.zip');
    expect(MAIMAI_UI_ZIP.bytes).toBe(3_633_254);
    expect(MAIMAI_UI_ZIP.sha256).toBe('10806cfc97b8059bd44e50e3f300128b7c1df016917d0625cd6e58a1e7e66313');
    expect(MAIMAI_UI_MANIFEST_ENTRIES).toHaveLength(88);
    const paths = new Set(MAIMAI_UI_MANIFEST_ENTRIES.map((entry) => entry.path));
    for (const required of [
      'maimai-ui/b50.png', 'maimai-ui/logo.png', 'maimai-ui/Name.png',
      'maimai-ui/DaniPlate_23.png', 'maimai-ui/DXRating_11.png', 'maimai-ui/Drating_5.png',
      'maimai-ui/Shougou_Rainbow.png', 'maimai-ui/b50_score_master.png',
      'maimai-ui/SD.png', 'maimai-ui/DX.png', 'maimai-ui/Rank_SSSp.png',
      'maimai-ui/Icon_FSDp.png', 'maimai-ui/Star_05.png',
    ]) {
      expect(paths.has(required)).toBe(true);
    }
  });

  it('downloads, verifies and unpacks the archive with progress events, then reuses the cache', async () => {
    const { entries, zip } = await fixture({
      'maimai-ui/logo.png': 'logo-data', 'maimai-ui/SD.png': 'sd-data', 'maimai-ui/Star_01.png': 'star-data',
    });
    const progress: MaimaiUiProgress[] = [];
    const prepare = createMaimaiUiPreparer(zip, entries);
    const prepared = await prepare((value) => progress.push(value));
    await prepared.fullReady;
    expect(progress[0]!.phase).toBe('checking');
    expect(progress.some((value) => value.phase === 'unpacking')).toBe(true);
    expect(progress.at(-1)!.phase).toBe('ready');
    expect(mockUiFs.downloadCalls).toEqual([zip.url]);
    for (const entry of entries) {
      const uri = [...mockUiFs.files.keys()].find((key) => key.endsWith(`/ui/${entry.path}`))!;
      expect(hex(mockUiFs.files.get(uri)!)).toBe(entry.sha256);
    }
    expect([...mockUiFs.files.keys()].some((uri) => uri.includes('/tmp/'))).toBe(false);

    const downloads = mockUiFs.downloadCalls.length;
    const cached = await prepare();
    await cached.fullReady;
    expect(mockUiFs.downloadCalls).toHaveLength(downloads);
  });

  it('rejects a mismatched zip size and leaves no partial files', async () => {
    const { entries, zip } = await fixture({ 'maimai-ui/SD.png': 'sd' });
    const prepare = createMaimaiUiPreparer({ ...zip, bytes: zip.bytes + 1 }, entries);
    const prepared = await prepare();
    await expect(prepared.fullReady).rejects.toThrow('素材压缩包大小不匹配');
    expect([...mockUiFs.files.keys()].some((uri) => uri.includes('/ui/'))).toBe(false);
    expect([...mockUiFs.files.keys()].some((uri) => uri.includes('/tmp/'))).toBe(false);
  });

  it('rejects a corrupted zip hash', async () => {
    const { entries, zip, rawZip } = await fixture({ 'maimai-ui/SD.png': 'sd' });
    const corrupted = Uint8Array.from(rawZip);
    corrupted[0] = corrupted[0]! ^ 0xff;
    mockUiFs.remotes.set(zip.url, corrupted);
    const prepare = createMaimaiUiPreparer(zip, entries);
    const prepared = await prepare();
    await expect(prepared.fullReady).rejects.toThrow('素材压缩包校验失败');
    expect([...mockUiFs.files.keys()].some((uri) => uri.includes('/ui/'))).toBe(false);
  });

  it('rejects a missing or mismatched entry inside the archive', async () => {
    const { entries, zip } = await fixture({ 'maimai-ui/SD.png': 'sd' });
    const zip2 = new JSZip();
    zip2.file('maimai-ui/SD.png', 'wrong-content');
    const rawZip = await zip2.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    mockUiFs.remotes.set(zip.url, rawZip);
    const prepare = createMaimaiUiPreparer({ ...zip, bytes: rawZip.byteLength, sha256: hex(rawZip) }, entries);
    const prepared = await prepare();
    await expect(prepared.fullReady).rejects.toThrow('校验失败');
    expect([...mockUiFs.files.keys()].some((uri) => uri.includes('/ui/'))).toBe(false);
    expect([...mockUiFs.files.keys()].some((uri) => uri.includes('/tmp/'))).toBe(false);
  });

  it('redownloads when an unpacked file is corrupted', async () => {
    const { entries, zip } = await fixture({ 'maimai-ui/logo.png': 'logo', 'maimai-ui/SD.png': 'sd' });
    const prepare = createMaimaiUiPreparer(zip, entries);
    const first = await prepare();
    await first.fullReady;
    const cachedUri = [...mockUiFs.files.keys()].find((key) => key.endsWith('/ui/maimai-ui/SD.png'))!;
    const corrupted = Uint8Array.from(mockUiFs.files.get(cachedUri)!);
    corrupted[0] = corrupted[0]! ^ 0xff;
    mockUiFs.files.set(cachedUri, corrupted);

    const second = await prepare();
    await second.fullReady;
    expect(mockUiFs.downloadCalls).toEqual([zip.url, zip.url]);
    expect(hex(mockUiFs.files.get(cachedUri)!)).toBe(entries.find((entry) => entry.path === 'maimai-ui/SD.png')!.sha256);
  });

  it('reports download failure and retries cleanly', async () => {
    const { entries, zip } = await fixture({ 'maimai-ui/SD.png': 'sd' });
    mockUiFs.remotes.set(zip.url, new Error('network down'));
    const prepare = createMaimaiUiPreparer(zip, entries);
    const failed = await prepare();
    await expect(failed.fullReady).rejects.toThrow('素材准备失败');
    expect([...mockUiFs.files.keys()].some((uri) => uri.includes('/ui/'))).toBe(false);

    mockUiFs.remotes.set(zip.url, await new JSZip().file('maimai-ui/SD.png', 'sd').generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
    const retried = await prepare();
    await retried.fullReady;
    expect(mockUiFs.downloadCalls).toEqual([zip.url, zip.url]);
  });

  it('clears the local asset cache directory', () => {
    clearMaimaiUiCache();
    expect(mockUiFs.deletes.some((uri) => uri.endsWith('/rranker/maimai-assets'))).toBe(true);
  });
});
