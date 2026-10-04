/** 联网检查：CHART_PREVIEW_INPUT_STAGE_LIVE=1 npm run test:unit -- tests/chart-preview-input-stage-live.test.ts。 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPhigrosChartPreviewInput } from '@/features/phigros-chart-preview/chart-preview-input';
import { buildPhiraChartPreviewInput } from '@/features/phira-chart-preview/chart-preview-input';
import {
  loadPhigrosChartPreviewResources,
  loadPhigrosChartPreviewVariants,
} from '@/services/phigros-chart-preview-resources';
import {
  applyPhigrosChartPreviewConfigToHtml,
  buildPhigrosChartPreviewConfigJson,
} from '@/features/phigros-chart-preview/phigros-chart-preview-inject';
import { phiraProvider } from '@/providers/phira-provider';

const live = process.env.CHART_PREVIEW_INPUT_STAGE_LIVE === '1' ? describe : describe.skip;

const PHIGROS_CASES = [
  '祈-我ら神祖と共に歩む者なり-.光吉猛修VS穴山大輔VSKaiVS水野健治VS大国奏音',
  'Ramification.rareguyReina',
  'ERABYECONNEC10N.かめりあ',
  'INFiNiTEENERZYOverdoze.RekuMochizuki',
  'AvataarReincarnationofKalpa.ScarletteakaCrYmson',
] as const;

const PHIRA_CASES = [19365, 27282, 42017, 50299, 36040, 35829, 66661] as const;

/** OSS 偶发 SSL 握手失败，live 演示统一重试。 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4, delayMs = 2500): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((done) => setTimeout(done, delayMs * attempt));
    }
  }
  throw lastError;
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

live('谱面确认传入阶段 live 演示', () => {
  it('Phigros：Random 全部 IN 里谱产出完整播放器配置', async () => {
    const songId = 'Random.SobremSilentroom';
    const signal = AbortSignal.timeout(300_000);
    const variants = await loadPhigrosChartPreviewVariants({ songId, difficulty: 'IN' }, signal);
    expect(variants).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const variantIndex of variants.filter((value) => value !== 0)) {
      const prepared = await buildPhigrosChartPreviewInput({ songId, levelIndex: 2, variantIndex }, {}, signal);
      expect(JSON.parse(prepared.config.chartText!).judgeLineList.length).toBeGreaterThan(0);
      expect(Buffer.from(prepared.musicDataBase64!, 'base64').subarray(0, 4).toString()).toBe('OggS');
      expect(prepared.config.illustrationUrl).toMatch(/^data:image\/png;base64,/);
      expect(prepared.config.title).toContain(`里谱 ${variantIndex}`);
    }
  }, 300_000);

  it('Phigros：5 首问题歌曲全部难度经 OSS 定位并产出可读取的谱面/音乐/曲绘', async () => {
    for (const songId of PHIGROS_CASES) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      try {
        for (let levelIndex = 0; levelIndex <= 3; levelIndex += 1) {
          const resources = await withRetry(() => loadPhigrosChartPreviewResources({
            songId,
            difficulty: ['EZ', 'HD', 'IN', 'AT'][levelIndex]!,
          }, controller.signal)).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            if (/不存在 .* 难度/.test(message)) return null;
            throw error;
          });
          if (!resources) continue;
          const { bundle } = resources;

          const prepared = await buildPhigrosChartPreviewInput(
            { songId, levelIndex, title: `${songId} IN` },
            {},
            controller.signal,
          );
          const chartJson = JSON.parse(prepared.config.chartText!) as { judgeLineList?: unknown[] };
          expect(Array.isArray(chartJson.judgeLineList)).toBe(true);
          expect(Buffer.from(prepared.musicDataBase64!, 'base64').length).toBe(bundle.music.size);
          const illustration = prepared.config.illustrationUrl!.split(',')[1]!;
          expect(Buffer.from(illustration, 'base64').length).toBe(bundle.illustration.size);

        }
      } finally {
        clearTimeout(timeout);
      }
    }
  }, 600_000);

  it('Phira：7 个问题谱面全部构建出完整播放器配置（谱面/音乐/表演素材）', async () => {
    for (const chartId of PHIRA_CASES) {
      const staged = new Map<string, Uint8Array>();
      const staging = {
        stageMusic: async (bytes: Uint8Array, fileName: string) => {
          staged.set(fileName, bytes);
          return { uri: `mem://${fileName}`, base64: bytesToBase64(bytes) };
        },
        stageRpeBundle: async (chartId: number, files: readonly { name: string; bytes: Uint8Array }[]) => {
          for (const file of files) staged.set(`rpe/${chartId}/${file.name}`, file.bytes);
          return { basePath: `./rpe/${chartId}/` };
        },
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000);
      try {
        const chart = await phiraProvider.getChart(chartId, controller.signal);
        expect(typeof chart.file).toBe('string');
        const prepared = await buildPhiraChartPreviewInput(
          { chartId, title: chart.name, chart },
          {},
          controller.signal,
          staging,
        );
        expect(prepared.config.game).toBe('phira');
        expect(prepared.config.title).toBe(chart.name);
        expect(prepared.config.chartText).toBeTruthy();
        const chartJson = JSON.parse(prepared.config.chartText!) as { judgeLineList?: unknown[] };
        expect(Array.isArray(chartJson.judgeLineList)).toBe(true);
        expect(prepared.musicDataBase64).toBeTruthy();
        const musicBytes = [...staged.entries()].find(([name]) => name.endsWith('.mp3'))?.[1];
        expect(musicBytes).toBeTruthy();
        expect(Buffer.from(prepared.musicDataBase64!, 'base64').length).toBe(musicBytes!.length);

        if (prepared.config.format === 'rpe') {
          expect(prepared.config.rpeAssets?.basePath).toBe(`./rpe/${chartId}/`);
          expect(prepared.config.rpeAssets?.infoYml).toBeTruthy();
        }
        if (chartId === 35829) {
          expect(prepared.config.format).toBe('rpe');
          expect(prepared.config.rpeAssets?.extraJson).toBeTruthy();
          expect(prepared.config.rpeAssets?.shaders['camera_pr.glsl']).toBeTruthy();
          for (const skin of ['Tap.png', 'TapHL.png', 'Drag.png', 'Flick.png', 'FlickHL.png', 'Quit.png']) {
            expect(staged.has(`rpe/35829/${skin}`)).toBe(true);
          }
        }
        if (chartId === 66661) {
          expect(prepared.config.chartText!.length).toBeGreaterThan(20_000_000);
        }
      } finally {
        clearTimeout(timeout);
      }
    }
  }, 600_000);

  it('配置注入：最大谱面（66661）经真实 HTML 模板注入后不截断、不丢字符', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const chart = await phiraProvider.getChart(66661, controller.signal);
      const staging = {
        stageMusic: async (bytes: Uint8Array, fileName: string) => ({ uri: `mem://${fileName}`, base64: bytesToBase64(bytes) }),
        stageRpeBundle: async () => ({ basePath: './rpe/66661/' }),
      };
      const prepared = await buildPhiraChartPreviewInput(
        { chartId: 66661, chart },
        { playbackSpeed: 1.25 },
        controller.signal,
        staging,
      );
      const templatePath = resolve(process.cwd(), 'src/features/phigros-chart-preview/webview-player/index.html');
      const template = readFileSync(templatePath, 'utf8');
      const html = applyPhigrosChartPreviewConfigToHtml(template, prepared.config);

      expect(html.includes('<!--PHIGROS_CHART_PREVIEW_CONFIG-->')).toBe(false);
      const injected = /<script>window\.__PHIGROS_CHART_PREVIEW__=(.*?);<\/script>/s.exec(html)?.[1];
      expect(injected).toBeTruthy();
      const roundtrip = JSON.parse(injected!) as { chartText?: string; settings?: { playbackSpeed?: number } };
      expect(roundtrip.chartText).toBe(prepared.config.chartText);
      expect(roundtrip.settings?.playbackSpeed).toBe(1.25);
      expect(injected).toBe(buildPhigrosChartPreviewConfigJson(prepared.config));
    } finally {
      clearTimeout(timeout);
    }
  }, 600_000);
});
