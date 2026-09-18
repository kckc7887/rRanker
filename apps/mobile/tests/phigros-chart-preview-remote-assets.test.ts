import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareChartPreviewWebviewFromPlan } from '@/features/chart-preview-shared/prepare-chart-preview-webview-from-plan';

const mockFs = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  remotes: new Map<string, Uint8Array | Error>(),
  downloadCalls: [] as string[],
  stagedLocalAssets: [] as string[],
  readAssetTexts: new Map<number, string>(),
  makeStageDirectory: ((_name: string) => ({ uri: '' })) as (name: string) => { uri: string },
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
    get exists() { return true; }
    delete() {
      for (const key of [...mockFs.files.keys()]) {
        if (key.startsWith(`${this.uri}/`)) mockFs.files.delete(key);
      }
    }
  }
  class File {
    uri: string;
    constructor(base: string | { uri: string }, ...parts: string[]) { this.uri = joinUri(base, parts); }
    get exists() { return mockFs.files.has(this.uri); }
    get size() { return mockFs.files.get(this.uri)?.byteLength ?? 0; }
    async base64() { return `b64:${this.uri}`; }
    async bytes() {
      const bytes = mockFs.files.get(this.uri);
      if (!bytes) throw new Error('source does not exist');
      return Uint8Array.from(bytes);
    }
    create() { mockFs.files.set(this.uri, new Uint8Array()); }
    write(content: string | Uint8Array) {
      mockFs.files.set(this.uri, typeof content === 'string' ? Uint8Array.from(Buffer.from(content)) : Uint8Array.from(content));
    }
    delete() { mockFs.files.delete(this.uri); }
    move(destination: File) {
      const bytes = mockFs.files.get(this.uri);
      if (!bytes) throw new Error('source does not exist');
      mockFs.files.set(destination.uri, bytes);
      mockFs.files.delete(this.uri);
      this.uri = destination.uri;
    }
    static async downloadFileAsync(url: string, destination: File) {
      mockFs.downloadCalls.push(url);
      const remote = mockFs.remotes.get(url);
      if (remote instanceof Error) throw remote;
      if (!remote) throw new Error(`missing remote ${url}`);
      mockFs.files.set(destination.uri, Uint8Array.from(remote));
      return destination;
    }
  }
  mockFs.makeStageDirectory = (name: string) => new Directory('file://cache', name);
  return { Directory, File, Paths: { cache: new Directory('file://', 'cache') } };
});

