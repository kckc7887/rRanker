const native = vi.hoisted(() => ({
  downloadFileAsync: vi.fn(),
  pickDirectoryAsync: vi.fn(),
  downloaded: [] as { url: string; uri: string }[],
  texts: new Map<string, string>(),
  bytes: new Map<string, Uint8Array>(),
  writes: [] as { uri: string; content: string | Uint8Array }[],
  createFileCalls: [] as { name: string; mime: string | null }[],
  deleted: [] as string[],
  createdDirs: [] as string[],
}));

vi.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    static async downloadFileAsync(url: string, file: MockFile) {
      await native.downloadFileAsync(url, file.uri);
      native.texts.set(file.uri, `${url}\n谱面内容`);
      native.bytes.set(file.uri, new TextEncoder().encode(`${url}\n谱面内容`));
      return file;
    }
    get exists() { return native.texts.has(this.uri); }
    get size() { return native.texts.get(this.uri)?.length ?? 0; }
    async text() { return native.texts.get(this.uri) ?? ''; }
    async bytes() { return native.bytes.get(this.uri) ?? new Uint8Array(0); }
    write(content: string | Uint8Array) { native.writes.push({ uri: this.uri, content }); }
    delete() { native.deleted.push(this.uri); }
  }
  class MockDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    create() { native.createdDirs.push(this.uri); }
    get exists() { return this.uri.startsWith('file:///cache/'); }
    delete() { native.deleted.push(this.uri); }
    static pickDirectoryAsync() { return native.pickDirectoryAsync(); }
  }
  return { Paths: { cache: 'file:///cache' }, File: MockFile, Directory: MockDirectory };
});

// Native Expo modules must be mocked before importing the download module.
// eslint-disable-next-line import/first
import JSZip from 'jszip';
// eslint-disable-next-line import/first
import {
  checkMaimaiChartVideoAvailable,
  downloadMaimaiChartPackage,
  MaimaiChartDownloadError,
  maimaiChartPackageName,
} from '@/features/maimai-chart-download/maimai-chart-download';

function pickedDirectoryMock() {
  return {
    createFile: (name: string, mime: string | null) => {
      native.createFileCalls.push({ name, mime });
      return {
        uri: `picked://${name}`,
        write: (content: string | Uint8Array) => native.writes.push({ uri: `picked://${name}`, content }),
      };
    },
  };
}

