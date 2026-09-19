import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  OVER_LAYERS,
  animationFrameFile,
  parseBeatmapVisuals,
  referencedImageFiles,
} from '../../src/features/osu-chart-preview/webview-player/events';
import { ease, evaluateSprite } from '../../src/features/osu-chart-preview/webview-player/storyboard';
import { clampManiaScrollSpeed, MANIA_SCROLL_DEFAULT } from '../../src/features/osu-chart-preview/webview-player/scroll-speed';

const osuWithEvents = `
osu file format v14

[General]
AudioFilename: audio.mp3
Mode: 0
WidescreenStoryboard: 1

[Events]
0,0,"bg.jpg",0,0
Video,320,"clip.mp4"
Sprite,Background,Centre,"osu.png",320,240
 F,0,0,1000,0,1
Sprite,Overlay,Centre,"over.png",320,240
 F,0,0,1000,1,1
`.trim();

const osbText = `
[Events]
Sprite,Pass,Centre,"osb.png",100,100
 F,0,500,1500,0,1
 L,2000,2
  S,0,0,100,1,2
`.trim();

describe('beatmap visuals', () => {
  it('parses video, background, widescreen and osu storyboard sprites', () => {
    const visuals = parseBeatmapVisuals(osuWithEvents);
    assert.equal(visuals.widescreen, true);
    assert.equal(visuals.background, 'bg.jpg');
    assert.deepEqual(visuals.video, { file: 'clip.mp4', startMs: 320 });
    assert.equal(visuals.objects.length, 2);
    assert.equal(visuals.objects[0]!.file, 'osu.png');
    assert.equal(visuals.objects[0]!.layer, 'Background');
    assert.equal(visuals.objects[1]!.layer, 'Overlay');
    assert.equal(OVER_LAYERS.includes('Overlay'), true);
  });

  it('appends .osb sprites after .osu sprites and expands loops', () => {
    const visuals = parseBeatmapVisuals(osuWithEvents, [osbText]);
    assert.equal(visuals.objects.length, 3);
    assert.equal(visuals.objects[2]!.file, 'osb.png');
    assert.equal(visuals.objects[2]!.layer, 'Pass');
    const scales = visuals.objects[2]!.commands.filter((command) => command.type === 'S');
    assert.equal(scales.length, 2);
    assert.equal(scales[0]!.start, 2000);
    assert.equal(scales[1]!.start, 2100);
  });

  it('lists animation frames', () => {
    assert.equal(animationFrameFile('sb\\\\exp.png', 2), 'sb\\\\exp2.png');
    const visuals = parseBeatmapVisuals(`
[Events]
Animation,Foreground,Centre,"sb\\\\exp.png",320,240,3,50,LoopForever
 F,0,0,100,1,1
`.trim());
    assert.deepEqual(referencedImageFiles(visuals.objects), [
      'sb/exp0.png',
      'sb/exp1.png',
      'sb/exp2.png',
    ]);
  });
});

describe('storyboard interpolation', () => {
  it('eases linear and in-quad', () => {
    assert.equal(ease(0, 0.5), 0.5);
    assert.equal(ease(3, 0.5), 0.25);
  });

  it('interpolates fade after the first command starts', () => {
    const visuals = parseBeatmapVisuals(osuWithEvents);
    const sprite = visuals.objects[0]!;
    assert.equal(evaluateSprite(sprite, -1), null);
    const mid = evaluateSprite(sprite, 500);
    assert.ok(mid);
    assert.equal(mid.fade, 0.5);
    const end = evaluateSprite(sprite, 1000);
    assert.ok(end);
    assert.equal(end.fade, 1);
  });
});

describe('mania scroll speed', () => {
  it('clamps to the official 1–40 range in 0.1 steps', () => {
    assert.equal(clampManiaScrollSpeed(0), 1);
    assert.equal(clampManiaScrollSpeed(99), 40);
    assert.equal(clampManiaScrollSpeed(8.26), 8.3);
    assert.equal(clampManiaScrollSpeed(Number.NaN), MANIA_SCROLL_DEFAULT);
  });
});
