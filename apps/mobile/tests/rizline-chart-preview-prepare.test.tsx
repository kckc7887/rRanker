import { jest } from '@jest/globals';
import { prepareRizlineChartPreviewWebViewSource } from '@/features/rizline-chart-preview/prepare-rizline-chart-preview-webview';

const mockFiles = new Map<string, string | Uint8Array>();
const mockDirectories = new Set<string>();
const mockDownloaded: string[] = [];
const mockCleaned: string[] = [];
let mockSequence = 0;
const mockChartJson = '{"fileVersion":0}';
const mockChartBytes = Uint8Array.from(Buffer.from(mockChartJson));
const mockMusicBytes = new Uint8Array([4, 5, 6, 7]);
const mockMusicBase64 = Buffer.from(mockMusicBytes).toString('base64');

jest.mock('../assets/rizline-chart-preview/player.bundle', () => 1);
jest.mock('../assets/rizline-chart-preview/index.html', () => 2);
jest.mock('expo-file-system', () => {
  const uri = (base: string | { uri: string }, parts: string[]) =>
    `${(typeof base === 'string' ? base : base.uri).replace(/\/+$/u, '')}/${parts.join('/')}`;
  class Directory {
    readonly uri: string;
    constructor(base: string | { uri: string }, ...parts: string[]) { this.uri = uri(base, parts); }
    create() { mockDirectories.add(this.uri); }
    get exists() { return mockDirectories.has(this.uri); }
    delete() {
      mockCleaned.push(this.uri);
      for (const key of mockFiles.keys()) if (key.startsWith(`${this.uri}/`)) mockFiles.delete(key);
      for (const key of [...mockDirectories]) if (key === this.uri || key.startsWith(`${this.uri}/`)) mockDirectories.delete(key);
    }
  }
  class File {
    readonly uri: string;
    constructor(base: string | { uri: string }, ...parts: string[]) { this.uri = uri(base, parts); }
    get exists() { return mockFiles.has(this.uri); }
    get size() { return mockFiles.get(this.uri)?.length ?? 0; }
    create() { mockFiles.set(this.uri, new Uint8Array()); }
    write(value: string | Uint8Array) { mockFiles.set(this.uri, value); }
    async bytes() {
      const bytes = mockFiles.get(this.uri);
      if (!(bytes instanceof Uint8Array)) throw new Error('missing-bytes');
      return bytes;
    }
    async base64() {
      const bytes = mockFiles.get(this.uri);
      if (!(bytes instanceof Uint8Array)) throw new Error('missing-bytes');
      return Buffer.from(bytes).toString('base64');
    }
    delete() { mockFiles.delete(this.uri); }
  }
  return { Directory, File };
});
jest.mock('@/features/chart-preview-shared/chart-preview-assets', () => ({
  createChartPreviewSessionDirectory: (name: string) => {
    const { Directory } = jest.requireMock<typeof import('expo-file-system')>('expo-file-system');
    const directory = new Directory('file:///cache', `${name}-session-${++mockSequence}`);
    directory.create();
    return directory;
  },
  disposeChartPreviewSessionDirectory: (directory: { exists: boolean; delete(): void }) => {
    if (directory.exists) directory.delete();
  },
  stageAsset: async (_module: number, name: string, directory: never) => {
    const { File } = jest.requireMock<typeof import('expo-file-system')>('expo-file-system');
    const file = new File(directory, name);
    file.create(); file.write('player');
    return file;
  },
  readAssetText: async () => '<!--RIZLINE_CHART_PREVIEW_CONFIG--><!--PLAYER_SCRIPT-->',
}));
jest.mock('@/features/chart-download-shared/chart-download-shared', () => ({
  downloadChartResource: async (directory: never, fileName: string, url: string) => {
    mockDownloaded.push(url);
    const { File } = jest.requireMock<typeof import('expo-file-system')>('expo-file-system');
    const file = new File(directory, fileName);
    file.create();
    file.write(fileName.endsWith('.json') ? mockChartBytes : mockMusicBytes);
    return file;
  },
}));
jest.mock('@/services/rizline-chart-preview-resources', () => ({
  loadRizlineChartPreviewResources: async (
    target: { songId: string; levelIndex: number; title?: string },
    _signal: AbortSignal,
    read: (asset: { url: string; size: number; sha256: string; path: string }, index: number) => Promise<Uint8Array>,
  ) => {
    const chart = {
      path: 'rizline/releases/r1/charts/Song.A.0.IN.json', url: 'https://assets.example/chart.json',
      size: mockChartBytes.byteLength, sha256: 'aa', difficulty: 'IN', level: '12',
    };
    const music = {
      path: 'rizline/releases/r1/audio/Song.A.0.m4a', url: 'https://assets.example/audio.m4a',
      size: mockMusicBytes.byteLength, sha256: 'bb',
    };
    await read(chart, 0);
    await read(music, 1);
    return {
      target, gameVersion: '2.7.1', resourceVersion: 'r1',
      song: { id: target.songId, title: 'Song', artist: null }, chart, music,
    };
  },
}));