vi.mock('@/features/chart-download-shared/chart-download-shared', () => ({
  downloadChartResource: async (
    directory: unknown,
    fileName: string,
    url: string,
    signal?: AbortSignal,
    onProgress?: (progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
  ) => {
    signal?.throwIfAborted();
    const { File } = await import('expo-file-system');
    onProgress?.({ totalBytesWritten: 0, totalBytesExpectedToWrite: 100 });
    const file = await File.downloadFileAsync(url, new File(directory as never, fileName));
    onProgress?.({ totalBytesWritten: 100, totalBytesExpectedToWrite: 100 });
    return file;
  },
}));

vi.mock('@/features/chart-preview-shared/chart-preview-assets', () => ({
  chartPreviewStageDirectory: (name: string) => mockFs.makeStageDirectory(name),
  createChartPreviewSessionDirectory: (name: string) => mockFs.makeStageDirectory(name),
  disposeChartPreviewSessionDirectory: (directory: { delete: () => void }) => directory.delete(),
  loadAssetFileUri: async (moduleId: number) => `file://asset/${moduleId}`,
  readAssetText: async (moduleId: number) => mockFs.readAssetTexts.get(moduleId) ?? '',
  stageAsset: async (moduleId: number, fileName: string) => {
    mockFs.stagedLocalAssets.push(`${moduleId}:${fileName}`);
    return null;
  },
}));

const SKIN_URL = 'https://rranker-phigros-data.cn-nb1.rains3.com/chart-preview/skin/Tap2.png';
const SKIN_BYTES = Uint8Array.from([1, 2, 3, 4]);
const SOUND_URL = 'https://rranker-phigros-data.cn-nb1.rains3.com/chart-preview/hit-sounds/click.wav';
const SOUND_BYTES = Uint8Array.from([9, 9, 9]);

function stageUri(fileName: string): string {
  return `file://cache/rranker-test/${fileName}`;
}

async function runPlan(
  overrides: Partial<Parameters<typeof prepareChartPreviewWebviewFromPlan>[0]> = {},
  onProgress?: Parameters<typeof prepareChartPreviewWebviewFromPlan>[2],
) {
  return prepareChartPreviewWebviewFromPlan({
    directoryName: 'rranker-test',
    stagedAssets: [],
    htmlModuleId: 1,
    buildHtml: (template, dataUrls) => `html(${template},${JSON.stringify(dataUrls)})`,
    ...overrides,
  }, undefined, onProgress);
}

describe('chart preview plan executor remote assets', () => {
  beforeEach(() => {
    mockFs.files.clear();
    mockFs.remotes.clear();
    mockFs.downloadCalls.length = 0;
    mockFs.stagedLocalAssets.length = 0;
    mockFs.readAssetTexts.clear();
    mockFs.readAssetTexts.set(1, '<html>');
  });

  it('downloads remote staged assets once and skips when a non-empty cache file exists', async () => {
    mockFs.remotes.set(SKIN_URL, SKIN_BYTES);

    await runPlan({ stagedAssets: [{ fileName: 'skin/Tap2.png', url: SKIN_URL, bytes: SKIN_BYTES.byteLength }] });

    expect(mockFs.downloadCalls).toEqual([SKIN_URL]);
    expect(mockFs.files.get(stageUri('skin/Tap2.png'))).toEqual(SKIN_BYTES);
    expect(mockFs.files.has(stageUri('skin/Tap2.png.part'))).toBe(false);

    await runPlan({ stagedAssets: [{ fileName: 'skin/Tap2.png', url: SKIN_URL, bytes: SKIN_BYTES.byteLength }] });
    expect(mockFs.downloadCalls).toEqual([SKIN_URL]);
  });

  it('skips a non-empty cache even when the byte estimate differs', async () => {
    mockFs.remotes.set(SKIN_URL, SKIN_BYTES);
    await runPlan({ stagedAssets: [{ fileName: 'skin/Tap2.png', url: SKIN_URL, bytes: SKIN_BYTES.byteLength }] });
    mockFs.files.set(stageUri('skin/Tap2.png'), Uint8Array.from([1]));

    await runPlan({ stagedAssets: [{ fileName: 'skin/Tap2.png', url: SKIN_URL, bytes: SKIN_BYTES.byteLength }] });
    expect(mockFs.downloadCalls).toEqual([SKIN_URL]);
    expect(mockFs.files.get(stageUri('skin/Tap2.png'))).toEqual(Uint8Array.from([1]));
  });

  it('accepts a remote file when the byte estimate is wrong', async () => {
    const badUrl = `${SKIN_URL}?bad`;
    mockFs.remotes.set(badUrl, SKIN_BYTES);
    await runPlan({
      stagedAssets: [{ fileName: 'skin/Bad.png', url: badUrl, bytes: SKIN_BYTES.byteLength + 1 }],
    });
    expect(mockFs.files.get(stageUri('skin/Bad.png'))).toEqual(SKIN_BYTES);
    expect(mockFs.files.has(stageUri('skin/Bad.png.part'))).toBe(false);
  });

  it('keeps local moduleId assets on the stageAsset path', async () => {
    mockFs.remotes.set(SKIN_URL, SKIN_BYTES);
    const result = await runPlan({
      stagedAssets: [
        { fileName: 'player.js', moduleId: 7 },
        { fileName: 'skin/Tap2.png', url: SKIN_URL, bytes: SKIN_BYTES.byteLength },
      ],
    });

    expect(mockFs.stagedLocalAssets).toEqual(['7:player.js']);
    expect(result.uri).toBe(stageUri('index.html'));
    result.dispose();
    expect(mockFs.files.has(stageUri('index.html'))).toBe(false);
  });

  it('feeds remote data url assets to buildHtml after staging them', async () => {
    mockFs.remotes.set(SOUND_URL, SOUND_BYTES);
    let seen: Record<string, string> = {};
    await runPlan({
      dataUrlAssets: [{ key: 'click', fileName: 'hit-sounds/click.wav', url: SOUND_URL, bytes: SOUND_BYTES.byteLength }],
      buildHtml: (_template, dataUrls) => {
        seen = dataUrls;
        return 'html';
      },
    });

    expect(mockFs.downloadCalls).toEqual([SOUND_URL]);
    expect(mockFs.files.get(stageUri('hit-sounds/click.wav'))).toEqual(SOUND_BYTES);
    expect(seen.click).toBe(`data:audio/wav;base64,b64:${stageUri('hit-sounds/click.wav')}`);
  });

  it('reports monotonic remote download then player progress', async () => {
    mockFs.remotes.set(SKIN_URL, SKIN_BYTES);
    const values: number[] = [];
    await runPlan(
      { stagedAssets: [{ fileName: 'skin/Tap2.png', url: SKIN_URL, bytes: SKIN_BYTES.byteLength }] },
      (progress) => values.push(progress.value),
    );
    expect(values.length).toBeGreaterThan(1);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]!).toBeGreaterThanOrEqual(values[index - 1]!);
    }
    expect(values[values.length - 1]).toBe(1);
  });

  it('Phigros/Phira prepare 用 downloadChartResource 报告谱面、音乐与 zip 进度', () => {
    const prepare = readFileSync(
      resolve(process.cwd(), 'src/features/phigros-chart-preview/prepare-phigros-chart-preview-webview.ts'),
      'utf8',
    );
    expect(prepare).toContain('export function createPhigrosPreviewResourceRead');
    expect(prepare).toContain('export async function downloadPhiraChartPreviewZip');
    expect(prepare).toContain('downloadChartResource');
    expect(prepare).toContain('weightedChartPreviewProgress');
    expect(prepare).toContain("'preview-chart.zip'");
    expect(prepare).toContain('CHART_PREVIEW_RESOURCE_LABEL');
  });
});
