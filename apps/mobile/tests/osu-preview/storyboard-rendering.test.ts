import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseBeatmapVisuals, UNDER_LAYERS } from '../../src/features/osu-chart-preview/webview-player/events';
import { drawStoryboardLayer, ease, evaluateSprite } from '../../src/features/osu-chart-preview/webview-player/storyboard';
import { compileStoryboardTriggers } from '../../src/features/osu-chart-preview/webview-player/storyboard-triggers';

const close = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

describe('storyboard easing and state', () => {
  it('covers all 35 legacy easing identifiers with finite values and exact endpoints', () => {
    for (let id = 0; id <= 34; id += 1) {
      assert.equal(ease(id, 0), 0, String(id));
      assert.equal(ease(id, 1), 1, String(id));
      for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) assert.equal(Number.isFinite(ease(id, t)), true, String(id));
    }
    close(ease(6, 0.25), 0.015625);
    close(ease(9, 0.25), 0.00390625);
    close(ease(12, 0.25), 0.0009765625);
    close(ease(15, 0.5), 1 - Math.SQRT1_2);
    close(ease(21, 0.5), 1 - Math.sqrt(0.75));
    close(ease(29, 0.5), -0.0876975);
    close(ease(30, 0.5), 1.0876975);
    close(ease(31, 0.25), -0.09968184375);
    close(ease(32, 0.5), 0.234375);
    close(ease(33, 0.5), 0.765625);
    close(ease(34, 0.25), 0.1171875);
    close(ease(28, 0.5), 0.5);
    assert.ok(ease(26, 0.3) > 1.1);
    assert.ok(ease(27, 0.3) < 1.01);
    assert.notEqual(ease(25, 0.3), ease(26, 0.3));
  });

  it('merges M/MX/MY on X and Y timelines without future commands suppressing existing movement', () => {
    const [sprite] = parseBeatmapVisuals(`[Events]
Sprite,Background,Centre,"sprite.png",320,240
 F,0,0,1000,1
 M,0,0,100,0,0,100,200
 MX,0,200,300,400,600
 M,0,400,500,700,800,900,1000
 MY,0,600,700,1200,1400
`).objects;
    assert.deepEqual([evaluateSprite(sprite!, 50)?.x, evaluateSprite(sprite!, 50)?.y], [50, 100]);
    assert.deepEqual([evaluateSprite(sprite!, 250)?.x, evaluateSprite(sprite!, 250)?.y], [500, 200]);
    assert.deepEqual([evaluateSprite(sprite!, 450)?.x, evaluateSprite(sprite!, 450)?.y], [800, 900]);
    assert.deepEqual([evaluateSprite(sprite!, 650)?.x, evaluateSprite(sprite!, 650)?.y], [900, 1300]);
    assert.equal(evaluateSprite(sprite!, 1001), null);
  });

  it('multiplies the independent uniform and vector scale tracks', () => {
    const [sprite] = parseBeatmapVisuals(`[Events]
Sprite,Background,Centre,"sprite.png",0,0
 F,0,0,1000,1
 S,0,0,1000,1,2
 V,0,0,1000,2,3,4,5
`).objects;
    assert.deepEqual([evaluateSprite(sprite!, 500)?.scaleX, evaluateSprite(sprite!, 500)?.scaleY], [4.5, 6]);
  });

  it('preserves zero-duration parameters until a later parameter changes them', () => {
    const [sprite] = parseBeatmapVisuals(`[Events]
Sprite,Background,Centre,"sprite.png",0,0
 F,0,0,1000,1
 P,0,0,,H
 P,0,100,200,V
 P,0,300,400,H
 P,0,500,,A
`).objects;
    assert.equal(evaluateSprite(sprite!, 50)?.flipH, true);
    assert.equal(evaluateSprite(sprite!, 150)?.flipV, true);
    assert.equal(evaluateSprite(sprite!, 250)?.flipV, false);
    assert.equal(evaluateSprite(sprite!, 450)?.flipH, false);
    assert.equal(evaluateSprite(sprite!, 900)?.additive, true);
  });

  it('starts animation when a formerly transparent sprite becomes visible and clamps LoopOnce', () => {
    const [sprite] = parseBeatmapVisuals(`[Events]
Animation,Foreground,Centre,"frame.png",0,0,3,100,LoopOnce
 F,0,-1000,-1000,0
 F,0,0,1000,1
`).objects;
    assert.equal(evaluateSprite(sprite!, -1), null);
    assert.equal(evaluateSprite(sprite!, 0)?.file, 'frame0.png');
    assert.equal(evaluateSprite(sprite!, 250)?.file, 'frame2.png');
    assert.equal(evaluateSprite(sprite!, 950)?.file, 'frame2.png');
    assert.equal(evaluateSprite(sprite!, 1001), null);
  });
});

