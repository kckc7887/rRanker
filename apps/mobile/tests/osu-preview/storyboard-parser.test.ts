import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseBeatmapVisuals, referencedImageFiles, storyboardTimeRange } from '../../src/features/osu-chart-preview/webview-player/events';
import { evaluateSprite } from '../../src/features/osu-chart-preview/webview-player/storyboard';

describe('storyboard source parsing', () => {
  it('expands variables, numerical event types, source paths and sample layers', () => {
    const visuals = parseBeatmapVisuals(`osu file format v14
[General]
WidescreenStoryboard: 1
[Variables]
$root=../shared
$sprite=$root/sprite,a.png
$fade=F,0,-500,500,0,1,0
[Events]
0,0,"bg.jpg",12,-8
1,-100,"movie.mp4"
4,0,1,"$sprite",320,240
 _$fade
5,-250,2,"$root/intro.ogg",40
6,3,0,"frames/f.png",0,0,3,80,1
 F,0,0,1000,1
`, [`[Events]
Sprite,Foreground,BottomRight,"stamp.png",640,480
 F,0,0,100,1
Sample,900,1,"fail.wav"
`], { osuPath: 'set/map.osu', osbPaths: ['set/story.osb'] });
    assert.equal(visuals.widescreen, true);
    assert.equal(visuals.background, 'set/bg.jpg');
    assert.deepEqual(visuals.backgroundOffset, { x: 12, y: -8 });
    assert.deepEqual(visuals.video, { file: 'set/movie.mp4', startMs: -100 });
    assert.equal(visuals.objects[0]!.file, 'shared/sprite,a.png');
    assert.equal(visuals.objects[0]!.origin, 'Centre');
    assert.deepEqual(visuals.samples, [
      { file: 'shared/intro.ogg', timeMs: -250, layer: 'Pass', volume: 0.4 },
      { file: 'set/fail.wav', timeMs: 900, layer: 'Fail', volume: 1 },
    ]);
    assert.equal(visuals.objects[1]!.loopForever, false);
    assert.deepEqual(referencedImageFiles(visuals.objects).slice(1, 4), ['set/frames/f0.png', 'set/frames/f1.png', 'set/frames/f2.png']);
    assert.equal(visuals.objects[2]!.file, 'set/stamp.png');
    assert.equal(evaluateSprite(visuals.objects[0]!, 1000)?.fade, 0.5);
    assert.deepEqual(storyboardTimeRange(visuals.objects, visuals.samples), { startMs: -500, endMs: 1500 });
  });

  it('ends a loop on a same-indent command instead of absorbing it', () => {
    const [sprite] = parseBeatmapVisuals(`[Events]
Sprite,Background,Centre,"sprite.png",320,240
 L,1000,2
  F,0,0,100,0,1
 M,0,2000,2100,0,0,100,100
`).objects;
    assert.deepEqual(sprite!.commands.map(({ type, start, end }) => ({ type, start, end })), [
      { type: 'F', start: 1000, end: 1100 },
      { type: 'F', start: 1100, end: 1200 },
      { type: 'M', start: 2000, end: 2100 },
    ]);
    assert.equal(evaluateSprite(sprite!, 2050)?.x, 50);
  });

  it('uses the loop command span when its first relative command starts after zero', () => {
    const [sprite] = parseBeatmapVisuals(`[Events]
Sprite,Background,Centre,"sprite.png",0,0
 L,1000,3
  F,0,100,200,0,1
`).objects;
    assert.deepEqual(sprite!.commands.map((command) => [command.start, command.end]), [[1100, 1200], [1200, 1300], [1300, 1400]]);
  });

  it('expands scalar, vector and colour parameter chains without losing final segments', () => {
    const [sprite] = parseBeatmapVisuals(`[Events]
Sprite,Background,Centre,"sprite.png",0,0
 F,0,0,100,1,1,0
 M,0,0,100,0,0,100,200,200,400
 C,0,0,100,255,255,255,255,0,0,0,0,255
`).objects;
    const state = evaluateSprite(sprite!, 150)!;
    assert.equal(state.fade, 0.5);
    assert.deepEqual([state.x, state.y], [150, 300]);
    assert.deepEqual([state.r, state.g, state.b], [127.5, 0, 127.5]);
    assert.equal(evaluateSprite(sprite!, 201), null);
  });

  it('preserves a trigger body and nested loop independently of following ordinary commands', () => {
    const [sprite] = parseBeatmapVisuals(`[Events]
Sprite,Foreground,Centre,"sprite.png",0,0
 T,HitSoundClap,100,900,7
  L,0,2
   F,0,0,50,0,1
 F,0,-100,0,1,0
 T,Passing
  M,0,0,50,0,0,10,10
`).objects;
    assert.equal(sprite!.commands.length, 1);
    assert.equal(sprite!.commands[0]!.start, -100);
    assert.deepEqual(sprite!.triggers![0]!.commands.map((command) => [command.start, command.end]), [[0, 50], [50, 100]]);
    assert.equal(sprite!.triggers![0]!.group, 7);
    assert.equal(sprite!.triggers![1]!.start, -Infinity);
    assert.equal(sprite!.triggers![1]!.end, Infinity);
  });

  it('rejects references outside the archive without replacing valid assets', () => {
    const visuals = parseBeatmapVisuals(`[Events]
Sprite,Background,Centre,"../../outside.png",0,0
 F,0,0,100,1
Sample,0,0,"https://example.test/audio.ogg",100
Sprite,Background,Centre,"safe.png",0,0
 F,0,0,100,1
`, [], { osuPath: 'set/map.osu' });
    assert.deepEqual(visuals.objects.map((object) => object.file), ['set/safe.png']);
    assert.equal(visuals.samples.length, 0);
  });
});