describe('maimai chart download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.downloaded.length = 0;
    native.texts.clear();
    native.bytes.clear();
    native.writes.length = 0;
    native.createFileCalls.length = 0;
    native.deleted.length = 0;
    native.createdDirs.length = 0;
    native.downloadFileAsync.mockImplementation(async (url: string, uri: string) => {
      native.downloaded.push({ url, uri });
    });
    native.pickDirectoryAsync.mockResolvedValue(pickedDirectoryMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sanitizes package names and truncates long titles', () => {
    expect(maimaiChartPackageName('A:B*C?D"E<F>G/H\\I|J', 'DX', '12+')).toBe('A_B_C_D_E_F_G_H_I_J DX 12+');
    expect(maimaiChartPackageName('x'.repeat(80), 'SD', '10')).toBe(`${'x'.repeat(34)} SD 10`);
    expect(maimaiChartPackageName('   ', 'DX', '14')).toBe('DX 14');
    expect(maimaiChartPackageName('協', 'UTAGE', '協')).toBe('協 UTAGE 協');
  });

  it('detects video availability via HEAD and treats failures as unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await expect(checkMaimaiChartVideoAvailable(10123)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://maimai-video.lxns.net/123.mp4', { method: 'HEAD' });

    fetchMock.mockResolvedValueOnce({ ok: false });
    await expect(checkMaimaiChartVideoAvailable(10123)).resolves.toBe(false);
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(checkMaimaiChartVideoAvailable(10123)).resolves.toBe(false);
  });

  it('downloads chart, music, jacket and optional video into an AstroDX zip', async () => {
    const saved = await downloadMaimaiChartPackage({
      songId: '123',
      chartType: 'DX',
      levelIndex: 3,
      levelLabel: '12+',
      title: '测试曲目',
      includeVideo: true,
    });
    expect(saved).toBe(true);

    expect(native.downloaded.map((entry) => entry.url)).toEqual([
      'https://assets2.lxns.net/maimai/chart/10123.txt',
      'https://assets2.lxns.net/maimai/music/123.mp3',
      'https://assets2.lxns.net/maimai/jacket/123.png',
      'https://maimai-video.lxns.net/123.mp4',
    ]);

    expect(native.createFileCalls).toEqual([{ name: '测试曲目 DX 12+.adx.zip', mime: 'application/zip' }]);
    const written = native.writes.find((entry) => entry.uri.startsWith('picked://'));
    expect(written).toBeTruthy();
    const zip = await JSZip.loadAsync(written!.content as Uint8Array);
    const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name]!.dir).sort();
    expect(fileNames).toEqual([
      '测试曲目 DX 12+/bg.png',
      '测试曲目 DX 12+/maidata.txt',
      '测试曲目 DX 12+/pv.mp4',
      '测试曲目 DX 12+/track.mp3',
    ]);
    expect(await zip.file('测试曲目 DX 12+/maidata.txt')!.async('string')).toContain('chart/10123.txt');
    expect(await zip.file('测试曲目 DX 12+/pv.mp4')!.async('string')).toContain('maimai-video.lxns.net');

    const staging = native.createdDirs.find((uri) => uri.includes('rranker-chart-download-'));
    expect(staging).toBeTruthy();
    expect(native.deleted).toContain(staging);
  });

  it('omits pv.mp4 when the player picks cover only', async () => {
    const saved = await downloadMaimaiChartPackage({
      songId: '123',
      chartType: 'SD',
      levelIndex: 0,
      levelLabel: '5',
      title: '测试曲目',
      includeVideo: false,
    });
    expect(saved).toBe(true);
    expect(native.downloaded.map((entry) => entry.url)).not.toContain('https://maimai-video.lxns.net/123.mp4');
    const written = native.writes.find((entry) => entry.uri.startsWith('picked://'));
    const zip = await JSZip.loadAsync(written!.content as Uint8Array);
    const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name]!.dir).sort();
    expect(fileNames).toEqual([
      '测试曲目 SD 5/bg.png',
      '测试曲目 SD 5/maidata.txt',
      '测试曲目 SD 5/track.mp3',
    ]);
  });

  it('returns false without writing when the save dialog is cancelled', async () => {
    native.pickDirectoryAsync.mockRejectedValueOnce(
      Object.assign(new Error('The file picker was cancelled by the user'), { code: 'ERR_PICKER_CANCELLED' }),
    );
    const saved = await downloadMaimaiChartPackage({
      songId: '123',
      chartType: 'DX',
      levelIndex: 3,
      levelLabel: '12+',
      title: '测试曲目',
      includeVideo: false,
    });
    expect(saved).toBe(false);
    expect(native.createFileCalls).toEqual([]);
    expect(native.writes).toEqual([]);
    const staging = native.createdDirs.find((uri) => uri.includes('rranker-chart-download-'));
    expect(native.deleted).toContain(staging);
  });

  it('fails with a typed error when a resource or the picker fails, and cleans staging', async () => {
    native.downloadFileAsync.mockRejectedValueOnce(new Error('UnableToDownload status 404'));
    await expect(downloadMaimaiChartPackage({
      songId: '123',
      chartType: 'DX',
      levelIndex: 3,
      levelLabel: '12+',
      title: '测试曲目',
      includeVideo: false,
    })).rejects.toBeInstanceOf(MaimaiChartDownloadError);
    const staging = native.createdDirs.find((uri) => uri.includes('rranker-chart-download-'));
    expect(native.deleted).toContain(staging);

    native.pickDirectoryAsync.mockRejectedValueOnce(new Error('boom'));
    await expect(downloadMaimaiChartPackage({
      songId: '123',
      chartType: 'DX',
      levelIndex: 3,
      levelLabel: '12+',
      title: '测试曲目',
      includeVideo: false,
    })).rejects.toBeInstanceOf(MaimaiChartDownloadError);
  });
});
