import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareChartPreviewWebviewFromPlan } from '@/features/chart-preview-shared/prepare-chart-preview-webview-from-plan';
import {
  MAIMAI_CHART_PREVIEW_ANSWER_SOUND,
  MAIMAI_CHART_PREVIEW_ASSET_BASE,
  MAIMAI_CHART_PREVIEW_SKIN_ASSETS,
} from '@/features/maimai-chart-preview/maimai-chart-preview-skin-manifest.generated';
import {
  isMaimaiChartPreviewRuntimeSkinPath,
  maimaiChartPreviewRuntimeSkinAssets,
  maimaiChartPreviewSkinStagePath,
} from '@/features/maimai-chart-preview/maimai-chart-preview-skin-files';
import {
  eachLineSkinPath,
  guideSkinPath,
  holdEndSkinPath,
  holdSkinPath,
  slideSkinPath,
  starSkinPath,
  tapSkinPath,
  touchBorderSkinPath,
  touchPointSkinPath,
  touchSkinPath,
  wifiSkinPath,
} from '@/features/maimai-chart-preview/engine/renderers/skinAtlas';
import { judgeTextSkinPath, slideOkShape, slideOkSkinPath } from '@/features/maimai-chart-preview/engine/utils/judgeHint';

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
    copy(destination: File) {
      const bytes = mockFs.files.get(this.uri);
      if (!bytes) throw new Error('source does not exist');
      mockFs.files.set(destination.uri, Uint8Array.from(bytes));
    }
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
    expect(prepare).toContain('maimaiChartPreviewRuntimeSkinAssets');
    expect(prepare).toContain('maimaiChartPreviewSkinStagePath');
    expect(prepare).toContain('MAIMAI_CHART_PREVIEW_ANSWER_SOUND');
    expect(prepare).toContain('remoteCacheDirectory');
  });

  it('flattens runtime skins under skin/ and excludes autoplay-unused mine art', () => {
    expect(maimaiChartPreviewSkinStagePath('TapSkins/tap.png')).toBe('skin/TapSkins_tap.png');
    expect(isMaimaiChartPreviewRuntimeSkinPath('TapSkins/tap.png')).toBe(true);
    expect(isMaimaiChartPreviewRuntimeSkinPath('TapSkins/tap_mine.png')).toBe(false);
    expect(isMaimaiChartPreviewRuntimeSkinPath('NoteGuideSkins/Mine.png')).toBe(false);
    expect(isMaimaiChartPreviewRuntimeSkinPath('HoldSkins/hold_off.png')).toBe(false);
    expect(maimaiChartPreviewRuntimeSkinAssets().length).toBeLessThan(MAIMAI_CHART_PREVIEW_SKIN_ASSETS.length);
    expect(maimaiChartPreviewRuntimeSkinAssets().every((asset) => !asset.path.toLowerCase().includes('mine'))).toBe(true);
  });

  it('covers every sprite path the autoplay renderer can request', () => {
    const runtime = new Set(maimaiChartPreviewRuntimeSkinAssets().map((asset) => asset.path));
    const required = new Set<string>([
      'outline.png',
      'TapSkins/tap_ex.png',
      'HoldSkins/hold_ex.png',
      'StarSkins/star_ex.png',
      'StarSkins/star_ex_double.png',
      'TouchHoldSkins/touchhold_border.png',
      'TouchHoldSkins/touchhold_break_border.png',
    ]);
    for (let i = 0; i < 4; i += 1) {
      required.add(`TouchHoldSkins/touchhold_${i}.png`);
      required.add(`TouchHoldSkins/touchhold_break_${i}.png`);
    }
    for (const isBreak of [false, true]) {
      for (const isEach of [false, true]) {
        required.add(tapSkinPath(isBreak, isEach));
        required.add(holdSkinPath(isBreak, isEach, false));
        required.add(holdSkinPath(isBreak, isEach, true));
        required.add(holdEndSkinPath(isBreak, isEach));
        required.add(slideSkinPath(isBreak, isEach, false));
        required.add(slideSkinPath(isBreak, isEach, true));
        required.add(touchSkinPath(isBreak, isEach));
        required.add(touchPointSkinPath(isBreak, isEach));
        for (const count of [2, 3] as const) {
          const border = touchBorderSkinPath(count, isBreak, isEach);
          if (border) required.add(border);
        }
        for (const isDouble of [false, true]) {
          for (const pink of [false, true]) {
            required.add(starSkinPath(isBreak, isEach, isDouble, pink));
          }
        }
        for (let wifi = 0; wifi <= 10; wifi += 1) {
          required.add(wifiSkinPath(wifi, isBreak, isEach, false));
          required.add(wifiSkinPath(wifi, isBreak, isEach, true));
        }
      }
    }
    for (const span of [1, 2, 3, 4] as const) required.add(eachLineSkinPath(span));
    for (const kind of ['normal', 'each', 'break', 'slide'] as const) required.add(guideSkinPath(kind));
    for (const kind of ['cPerfect', 'perfect', 'cPerfectBreak', 'break2600', 'break2550'] as const) {
      required.add(judgeTextSkinPath(kind));
    }
    for (const type of ['w', '-', 'q']) {
      for (const start of [1, 5]) {
        for (const end of [1, 2, 3, 8]) {
          const shape = slideOkShape(type, start, end);
          required.add(slideOkSkinPath(shape, 'just'));
          required.add(slideOkSkinPath(shape, 'critical'));
        }
      }
    }
    const missing = [...required].filter((path) => !runtime.has(path));
    expect(missing).toEqual([]);
  });

  it('copies remote skins from a persistent cache directory without re-downloading', async () => {
    mockFs.remotes.set(TAP.url, TAP_BYTES);
    const cacheDir = mockFs.makeStageDirectory('rranker-chart-preview-remote') as never;
    const stagedName = maimaiChartPreviewSkinStagePath(TAP.path);

    await runPlan({
      remoteCacheDirectory: cacheDir,
      stagedAssets: [{ fileName: stagedName, url: TAP.url, bytes: TAP.bytes }],
    });
    expect(mockFs.downloadCalls).toEqual([TAP.url]);
    expect(mockFs.files.get(`file://cache/rranker-chart-preview-remote/${stagedName}`)?.byteLength).toBe(TAP.bytes);

    for (const key of [...mockFs.files.keys()]) {
      if (key.startsWith('file://cache/rranker-test/')) mockFs.files.delete(key);
    }

    await runPlan({
      remoteCacheDirectory: cacheDir,
      stagedAssets: [{ fileName: stagedName, url: TAP.url, bytes: TAP.bytes }],
    });
    expect(mockFs.downloadCalls).toEqual([TAP.url]);
    expect(mockFs.files.get(stageUri(stagedName))?.byteLength).toBe(TAP.bytes);
  });
});
