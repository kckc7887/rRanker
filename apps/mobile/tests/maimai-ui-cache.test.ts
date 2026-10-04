import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearMaimaiUiCache,
  prepareMaimaiUi,
  type MaimaiUiProgress,
} from '@/features/best-image/maimai-ui-cache';
import {
  MAIMAI_UI_MANIFEST_ENTRIES,
  MAIMAI_UI_ZIP,
} from '@/features/best-image/maimai-ui-manifest.generated';

const mockUiFs = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  metadata: new Map<string, { length: number; size: number }>(),
  digests: new Map<string, string>(),
  remotes: new Map<string, Uint8Array | Error | (() => Promise<Uint8Array>)>(),
  downloadCalls: [] as string[],
  deletes: [] as string[],
  createdDirectories: [] as string[],
}));

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: async (_algorithm: string, bytes: Uint8Array) => Uint8Array.from(Buffer.from(
    mockUiFs.digests.get(`${bytes.byteLength}:${Buffer.from(bytes.subarray(0, 64)).toString('hex')}`) ?? createHash('sha256').update(bytes).digest('hex'), 'hex',
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
    create() { mockUiFs.createdDirectories.push(this.uri); }
    delete() { mockUiFs.deletes.push(this.uri); for (const uri of [...mockUiFs.files.keys()]) {
      if (uri.startsWith(this.uri)) mockUiFs.files.delete(uri);
    } }
    get exists() { return true; }
  }
  class File {
    uri: string;
    constructor(base: string | { uri: string }, ...parts: string[]) { this.uri = joinUri(base, parts); }
    get exists() { return mockUiFs.files.has(this.uri); }
    get size() {
      const bytes = mockUiFs.files.get(this.uri);
      if (!bytes) return 0;
      const name = this.uri.split('/').at(-1)!.replace(/\.part$/u, '');
      const metadata = mockUiFs.metadata.get(name);
      return metadata?.length === bytes.byteLength ? metadata.size : bytes.byteLength;
    }
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
  return { Directory, File, Paths: { document: new Directory('file://', 'document'), cache: new Directory('file://', 'cache') } };
});

async function fixture(omit?: string): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const entry of MAIMAI_UI_MANIFEST_ENTRIES) {
    const bytes = new Uint8Array(entry.bytes); bytes.set(Buffer.from(`asset:${entry.path}`).subarray(0, bytes.length));
    if (entry.path !== omit) zip.file(entry.path, bytes);
    const name = entry.path.split('/').at(-1)!;
    mockUiFs.metadata.set(name, { length: bytes.byteLength, size: entry.bytes });
    mockUiFs.digests.set(`${bytes.byteLength}:${Buffer.from(bytes.subarray(0, 64)).toString('hex')}`, entry.sha256);
  }
  const archive = await zip.generateAsync({ type: 'uint8array' });
  mockUiFs.remotes.set(MAIMAI_UI_ZIP.url, archive);
  mockUiFs.metadata.set('maimai-ui.zip', { length: archive.byteLength, size: MAIMAI_UI_ZIP.bytes });
  mockUiFs.digests.set(`${archive.byteLength}:${Buffer.from(archive.subarray(0, 64)).toString('hex')}`, MAIMAI_UI_ZIP.sha256);
  return archive;
}

const firstEntry = MAIMAI_UI_MANIFEST_ENTRIES[0]!;
const cached = () => [...mockUiFs.files.keys()].find(uri => uri.endsWith(`/ui/${firstEntry.path.replace(/^maimai-ui\//u, '')}`));

describe('maimai ui asset cache', () => {
  beforeEach(async () => {
    mockUiFs.files.clear(); mockUiFs.metadata.clear(); mockUiFs.digests.clear(); mockUiFs.remotes.clear();
    mockUiFs.downloadCalls.length = 0; mockUiFs.deletes.length = 0; mockUiFs.createdDirectories.length = 0;
    await fixture();
  });

  it('publishes current assets, reports completion, and reuses intact files', async () => {
    const progress: MaimaiUiProgress[] = [];
    await (await prepareMaimaiUi(value => progress.push(value))).fullReady;
    expect(progress.at(-1)?.phase).toBe('ready');
    expect(cached()).toBeTruthy();
    expect([...mockUiFs.files.keys()].filter(uri => uri.includes('/ui/'))).toHaveLength(MAIMAI_UI_MANIFEST_ENTRIES.length);
    mockUiFs.remotes.clear();
    await (await prepareMaimaiUi()).fullReady;
    expect(mockUiFs.files.get(cached()!)?.byteLength).toBe(firstEntry.bytes);
  });

  it('rejects a truncated archive before publishing assets', async () => {
    mockUiFs.remotes.set(MAIMAI_UI_ZIP.url, new Uint8Array([1]));
    await expect((await prepareMaimaiUi()).fullReady).rejects.toThrow('素材压缩包大小不匹配');
    expect(cached()).toBeUndefined();
  });

  it('rejects a same-size corrupt archive before publishing assets', async () => {
    const archive = Uint8Array.from(mockUiFs.remotes.get(MAIMAI_UI_ZIP.url) as Uint8Array);
    archive[0] ^= 0xff;
    mockUiFs.remotes.set(MAIMAI_UI_ZIP.url, archive);
    await expect((await prepareMaimaiUi()).fullReady).rejects.toThrow('素材压缩包校验失败');
    expect(cached()).toBeUndefined();
  });

  it('rejects a missing required asset', async () => {
    await fixture(firstEntry.path);
    await expect((await prepareMaimaiUi()).fullReady).rejects.toThrow('压缩包缺少');
    expect(cached()).toBeUndefined();
  });

  it('replaces a corrupted cached asset', async () => {
    await (await prepareMaimaiUi()).fullReady;
    const uri = cached()!, valid = mockUiFs.files.get(uri)!;
    const corrupt = Uint8Array.from(valid); corrupt[0] ^= 0xff; mockUiFs.files.set(uri, corrupt);
    await (await prepareMaimaiUi()).fullReady;
    expect(mockUiFs.files.get(uri)).toEqual(valid);
  });

  it('reports network failure, retries, and clears cached files', async () => {
    const archive = mockUiFs.remotes.get(MAIMAI_UI_ZIP.url)!;
    mockUiFs.remotes.set(MAIMAI_UI_ZIP.url, new Error('network down'));
    await expect((await prepareMaimaiUi()).fullReady).rejects.toThrow('素材准备失败');
    expect(cached()).toBeUndefined();
    mockUiFs.remotes.set(MAIMAI_UI_ZIP.url, archive);
    await (await prepareMaimaiUi()).fullReady;
    expect(cached()).toBeTruthy();
    clearMaimaiUiCache();
    expect(cached()).toBeUndefined();
  });
});

vi.mock('@/features/chart-download-shared/chart-download-shared', async () => {
  const { File } = await import('expo-file-system');
  return { downloadChartResource: (directory: import('expo-file-system').Directory, name: string, url: string) => File.downloadFileAsync(url, new File(directory, name)) };
});