function drawingContext(draw: (image: unknown, ...position: number[]) => void): CanvasRenderingContext2D {
  return {
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, rotate() {}, scale() {},
    drawImage: draw,
  } as unknown as CanvasRenderingContext2D;
}

describe('storyboard composition', () => {
  it('draws active sprites and restores earlier sprites on reverse seek', () => {
    const objects = parseBeatmapVisuals('[Events]\nSprite,Background,Centre,"long.png",0,0\n F,0,0,2000,1\n'
      + 'Sprite,Foreground,Centre,"early.png",0,0\n F,0,0,50,1\n'
      + 'Sprite,Foreground,Centre,"later.png",0,0\n F,0,1000,1050,1').objects;
    const drawn: string[] = [];
    const ctx = drawingContext(image => drawn.push((image as { name: string }).name));
    const image = (name: string) => ({ name, width: 1, height: 1 }) as unknown as CanvasImageSource;
    drawStoryboardLayer(ctx, objects, 1030, UNDER_LAYERS, image, true);
    assert.deepEqual(drawn, ['long.png', 'later.png']);
    drawn.length = 0;
    drawStoryboardLayer(ctx, objects, 25, UNDER_LAYERS, image, true);
    assert.deepEqual(drawn, ['long.png', 'early.png']);
  });

  it('preserves inclusive lifetimes, exclusive trigger replacement and one draw per object across seek', () => {
    const visuals = parseBeatmapVisuals('[Events]\nSprite,Background,Centre,"base.png",0,0\n F,0,-200,500,1\n T,HitSound,0,2000\n  F,0,0,200,1\nSprite,Foreground,Centre,"later.png",0,0\n F,0,1000,1400,1');
    const objects = compileStoryboardTriggers(visuals.objects, [1000, 1050].map(beatmapMs => ({
      beatmapMs, objectId: String(beatmapMs), normalSet: 1, additionSet: 1, sampleIndex: 1, type: 'normal' as const,
    })));
    for (const time of [-201, -200, 0, 500, 501, 999, 1000, 1049, 1050, 1200, 1250, 1251, 1400, 1401, 1000]) {
      const drawn: string[] = [];
      drawStoryboardLayer(drawingContext(image => drawn.push((image as { name: string }).name)), objects, time, UNDER_LAYERS,
        name => ({ name, width: 1, height: 1 }) as unknown as CanvasImageSource, true);
      assert.deepEqual(drawn, objects.filter(object => evaluateSprite(object, time)).map(object => object.file), String(time));
    }
  });

  it('draws by layer priority and then osu/osb declaration order', () => {
    const visuals = parseBeatmapVisuals(`[Events]
Sprite,Foreground,Centre,"front.png",0,0
 F,0,0,1000,1
Sprite,Background,Centre,"back.png",0,0
 F,0,0,1000,1
Sprite,Pass,Centre,"pass.png",0,0
 F,0,0,1000,1
Sprite,Fail,Centre,"fail.png",0,0
 F,0,0,1000,1
`, [`[Events]
Sprite,Background,Centre,"shared-back.png",0,0
 F,0,0,1000,1
Sprite,Foreground,Centre,"shared-front.png",0,0
 F,0,0,1000,1
`]);
    const draws: string[] = [];
    const ctx = drawingContext((image) => draws.push((image as { file: string }).file));
    drawStoryboardLayer(ctx, visuals.objects, 500, UNDER_LAYERS, (file) => ({ width: 4, height: 4, file }) as unknown as CanvasImageSource, false);
    assert.deepEqual(draws, ['back.png', 'shared-back.png', 'pass.png', 'front.png', 'shared-front.png']);
  });

});
