import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { computeModDifficulty, drawCursor, parseBeatmap, synthesizeAutoReplay, type Renderer, type SkinAssets } from '../../src/features/osu-chart-preview/webview-player/engine';
import { PreviewSession, createGameplaySkin } from '../../src/features/osu-chart-preview/webview-player/playback';
import type { AudioSync } from '../../src/features/osu-chart-preview/webview-player/engine-audio/AudioSync';
import type { PreviewMedia } from '../../src/features/osu-chart-preview/webview-player/backdrop';
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
  it('suppresses the original cursor without changing shared skin images or other modes', () => {
    const original = skin();
    const gameplay = createGameplaySkin(original, 0);
    assert.notEqual(gameplay.images, original.images);
    assert.equal(gameplay.sounds, original.sounds);
    assert.equal(gameplay.spinnerImages, original.spinnerImages);
    for (const stem of ['cursor', 'cursormiddle', 'cursortrail']) {
      assert.equal(gameplay.images.get(`${stem}.png`), original.images.get('hit300.png'));
      assert.equal(gameplay.images.get(`${stem}@2x.png`), original.images.get('hit300.png'));
      assert.notEqual(original.images.get(`${stem}@2x.png`), original.images.get('hit300.png'));
    }
    for (const mode of [1, 2, 3]) assert.equal(createGameplaySkin(original, mode), original);
    assert.throws(() => createGameplaySkin({ ...original, images: new Map([['hit300.png', image('too-small', 1, 1)]]) }, 0));
  });

  it('draws the real cursor and translucent trail exactly once after Overlay at engine-adjusted time', async () => {
    const realSkin = skin();
    const gameplaySkin = createGameplaySkin(realSkin, 0);
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
        drawCursor(context, replay, timeMs, gameplaySkin);
        options.hudOverlay?.(context, timeMs);
      },
      stop() {},
    } as unknown as Renderer;
    const media = {
      sync() {}, dispose() {}, drawUnder() {}, configure() {},
      drawOver(_ctx: CanvasRenderingContext2D, timeMs: number) { draws.push({ label: `Overlay:${timeMs}` }); },
    } as unknown as PreviewMedia;
    const audio = { pause() {}, destroy() {}, setStoryboardEnabled() {} } as unknown as AudioSync;
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
