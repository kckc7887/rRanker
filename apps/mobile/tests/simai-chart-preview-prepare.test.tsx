import { jest } from '@jest/globals';
import { prepareChartPreviewWebViewSource } from '@rranker/tool-simai/features/simai-chart-preview/prepare-chart-preview-webview';
import { invalidateResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';

const mockFiles = new Map<string, Uint8Array>();
const mockDownloads: string[] = [];
const mockDownloadReady = jest.fn(async (_signal?: AbortSignal) => {});
let mockSession = 0;

jest.mock('@rranker/chart-simai/assets/maimai-chart-preview/index.html', () => 1);
jest.mock('@rranker/chart-simai/assets/maimai-chart-preview/player.bundle', () => 2);
jest.mock('@rranker/chart-simai/assets/maimai-chart-preview/sensor.webp', () => 3);
jest.mock('expo-file-system', () => ({
  File: class {
    readonly uri: string;
    constructor(directory: { uri: string }, fileName: string) { this.uri = `${directory.uri}/${fileName}`; }
    get exists() { return mockFiles.has(this.uri); }
    get size() { return mockFiles.get(this.uri)?.byteLength ?? 0; }
  },
}));
jest.mock('@rranker/sdk/features/chart-preview-shared/chart-preview-assets', () => ({
  createChartPreviewSessionDirectory: async () => ({ uri: `file:///preview/${++mockSession}` }),
  chartPreviewStageDirectory: async () => ({ uri: 'file:///preview-cache' }),
  disposeChartPreviewSessionDirectory: async () => {},
}));
jest.mock('@rranker/sdk/features/chart-preview-shared/prepare-chart-preview-webview-from-plan', () => ({
  prepareChartPreviewWebviewFromPlan: async ({ directory }: { directory: { uri: string } }) => ({
    uri: `${directory.uri}/index.html`,
    allowingReadAccessToURL: directory.uri,
    dispose: async () => {
      for (const uri of mockFiles.keys()) if (uri.startsWith(`${directory.uri}/`)) mockFiles.delete(uri);
    },
  }),
}));
jest.mock('@rranker/sdk/features/chart-download-shared/chart-download-shared', () => ({
  downloadChartResource: async (directory: { uri: string }, fileName: string, url: string, signal?: AbortSignal) => {
    mockDownloads.push(url);
    await mockDownloadReady(signal);
    if (signal?.aborted) throw signal.reason;
    const { File } = jest.requireMock<typeof import('expo-file-system')>('expo-file-system');
    const file = new File(directory as never, fileName);
    mockFiles.set(file.uri, new Uint8Array([1, 2, 3]));
    return file;
  },
}));

const videoUrl = 'https://video.example/chart.mp4';
const config = { chartId: 8, difficulty: 5, simaiText: '&inote_5=(120)1,', backgroundVideoUrl: videoUrl };

describe('Simai preview background video preparation', () => {
  beforeEach(() => {
    mockFiles.clear();
    mockDownloads.length = 0;
    mockDownloadReady.mockReset();
  });

  it('downloads only when requested, shares concurrent requests and reuses the local video', async () => {
    const source = await prepareChartPreviewWebViewSource(config);
    expect(mockDownloads).toEqual([]);
    let finish!: () => void;
    mockDownloadReady.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const first = source.loadBackgroundVideo();
    const second = source.loadBackgroundVideo();
    expect(mockDownloads).toEqual([videoUrl]);
    finish();
    const [firstUri, secondUri] = await Promise.all([first, second]);
    expect(firstUri).toBe(secondUri);
    expect(firstUri.startsWith(`${source.allowingReadAccessToURL}/`)).toBe(true);
    expect(mockFiles.get(firstUri)).toEqual(new Uint8Array([1, 2, 3]));
    await expect(source.loadBackgroundVideo()).resolves.toBe(firstUri);
    expect(mockDownloads).toEqual([videoUrl]);
    await source.dispose();
    expect(mockFiles.has(firstUri)).toBe(false);
    await expect(source.loadBackgroundVideo()).rejects.toBeDefined();
  });

  it('keeps preview ready after a video failure and allows retry', async () => {
    const source = await prepareChartPreviewWebViewSource(config);
    mockDownloadReady.mockRejectedValueOnce(new Error('network'));
    await expect(source.loadBackgroundVideo()).rejects.toThrow('network');
    const uri = await source.loadBackgroundVideo();
    expect(mockFiles.get(uri)).toEqual(new Uint8Array([1, 2, 3]));
    expect(mockDownloads).toEqual([videoUrl, videoUrl]);
    await source.dispose();
  });

  it.each(['dispose', 'abort'] as const)('cancels a pending video on %s and rejects further loads', async (action) => {
    const controller = new AbortController();
    const source = await prepareChartPreviewWebViewSource(config, controller.signal);
    mockDownloadReady.mockImplementationOnce(signal => new Promise<void>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const pending = source.loadBackgroundVideo();
    const rejected = expect(pending).rejects.toBeDefined();
    if (action === 'abort') controller.abort();
    await source.dispose();
    await rejected;
    expect(mockFiles.size).toBe(0);
    await expect(source.loadBackgroundVideo()).rejects.toBeDefined();
  });

  it('does not publish a video from a cleared resource generation', async () => {
    const source = await prepareChartPreviewWebViewSource(config);
    let finish!: () => void;
    mockDownloadReady.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const pending = source.loadBackgroundVideo();
    invalidateResourceWrites('shared');
    finish();
    await expect(pending).rejects.toThrow('缓存请求已失效');
    await expect(source.loadBackgroundVideo()).rejects.toThrow('缓存请求已失效');
    await source.dispose();
    expect(mockFiles.size).toBe(0);
  });
});
