import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareChartPreviewWebviewFromPlan } from '@/features/chart-preview-shared/prepare-chart-preview-webview-from-plan';
import {
  MAIMAI_CHART_PREVIEW_ANSWER_SOUND,
  MAIMAI_CHART_PREVIEW_ASSET_BASE,
  MAIMAI_CHART_PREVIEW_SKIN_ASSETS,
} from '@/features/maimai-chart-preview/maimai-chart-preview-skin-manifest.generated';

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

const TAP = MAIMAI_CHART_PREVIEW_SKIN_ASSETS.find((asset) => asset.path === 'TapSkins/tap.png')!;
const OUTLINE = MAIMAI_CHART_PREVIEW_SKIN_ASSETS.find((asset) => asset.path === 'outline.png')!;
const TAP_BYTES = Uint8Array.from({ length: TAP.bytes }, (_, index) => index % 256);
const OUTLINE_BYTES = Uint8Array.from({ length: OUTLINE.bytes }, (_, index) => index % 256);
const ANSWER_BYTES = Uint8Array.from({ length: MAIMAI_CHART_PREVIEW_ANSWER_SOUND.bytes }, (_, index) => index % 256);

function stageUri(fileName: string): string {
  return `file://cache/rranker-test/${fileName}`;
}

async function runPlan(overrides: Partial<Parameters<typeof prepareChartPreviewWebviewFromPlan>[0]> = {}) {
  return prepareChartPreviewWebviewFromPlan({
    directoryName: 'rranker-test',
    stagedAssets: [],
    htmlModuleId: 1,
    buildHtml: (template, dataUrls) => `html(${template},${JSON.stringify(dataUrls)})`,
    ...overrides,
  });
}

describe('maimai chart preview remote assets', () => {
  beforeEach(() => {
    mockFs.files.clear();
    mockFs.remotes.clear();
    mockFs.downloadCalls.length = 0;
    mockFs.stagedLocalAssets.length = 0;
    mockFs.readAssetTexts.clear();
    mockFs.readAssetTexts.set(1, '<html>');
  });

  it('pins skin and answer.wav to the maimai object-storage prefix', () => {
    expect(MAIMAI_CHART_PREVIEW_ASSET_BASE).toBe('https://rranker-maimai-data.cn-nb1.rains3.com/chart-preview');
    expect(TAP.url).toBe(`${MAIMAI_CHART_PREVIEW_ASSET_BASE}/TapSkins/tap.png`);
    expect(OUTLINE.url).toBe(`${MAIMAI_CHART_PREVIEW_ASSET_BASE}/outline.png`);
    expect(MAIMAI_CHART_PREVIEW_ANSWER_SOUND.url).toBe(`${MAIMAI_CHART_PREVIEW_ASSET_BASE}/answer.wav`);
    expect(MAIMAI_CHART_PREVIEW_SKIN_ASSETS.some((asset) => asset.path === 'sensor.webp')).toBe(false);
  });

  it('stages skin relative paths and skips download when cached size matches', async () => {
    mockFs.remotes.set(TAP.url, TAP_BYTES);

    await runPlan({ stagedAssets: [{ fileName: TAP.path, url: TAP.url, bytes: TAP.bytes }] });

    expect(mockFs.downloadCalls).toEqual([TAP.url]);
    expect(mockFs.files.get(stageUri('TapSkins/tap.png'))?.byteLength).toBe(TAP.bytes);

    await runPlan({ stagedAssets: [{ fileName: TAP.path, url: TAP.url, bytes: TAP.bytes }] });
    expect(mockFs.downloadCalls).toEqual([TAP.url]);
  });

  it('stages outline.png beside player.js and feeds remote answer.wav as a data URL', async () => {
    mockFs.remotes.set(OUTLINE.url, OUTLINE_BYTES);
    mockFs.remotes.set(MAIMAI_CHART_PREVIEW_ANSWER_SOUND.url, ANSWER_BYTES);
    let seen: Record<string, string> = {};

    const result = await runPlan({
      stagedAssets: [
        { fileName: 'player.js', moduleId: 7 },
        { fileName: OUTLINE.path, url: OUTLINE.url, bytes: OUTLINE.bytes },
      ],
      dataUrlAssets: [{
        key: 'answerSoundUrl',
        fileName: MAIMAI_CHART_PREVIEW_ANSWER_SOUND.path,
        url: MAIMAI_CHART_PREVIEW_ANSWER_SOUND.url,
        bytes: MAIMAI_CHART_PREVIEW_ANSWER_SOUND.bytes,
      }],
      buildHtml: (_template, dataUrls) => {
        seen = dataUrls;
        return 'html';
      },
    });

    expect(mockFs.stagedLocalAssets).toEqual(['7:player.js']);
    expect(mockFs.files.get(stageUri('outline.png'))?.byteLength).toBe(OUTLINE.bytes);
    expect(mockFs.files.get(stageUri('answer.wav'))?.byteLength).toBe(MAIMAI_CHART_PREVIEW_ANSWER_SOUND.bytes);
    expect(seen.answerSoundUrl).toBe(`data:audio/wav;base64,b64:${stageUri('answer.wav')}`);
    result.dispose();
  });

  it('does not Metro-pack sensor.webp or answer.wav', () => {
    const prepare = readFileSync(
      resolve(process.cwd(), 'src/features/maimai-chart-preview/prepare-chart-preview-webview.ts'),
      'utf8',
    );
    expect(prepare).not.toContain('sensor.webp');
    expect(prepare).not.toContain("require('../../../assets/maimai-chart-preview/answer.wav')");
    expect(prepare).toContain('MAIMAI_CHART_PREVIEW_SKIN_ASSETS');
    expect(prepare).toContain('MAIMAI_CHART_PREVIEW_ANSWER_SOUND');
  });
});
