import assert from 'node:assert/strict';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { buildFlatSliderBody } from '../../src/features/osu-chart-preview/webview-player/flat-slider';
import { computeModDifficulty, parseBeatmap, synthesizeAutoReplay } from '../../src/features/osu-chart-preview/webview-player/engine';
import type { SkinAssets } from '../../src/features/osu-chart-preview/webview-player/engine';
import { drawHitObjects } from '../../src/features/osu-chart-preview/webview-player/engine/renderer/HitObjectRenderer';
import { fixtureOsu } from './fixtures';

type Stroke = { width: number; color: string; cap: string; join: string };
class RecordingCanvas {
  strokes: Stroke[] = [];
  points: number[][] = [];
  scales: number[][] = [];
  constructor(readonly width: number, readonly height: number) {}
  getContext() {
    const owner = this;
    return {
      lineWidth: 1, strokeStyle: '', lineCap: '', lineJoin: '',
      scale(x: number, y: number) { owner.scales.push([x, y]); },
      beginPath() {},
      moveTo(x: number, y: number) { owner.points.push([x, y]); },
      lineTo(x: number, y: number) { owner.points.push([x, y]); },
      stroke() { owner.strokes.push({ width: this.lineWidth, color: this.strokeStyle, cap: this.lineCap, join: this.lineJoin }); },
    };
  }
}
const originalCanvas = globalThis.OffscreenCanvas;
beforeAll(() => { globalThis.OffscreenCanvas = RecordingCanvas as unknown as typeof OffscreenCanvas; });
afterAll(() => {
  if (originalCanvas) globalThis.OffscreenCanvas = originalCanvas;
  else Reflect.deleteProperty(globalThis, 'OffscreenCanvas');
});

describe('flat slider drawing', () => {
  it('keeps transformed path, integer cache bounds, canonical circle radius and supersampling', () => {
    const body = buildFlatSliderBody([{ x: 1, y: 2 }, { x: 21, y: 12 }], 64, '#f4f8ff', '#13243b', 2, (x, y) => [10 + x * 2, 20 + y * 2]);
    assert.ok(body);
    assert.deepEqual({ ox: body.ox, oy: body.oy, w: body.w, h: body.h }, { ox: -54, oy: -42, w: 172, h: 152 });
    const canvas = body.bmp as unknown as RecordingCanvas;
    assert.deepEqual([canvas.width, canvas.height], [344, 304]);
    assert.deepEqual(canvas.scales, [[2, 2]]);
    assert.deepEqual(canvas.points, [[66, 66], [106, 86]]);
    assert.deepEqual(canvas.strokes, [
      { width: 118, color: '#f4f8ff', cap: 'round', join: 'round' },
      { width: 112, color: '#13243b', cap: 'round', join: 'round' },
    ]);
  });

  it('does not allocate a track for malformed or incomplete paths', () => {
    const transform = (x: number, y: number): [number, number] => [x, y];
    assert.equal(buildFlatSliderBody([], 30, '#fff', '#000', 1, transform), null);
    assert.equal(buildFlatSliderBody([{ x: 1, y: 2 }], 30, '#fff', '#000', 1, transform), null);
    assert.equal(buildFlatSliderBody([{ x: 1, y: 2 }, { x: NaN, y: 2 }], 30, '#fff', '#000', 1, transform), null);
    assert.equal(buildFlatSliderBody([{ x: 1, y: 2 }, { x: 3, y: 4 }], 30, '#fff', '#000', 0, transform), null);
  });

  it('actual upstream drawHitObjects uses the flat builder and reuses its original per-slider cache', () => {
    const text = fixtureOsu(0, 'Flat').replace(/\[HitObjects\][\s\S]*$/, '[HitObjects]\n100,100,1000,2,0,L|300:100,1,200\n');
    const beatmap = parseBeatmap(text);
    const replay = synthesizeAutoReplay(beatmap, '', []);
    const mod = computeModDifficulty(beatmap, replay);
    const skin = {
      images: new Map(), spinnerImages: new Map(), sounds: new Map(),
      config: { comboColors: ['#80ead5'], sliderBorder: '#f4f8ff', sliderTrackOverride: '#13243b', hitCirclePrefix: 'default', hitCircleOverlap: 0 },
    } as unknown as SkinAssets;
    const drawn: RecordingCanvas[] = [];
    const context = new Proxy({
      drawImage(image: unknown) { if (image instanceof RecordingCanvas) drawn.push(image); },
    } as unknown as CanvasRenderingContext2D, {
      get(target, key) { return Reflect.get(target, key) ?? (() => {}); },
    });
    const draw = (quality: number, difficulty = mod) => {
      drawHitObjects(context, beatmap, skin, 500, [], new Map(), difficulty, quality);
      return drawn.at(-1)!;
    };
    const first = draw(2);
    assert.ok(first);
    assert.deepEqual(first.strokes.map(s => s.color), ['#f4f8ff', '#13243b']);
    assert.equal(draw(2), first, 'same slider and style must reuse the raster');
    const highDensity = draw(3);
    assert.notEqual(highDensity, first);
    assert.equal(highDensity.width, Math.ceil(first.width / 2 * 3));
    skin.config.sliderTrackOverride = '#80ead5';
    const recolored = draw(3);
    assert.notEqual(recolored, highDensity);
    assert.equal(recolored.strokes[1]!.color, '#80ead5');
    const mirrored = draw(3, { ...mod, isHR: true });
    assert.notEqual(mirrored, recolored, 'HR still invalidates the original cache');
  });
});