type PreviewPlan = {
  buildHtml: (template: string) => string;
  directory?: { uri: string };
  writers?: ((directory: { uri: string }, signal?: AbortSignal) => Promise<void>)[];
};

const mockPlan = jest.fn(async (plan: PreviewPlan) => ({
  uri: `${plan.directory?.uri}/index.html`,
  allowingReadAccessToURL: plan.directory?.uri,
  dispose: jest.fn(),
}));
jest.mock('@/features/chart-preview-shared/prepare-chart-preview-webview-from-plan', () => ({
  prepareChartPreviewWebviewFromPlan: (plan: { buildHtml: (template: string) => string; directory?: { uri: string } }) => mockPlan(plan),
}));

describe('Rizline chart preview prepare', () => {
  beforeEach(() => {
    mockFiles.clear(); mockDirectories.clear(); mockDownloaded.length = 0; mockCleaned.length = 0;
    mockSequence = 0; mockPlan.mockClear();
  });

  it('downloads chart JSON and m4a then wraps them as sibling scripts', async () => {
    const htmlWrites: string[] = [];
    mockPlan.mockImplementationOnce(async (plan: PreviewPlan) => {
      if (!plan.directory) throw new Error('missing-directory');
      for (const writer of plan.writers ?? []) await writer(plan.directory);
      htmlWrites.push(plan.buildHtml('<!--RIZLINE_CHART_PREVIEW_CONFIG-->'));
      return { uri: `${plan.directory.uri}/index.html`, allowingReadAccessToURL: plan.directory.uri, dispose: jest.fn() };
    });
    const prepared = await prepareRizlineChartPreviewWebViewSource(
      { songId: 'Song.A.0', levelIndex: 2, title: 'Song IN' },
      'dark',
      { userSpeed: 4 },
      new AbortController().signal,
    );
    expect(mockDownloaded).toEqual(['https://assets.example/chart.json', 'https://assets.example/audio.m4a']);
    const files = [...mockFiles.entries()];
    const chartScript = files.find(([uri]) => uri.endsWith('/chart-data.js'))?.[1];
    const musicScript = files.find(([uri]) => uri.endsWith('/music-data.js'))?.[1];
    expect(chartScript).toBe(`window.__RIZLINE_CHART_PREVIEW_CHART__=${mockChartJson};`);
    expect(musicScript).toBe(`window.__RIZLINE_CHART_PREVIEW_MUSIC__=${JSON.stringify(mockMusicBase64)};`);
    expect(files.some(([uri]) => uri.endsWith('/preview-chart.json'))).toBe(false);
    expect(files.some(([uri]) => uri.endsWith('/preview-music.m4a'))).toBe(false);
    expect(htmlWrites[0]).toContain('window.__RIZLINE_CHART_PREVIEW_CONFIG__=');
    expect(htmlWrites[0]).not.toContain('preview-chart.json');
    expect(htmlWrites[0]).not.toContain('preview-music.m4a');
    expect(htmlWrites[0]).not.toContain(mockChartJson);
    expect(prepared.uri).toContain('rranker-rizline-chart-preview');
  });
});
