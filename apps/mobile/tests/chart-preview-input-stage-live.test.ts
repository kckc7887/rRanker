/**
 * 谱面确认“传入阶段” live 演示（默认跳过，仅在显式开启时联网执行）：
 *   $env:CHART_PREVIEW_INPUT_STAGE_LIVE='1'; pnpm test:unit -- tests/chart-preview-input-stage-live.test.ts
 *
 * 用与谱面确认屏幕完全相同的公共实现（chart-preview-input.ts）跑真实数据：
 * - Phigros 测试列表 5 首问题歌曲：经 OSS current/catalog/manifest 定位
 *   每个存在难度的谱面/音乐/曲绘，并验证资源 URL 实际可读取、谱面 JSON 可解析。
 * - Phira 测试列表 7 个问题谱面：经社区 API + 谱面包解包构建播放器配置，
 *   验证谱面文本、音乐 base64、RPE 表演素材（extra.json/shader/落盘资源）完整传入。
 * - 用真实播放器 HTML 模板验证配置注入不截断、不丢字符。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPhigrosChartPreviewInput,
  buildPhiraChartPreviewInput,
} from '@/features/phigros-chart-preview/chart-preview-input';
import { loadPhigrosChartPreviewBundle } from '@/domain/phigros-chart-preview';
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
  it('Phigros：5 首问题歌曲全部难度经 OSS 定位并产出可读取的谱面/音乐/曲绘', async () => {
    for (const songId of PHIGROS_CASES) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      try {
        for (let levelIndex = 0; levelIndex <= 3; levelIndex += 1) {
          const bundle = await withRetry(() => loadPhigrosChartPreviewBundle({
            songId,
            difficulty: ['EZ', 'HD', 'IN', 'AT'][levelIndex]!,
          }, controller.signal)).catch((error: unknown) => {
            // 目录中没有的难度（如 Ramification 无 AT）必须给出明确错误而不是静默。
            const message = error instanceof Error ? error.message : String(error);
            if (/不存在 .* 难度/.test(message)) return null;
            throw error;
          });
          if (!bundle) continue;

          const prepared = await buildPhigrosChartPreviewInput(
            { songId, levelIndex, title: `${songId} IN` },
            {},
            controller.signal,
          );
          expect(prepared.config.chartUrl).toBe(bundle.chart.url);
          expect(prepared.config.musicUrl).toBe(bundle.music.url);
          expect(prepared.config.illustrationUrl).toBe(bundle.illustration.url);

          // 播放器实际要读取的三个资源：谱面文本可解析、音乐与曲绘可下载。
          const chartText = await withRetry(async () => {
            const res = await fetch(prepared.config.chartUrl!, { signal: controller.signal });
            expect(res.ok).toBe(true);
            return res.text();
          });
          const chartJson = JSON.parse(chartText) as { judgeLineList?: unknown[] };
          expect(Array.isArray(chartJson.judgeLineList)).toBe(true);

          for (const url of [prepared.config.musicUrl!, prepared.config.illustrationUrl!]) {
            await withRetry(async () => {
              const res = await fetch(url, { signal: controller.signal, headers: { Range: 'bytes=0-2047' } });
              expect(res.status === 200 || res.status === 206).toBe(true);
              const buffer = await res.arrayBuffer();
              expect(buffer.byteLength).toBeGreaterThan(64);
            });
          }
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

        // 谱面文本完整且可解析。
        expect(prepared.config.chartText).toBeTruthy();
        const chartJson = JSON.parse(prepared.config.chartText!) as { judgeLineList?: unknown[] };
        expect(Array.isArray(chartJson.judgeLineList)).toBe(true);

        // 音乐 base64 与谱面包原始字节一一对应。
        expect(prepared.musicDataBase64).toBeTruthy();
        const musicBytes = [...staged.entries()].find(([name]) => name.endsWith('.mp3'))?.[1];
        expect(musicBytes).toBeTruthy();
        expect(Buffer.from(prepared.musicDataBase64!, 'base64').length).toBe(musicBytes!.length);

        if (prepared.config.format === 'rpe') {
          expect(prepared.config.rpeAssets?.basePath).toBe(`./rpe/${chartId}/`);
          expect(prepared.config.rpeAssets?.infoYml).toBeTruthy();
        }
        // 35829 是带完整演出的特殊谱面：extra.json + shader + 皮肤贴图必须传入。
        if (chartId === 35829) {
          expect(prepared.config.format).toBe('rpe');
          expect(prepared.config.rpeAssets?.extraJson).toBeTruthy();
          expect(prepared.config.rpeAssets?.shaders['camera_pr.glsl']).toBeTruthy();
          for (const skin of ['Tap.png', 'TapHL.png', 'Drag.png', 'Flick.png', 'FlickHL.png', 'Quit.png']) {
            expect(staged.has(`rpe/35829/${skin}`)).toBe(true);
          }
        }
        // 66661 是最大社区谱面（约 24MB），必须整体注入不截断。
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
      const injected = /<script>window\.__PHIGROS_CHART_PREVIEW__=(.*);<\/script>/s.exec(html)?.[1];
      expect(injected).toBeTruthy();
      const roundtrip = JSON.parse(injected!) as { chartText?: string; settings?: { playbackSpeed?: number } };
      expect(roundtrip.chartText).toBe(prepared.config.chartText);
      expect(roundtrip.settings?.playbackSpeed).toBe(1.25);
      // 注入脚本本身的 JSON 化输出与配置完全一致（公共序列化路径）。
      expect(injected).toBe(buildPhigrosChartPreviewConfigJson(prepared.config));
    } finally {
      clearTimeout(timeout);
    }
  }, 600_000);
});
