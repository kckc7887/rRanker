import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { computeModDifficulty, parseBeatmap, synthesizeAutoReplay, type Renderer, type SkinAssets } from '@rranker/chart-osu/features/osu-chart-preview/webview-player/engine';
import { PreviewSession } from '@rranker/chart-osu/features/osu-chart-preview/webview-player/playback';
import type { AudioSync } from '@rranker/chart-osu/features/osu-chart-preview/webview-player/engine-audio/AudioSync';
import type { PreviewMedia } from '@rranker/chart-osu/features/osu-chart-preview/webview-player/backdrop';
import { fixtureOsu } from './fixtures';

type LabelledBitmap = ImageBitmap & { label: string };
function image(label: string, width = 40, height = 40): LabelledBitmap {
  return { label, width, height, close() {} } as LabelledBitmap;
}

function skin(): SkinAssets {
  return {
    images: new Map([
      ['hit300.png', image('transparent', 2, 2)],
      ['cursor@2x.png', image('cursor')],
      ['cursormiddle@2x.png', image('middle')],
      ['cursortrail@2x.png', image('trail')],
    ]),
    sounds: new Map(), spinnerImages: new Map(), config: {} as SkinAssets['config'],
  };
}

describe('standard cursor above storyboard Overlay', () => {
  it('draws the real cursor and translucent trail exactly once after Overlay at engine-adjusted time', async () => {
    const realSkin = skin();
    const beatmap = parseBeatmap(fixtureOsu(0, 'Easy'));
    const replay = synthesizeAutoReplay(beatmap, '', [
      { time: 0, x: 10, y: 192, keys: 0 },
      { time: 1000, x: 510, y: 192, keys: 0 },
    ]);
    const draws: { label: string; centerX?: number }[] = [];
    const context = {
      save() {}, restore() {}, globalAlpha: 1,
      drawImage(bitmap: LabelledBitmap, x: number, _y: number, width: number) {
        if (bitmap.label !== 'transparent') draws.push({ label: bitmap.label, centerX: x + width / 2 });
      },
    } as unknown as CanvasRenderingContext2D;
    const options = { audioOffsetMs: 0 } as Renderer['options'];
    const renderer = {
      options, oldOffsetMs: 24,
      renderFrameAt(timeMs: number) {
        draws.push({ label: 'gameplay' });
        options.hudOverlay?.(context, timeMs);
      },
      dispose() {},
    } as unknown as Renderer;
    const media = {
      sync() {}, dispose() {}, drawUnder() {}, configure() {},
      drawOver(_ctx: CanvasRenderingContext2D, timeMs: number) { draws.push({ label: `Overlay:${timeMs}` }); },
    } as unknown as PreviewMedia;
    let position = 0;
    const audio = {
      get outputTimeMs() { return position; },
      playback: { onFrame(_time: number, _jump: boolean) {}, async seek(time: number) { position = time * 1000; this.onFrame(time, true); } },
      pause() {}, destroy() {}, setSpeed() {}, setStoryboardEnabled() {},
    } as unknown as AudioSync;
    const session = new PreviewSession({} as HTMLCanvasElement, beatmap, replay, computeModDifficulty(beatmap, replay), renderer, audio, media,
      { startMs: 0, endMs: 2000, durationMs: 2000 }, new AbortController(), realSkin);
    draws.length = 0;
    await session.seek(500, false);
    assert.deepEqual(draws.map(draw => draw.label), ['gameplay', 'Overlay:500', 'trail', 'cursor', 'middle']);
    // oldOffset 24 ms means x=248 at 476 ms, rather than x=260 at the raw 500 ms.
    assert.equal(draws.find(draw => draw.label === 'cursor')!.centerX, 628.75);
    session.destroy();
  });
});
