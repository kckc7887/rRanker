import assert from 'node:assert/strict';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createBuiltinSkin, disposeBuiltinSkins } from '../../src/features/osu-chart-preview/webview-player/builtin-skin';
import { computeModDifficulty, parseBeatmap } from '../../src/features/osu-chart-preview/webview-player/engine';
import { buildAutoReplay } from '../../src/features/osu-chart-preview/webview-player/autoplay';
import { buildManiaLayout } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/mania/Playfield';
import { maniaRuleset } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/mania/index';
import type { RenderOptions } from '../../src/features/osu-chart-preview/webview-player/engine/renderer/Renderer';
import { fixtureOsu } from './fixtures';
import {
  DEFAULT_MANIA_SKIN, parseManiaSkinVariant,
} from '../../src/features/osu-chart-preview/webview-player/mania-skin';

type Matrix = [number, number, number, number, number, number];
type Circle = { x: number; y: number; rx: number; ry: number };
type Rect = { x: number; y: number; width: number; height: number };
type Bitmap = ImageBitmap & { circles: Circle[]; rects: Rect[]; fills: string[]; strokes: string[]; closed: number };
const produced: Bitmap[] = [];
const originalCanvas = globalThis.OffscreenCanvas;

class RecordingCanvas {
  width: number;
  height: number;
  circles: Circle[] = [];
  rects: Rect[] = [];
  fills: string[] = [];
  strokes: string[] = [];
  constructor(width: number, height: number) { this.width = width; this.height = height; }
  getContext() {
    let matrix: Matrix = [1, 0, 0, 1, 0, 0];
    const stack: Matrix[] = [];
    const multiply = ([a, b, c, d, e, f]: Matrix) => {
      const [u, v, w, x, y, z] = matrix;
      matrix = [u * a + w * b, v * a + x * b, u * c + w * d, v * c + x * d, u * e + w * f + y, v * e + x * f + z];
    };
    const owner = this;
    const recordRect = (x: number, y: number, width: number, height: number, stroke = 0) => {
      owner.rects.push({
        x: matrix[0] * (x - stroke / 2) + matrix[4],
        y: matrix[3] * (y - stroke / 2) + matrix[5],
        width: (width + stroke) * matrix[0], height: (height + stroke) * matrix[3],
      });
    };
    return {
      fillStyle: '', strokeStyle: '', lineWidth: 0,
      save() { stack.push([...matrix]); },
      restore() { matrix = stack.pop()!; },
      scale(x: number, y: number) { multiply([x, 0, 0, y, 0, 0]); },
      translate(x: number, y: number) { multiply([1, 0, 0, 1, x, y]); },
      rotate(r: number) { multiply([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]); },
      arc(x: number, y: number, radius: number) {
        owner.circles.push({
          x: matrix[0] * x + matrix[2] * y + matrix[4],
          y: matrix[1] * x + matrix[3] * y + matrix[5],
          rx: radius * Math.hypot(matrix[0], matrix[1]),
          ry: radius * Math.hypot(matrix[2], matrix[3]),
        });
      },
      fill() { owner.fills.push(this.fillStyle); },
      fillRect(x: number, y: number, width: number, height: number) {
        owner.fills.push(this.fillStyle); recordRect(x, y, width, height);
      },
      strokeRect(x: number, y: number, width: number, height: number) {
        owner.strokes.push(this.strokeStyle); recordRect(x, y, width, height, this.lineWidth);
      },
      beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {},
      stroke() { owner.strokes.push(this.strokeStyle); },
      fillText() { throw new Error('Built-in skin must not draw text'); },
      strokeText() { throw new Error('Built-in skin must not draw text'); },
    };
  }
  transferToImageBitmap(): Bitmap {
    const bitmap = {
      width: this.width, height: this.height, circles: this.circles, rects: this.rects,
      fills: this.fills, strokes: this.strokes, closed: 0,
      close() { this.closed += 1; },
    } as Bitmap;
    produced.push(bitmap);
    return bitmap;
  }
}

function bitmap(skin: Awaited<ReturnType<typeof createBuiltinSkin>>, stem: string): Bitmap {
  const image = skin.images.get(`${stem}@2x.png`) ?? skin.images.get(`${stem}.png`);
  assert.ok(image, `Missing required sprite ${stem}`);
  return image as Bitmap;
}

function recordEngineDraws() {
  type Draw = { image: Bitmap; x: number; y: number; width: number; height: number };
  const draws: Draw[] = [];
  const fills: (Rect & { colour: string; alpha: number })[] = [];
  let state = { x: 0, y: 0, sx: 1, sy: 1, globalAlpha: 1, fillStyle: '' };
  const stack: typeof state[] = [];
  const ctx = new Proxy({
    save() { stack.push({ ...state }); }, restore() { state = stack.pop()!; },
    translate(x: number, y: number) { state.x += x * state.sx; state.y += y * state.sy; },
    scale(x: number, y: number) { state.sx *= x; state.sy *= y; },
    drawImage(image: Bitmap, x: number, y: number, width: number, height: number) {
      draws.push({ image, x: state.x + x * state.sx, y: state.y + y * state.sy, width: width * state.sx, height: height * state.sy });
    },
    fillRect(x: number, y: number, width: number, height: number) {
      fills.push({ x: state.x + x * state.sx, y: state.y + y * state.sy,
        width: width * state.sx, height: height * state.sy, colour: state.fillStyle, alpha: state.globalAlpha });
    },
  }, {
    get(target, key) { return key in state ? Reflect.get(state, key) : Reflect.get(target, key) ?? (() => {}); },
    set(target, key, value) { return Reflect.set(key in state ? state : target, key, value); },
  }) as unknown as CanvasRenderingContext2D;
  const visibleBounds = (draw: Draw): Rect => {
    const circle = draw.image.circles[0];
    const shape = circle ? { x: circle.x - circle.rx, y: circle.y - circle.ry, width: circle.rx * 2, height: circle.ry * 2 } : draw.image.rects[0]!;
    assert.ok(shape, 'expected a visible sprite');
    const x1 = draw.x + shape.x * draw.width / draw.image.width;
    const y1 = draw.y + shape.y * draw.height / draw.image.height;
    const x2 = x1 + shape.width * draw.width / draw.image.width;
    const y2 = y1 + shape.height * draw.height / draw.image.height;
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
  };
  return { ctx, draws, fills, visibleBounds };
}

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

beforeAll(() => { globalThis.OffscreenCanvas = RecordingCanvas as unknown as typeof OffscreenCanvas; });
afterAll(async () => {
  await disposeBuiltinSkins();
  if (originalCanvas) globalThis.OffscreenCanvas = originalCanvas;
  else Reflect.deleteProperty(globalThis, 'OffscreenCanvas');
});

describe('built-in preview skin', () => {
  it('supplies every gameplay component in all four modes without loading external images or sounds', async () => {
    const skin = await createBuiltinSkin('brick', 4);
    const required = [
      'hitcircle', 'hitcircleoverlay', 'sliderstartcircle', 'sliderstartcircleoverlay',
      'approachcircle', 'sliderb', 'sliderfollowcircle', 'reversearrow', 'sliderscorepoint',
      'followpoint', 'cursor', 'cursormiddle', 'cursortrail',
      'taikohitcircle', 'taikohitcircleoverlay', 'taikobigcircle', 'taikobigcircleoverlay',
      'taiko-bar-right', 'taiko-bar-right-glow', 'taiko-bar-left', 'taiko-barline',
      'taiko-roll-middle', 'taiko-roll-end', 'taiko-drum-inner', 'taiko-drum-outer', 'taiko-glow',
      'fruit-pear', 'fruit-grapes', 'fruit-apple', 'fruit-orange', 'fruit-drop', 'fruit-bananas',
      'fruit-catcher-idle', 'fruit-catcher-fail', 'fruit-catcher-kiai',
      'scoreboard-explosion-1', 'scoreboard-explosion-2',
      'mania-stage-left', 'mania-stage-right', 'mania-stage-light', 'lightingn-0', 'lightingl-0',
    ];
    for (const stem of required) assert.ok(bitmap(skin, stem).width > 1, stem);
    for (const fruit of ['pear', 'grapes', 'apple', 'orange', 'drop', 'bananas']) bitmap(skin, `fruit-${fruit}-overlay`);
    for (const stem of ['spinner-bottom', 'spinner-top', 'spinner-middle2', 'spinner-circle', 'spinner-approachcircle', 'spinner-metre']) {
      assert.equal(skin.spinnerImages.get(`${stem}@2x.png`), bitmap(skin, stem));
    }
    assert.equal(skin.sounds.size, 0);
    assert.deepEqual(bitmap(skin, 'taikohitcircle').fills, ['#ffffff']);
    assert.deepEqual(bitmap(skin, 'taikobigcircle').fills, ['#ffffff']);
  });

  it('fills every catch object with the same translucent disc and opaque same-colour stroke while keeping catcher geometry opaque', async () => {
    const skin = await createBuiltinSkin('brick', 4);
    for (const fruit of ['pear', 'grapes', 'apple', 'orange', 'drop', 'bananas']) {
      const body = bitmap(skin, `fruit-${fruit}`);
      assert.deepEqual(body.fills, ['#ffffff80']);
      assert.deepEqual(body.strokes, ['#ffffff']);
      assert.deepEqual(body.circles, [{ x: 128, y: 128, rx: 112, ry: 112 }]);
      assert.equal(bitmap(skin, `fruit-${fruit}-overlay`).fills.length, 0);
      assert.equal(bitmap(skin, `fruit-${fruit}-overlay`).strokes.length, 0);
    }
    assert.deepEqual(bitmap(skin, 'fruit-catcher-idle').fills, ['#eef3f6']);
  });

  it('keeps invisible glyphs and judgement sentinels present to prevent renderer text fallback', async () => {
    const skin = await createBuiltinSkin('brick');
    for (const prefix of [skin.config.hitCirclePrefix, skin.config.scorePrefix, skin.config.comboPrefix, 'scoreentry']) {
      for (const glyph of [...'0123456789', 'dot', 'percent', 'x', 'comma']) {
        const image = bitmap(skin, `${prefix}-${glyph}`);
        assert.equal(image.width, 1);
        assert.equal(image.fills.length, 0);
      }
    }
    for (const stem of ['hit0', 'hit50', 'hit100', 'hit300']) {
      const image = bitmap(skin, stem);
      assert.equal(image.width, 2, 'standard lookup must not reject the transparent judgement');
      assert.equal(image.fills.length, 0);
    }
    for (const stem of ['mania-hit0', 'mania-hit300', 'mania-hit300g', 'spinner-clear', 'spinner-spin']) {
      assert.equal(bitmap(skin, stem).width, 1);
    }
  });

  it('binds every note, hold segment and receptor explicitly for the actual number of columns', async () => {
    for (const variant of ['brick', 'circle'] as const) {
      for (const keys of [1, 4, 5, 7, 9, 10, 18]) {
        const skin = await createBuiltinSkin(variant, keys);
        const section = skin.config.maniaSections[0]!;
        assert.equal(section.keys, keys);
        assert.equal(section.colours.length, keys);
        assert.equal(section.coloursLight.length, keys);
        assert.equal(section.columnLineWidth?.length, keys + 1);
        if (keys <= 16) assert.equal(section.columnWidth, undefined, 'fitting stages must preserve the engine lane geometry');
        assert.equal(section.hitPosition, undefined, 'skin must preserve the engine judgement time anchor');
        assert.equal(section.noteBodyStyle, 0);
        for (let col = 0; col < keys; col++) {
          for (const field of [`noteimage${col}`, `noteimage${col}h`, `noteimage${col}t`, `noteimage${col}l`, `keyimage${col}`, `keyimage${col}d`]) {
            const stem = section.imageLookups[field];
            assert.ok(stem, `Missing explicit ${field} in ${keys}K`);
            assert.ok(bitmap(skin, stem).width > 1);
          }
          const note = bitmap(skin, section.imageLookups[`noteimage${col}`]!);
          assert.equal(note.height / note.width, variant === 'circle' ? 1 : 0.25);
          const body = bitmap(skin, section.imageLookups[`noteimage${col}l`]!);
          assert.ok(body.height < body.width * 4, 'short body must take the continuous stretch path');
          assert.notEqual(section.imageLookups[`noteimage${col}t`], section.imageLookups[`noteimage${col}h`]);
        }
      }
    }
  });

  it('fits only overflowing native stages while preserving existing lane positions and hit anchors', async () => {
    for (const variant of ['brick', 'circle'] as const) {
      for (const [keys, expectedLeft, expectedRight] of [[4, 480, 800], [7, 365, 915], [10, 240, 1040], [16, 0, 1280], [17, 40, 1240], [18, 40, 1240]]) {
        const skin = await createBuiltinSkin(variant, keys);
        const stages = [{ columns: keys, firstColumnIndex: 0 }];
        const layout = buildManiaLayout(stages, keys, skin);
        const original = buildManiaLayout(stages, keys, undefined);
        close(layout.stageLeftX, expectedLeft); close(layout.stageRightX, expectedRight);
        assert.equal(layout.hitTargetY, original.hitTargetY);
        assert.equal(layout.scrollLength, original.scrollLength);
        const ratio = keys > 16 ? 1200 / (original.stageRightX - original.stageLeftX) : 1;
        layout.columns.forEach((col, index) => {
          close(col.width, original.columns[index]!.width * ratio);
          if (keys <= 16) assert.equal(col.x, original.columns[index]!.x);
          assert.ok(col.x >= 0 && col.x + col.width <= 1280 + 1e-8);
        });
      }
    }
  });

  it('actual mania rendering changes only LN width while preserving fitted receptors, ends, scroll and SV', async () => {
    const options = { showJudgement: false, modHidden: false, modFlashlight: false, maniaScrollSpeed: 20 } as RenderOptions;
    for (const variant of ['brick', 'circle'] as const) {
      for (const keys of [4, 7, 10, 17, 18]) {
        const builtin = await createBuiltinSkin(variant, keys);
        const skin = { ...builtin, images: new Map(builtin.images) };
        const objects = Array.from({ length: keys }, (_, col) => `${Math.floor((col + 0.5) * 512 / keys)},192,1000,128,0,2000:0:0:0:0:`).join('\n');
        const text = fixtureOsu(3, 'Easy').replace('CircleSize: 4', `CircleSize: ${keys}`)
          .replace('[HitObjects]', '1250,-50,4,1,0,100,0,0\n\n[HitObjects]')
          .replace(/\[HitObjects\][\s\S]*$/, `[HitObjects]\n${objects}\n`);
        const beatmap = parseBeatmap(text), replay = buildAutoReplay(new TextEncoder().encode(text), '');
        const mod = computeModDifficulty(beatmap, replay);
        const session = maniaRuleset.build(beatmap, replay, mod, skin, 1);
        const noWidthSkin = { ...skin, config: { ...skin.config, maniaSections: skin.config.maniaSections.map(section => ({ ...section, columnWidth: undefined })) } };
        const originalSession = maniaRuleset.build(beatmap, replay, mod, noWidthSkin, 1);
        assert.deepEqual(session.scroll, originalSession.scroll);
        assert.deepEqual(session.objects, originalSession.objects);
        for (const holdWidth of [10, 60, 100]) {
          const next = await createBuiltinSkin(variant, keys, holdWidth);
          for (const col of session.layout.columns) {
            const name = `${col.bodyStem}@2x.png`;
            skin.images.set(name, next.images.get(name)!);
          }
          const { ctx, draws, visibleBounds } = recordEngineDraws();
          maniaRuleset.draw(ctx, session, 1500, options);
          for (const col of session.layout.columns) {
            const atColumn = (stem: string) => {
              const image = bitmap(skin, stem);
              const draw = draws.find(draw => draw.image === image && Math.abs(draw.x + draw.width / 2 - (col.x + col.width / 2)) < 1e-8);
              assert.ok(draw, `Missing ${keys}K ${stem} at ${col.x}`);
              return visibleBounds(draw);
            };
            const head = atColumn(col.headStem), key = atColumn(col.keyDownStem), tail = atColumn(col.tailStem), body = atColumn(col.bodyStem);
            for (const dimension of ['x', 'y', 'width', 'height'] as const) close(head[dimension], key[dimension]);
            close(body.width, head.width * holdWidth / 100);
            close(body.x + body.width / 2, head.x + head.width / 2);
            close(body.y, tail.y + tail.height / 2);
            close(body.y + body.height, head.y + head.height / 2);
            if (variant === 'circle') close(key.width, key.height);
            assert.ok(head.x >= 0 && head.x + head.width <= 1280);
          }
        }
      }
    }
  });

  it('lands circle notes concentrically in round receptors for regular and narrow centre lanes', async () => {
    const skin = await createBuiltinSkin('circle', 7);
    const section = skin.config.maniaSections[0]!;
    for (const col of [0, 3, 6]) {
      const width = col === 3 ? 70 : 80;
      const note = bitmap(skin, section.imageLookups[`noteimage${col}`]!);
      const sourceNote = note.circles[0]!;
      const noteY = 610 - width * note.height / note.width + sourceNote.y * width / note.width;
      {
        const receptor = bitmap(skin, section.imageLookups[`keyimage${col}d`]!);
        const circle = receptor.circles[0]!;
        // The actual renderer stretches X to lane width, but preserves native @2x Y × 720/768.
        const receptorY = 720 - receptor.height / 2 * (720 / 768) + circle.y / 2 * (720 / 768);
        const radiusX = circle.rx * width / receptor.width;
        const radiusY = circle.ry / 2 * (720 / 768);
        assert.ok(Math.abs(noteY - receptorY) < 1e-8, 'note and receptor centres must coincide');
        assert.ok(Math.abs(radiusX - radiusY) < 1e-8, 'screen receptor must remain circular');
        assert.ok(Math.abs(radiusX - sourceNote.rx * width / note.width) < 1e-8);
      }
    }
  });

  it('keeps idle receptor outlines aligned with notes and pressed feedback at every fitted key count', async () => {
    for (const variant of ['brick', 'circle'] as const) {
      for (const keys of [4, 7, 10, 17, 18]) {
        const skin = await createBuiltinSkin(variant, keys);
        const section = skin.config.maniaSections[0]!;
        const layout = buildManiaLayout([{ columns: keys, firstColumnIndex: 0 }], keys, skin);
        assert.equal(section.judgementLine, false);
        for (let col = 0; col < keys; col++) {
          const idle = bitmap(skin, section.imageLookups[`keyimage${col}`]!);
          const pressed = bitmap(skin, section.imageLookups[`keyimage${col}d`]!);
          const note = bitmap(skin, section.imageLookups[`noteimage${col}`]!);
          assert.equal(idle.strokes.length, 1, 'idle receptor must retain its visible outline');
          assert.equal(idle.fills.length, 0, 'idle receptor must remain hollow');
          assert.equal(pressed.fills.length, 1, 'pressed feedback remains in the original receptor');
          assert.equal(pressed.strokes.length, 0);
          assert.equal(idle.strokes[0], pressed.fills[0] + '88');
          const column = layout.columns[col]!;
          const { visibleBounds } = recordEngineDraws();
          const keyBounds = (image: Bitmap) => {
            const height = image.height / 2 * (720 / 768);
            return visibleBounds({ image, x: column.x, y: 720 - height, width: column.width, height });
          };
          const idleBounds = keyBounds(idle), pressedBounds = keyBounds(pressed);
          const height = column.width * note.height / note.width;
          const noteBounds = visibleBounds({ image: note, x: column.x, y: layout.hitTargetY - height, width: column.width, height });
          for (const bounds of [idleBounds, pressedBounds]) {
            close(bounds.x + bounds.width / 2, noteBounds.x + noteBounds.width / 2);
            close(bounds.y + bounds.height / 2, noteBounds.y + noteBounds.height / 2);
          }
          for (const dimension of ['x', 'y', 'width', 'height'] as const) close(pressedBounds[dimension], noteBounds[dimension]);
          if (variant === 'circle') {
            assert.deepEqual(idle.circles, pressed.circles, 'outline follows the same circle path as the pressed note');
            close(idleBounds.width, idleBounds.height);
          } else {
            assert.ok(idleBounds.width > noteBounds.width && idleBounds.height > noteBounds.height,
              'rectangle outline must surround the unchanged note bounds');
          }
        }
        for (const stem of ['mania-stage-hint', 'mania-stage-bottom']) {
          const image = bitmap(skin, stem);
          assert.deepEqual([image.circles, image.rects, image.fills], [[], [], []]);
        }
      }
    }
  });

  it('removes scrolling beat lines beneath notes without changing real mania note or receptor draws', async () => {
    const options = { showJudgement: false, modHidden: false, modFlashlight: false, maniaScrollSpeed: 20 } as RenderOptions;
    for (const variant of ['brick', 'circle'] as const) {
      for (const keys of [4, 7, 18]) {
        const skin = await createBuiltinSkin(variant, keys);
        assert.equal(skin.config.maniaSections[0]!.barlineHeight, 0);
        const objects = Array.from({ length: keys }, (_, col) => {
          const x = Math.floor((col + 0.5) * 512 / keys);
          return `${x},192,1000,1,0,0:0:0:0:\n${x},192,1500,128,0,2500:0:0:0:0:`;
        }).join('\n');
        const text = fixtureOsu(3, 'Easy').replace('CircleSize: 4', `CircleSize: ${keys}`)
          .replace(/\[HitObjects\][\s\S]*$/, `[HitObjects]\n${objects}\n`);
        const beatmap = parseBeatmap(text), replay = buildAutoReplay(new TextEncoder().encode(text), '');
        const session = maniaRuleset.build(beatmap, replay, computeModDifficulty(beatmap, replay), skin, 1);
        const linedSkin = { ...skin, config: { ...skin.config,
          maniaSections: skin.config.maniaSections.map(section => ({ ...section, barlineHeight: 0.5 })),
        } };
        const linedSession = { ...session, skin: linedSkin };
        const barColours = new Set(['rgba(255, 255, 255, 0.30)', 'rgba(255, 255, 255, 0.13)']);
        let firstLineY: number | undefined;
        for (const time of [800, 900, 1300, 1600, 2250]) {
          const clean = recordEngineDraws(), lined = recordEngineDraws();
          maniaRuleset.draw(clean.ctx, session, time, options);
          maniaRuleset.draw(lined.ctx, linedSession, time, options);
          const bars = lined.fills.filter(fill => barColours.has(fill.colour));
          assert.ok(bars.length > 0, 'control frame must actually contain visible beat lines');
          assert.equal(clean.fills.filter(fill => barColours.has(fill.colour)).length, 0);
          assert.deepEqual(clean.draws, lined.draws, 'turning off bars must preserve every note, LN and receptor draw');
          assert.deepEqual(clean.fills, lined.fills.filter(fill => !barColours.has(fill.colour)),
            'only scrolling horizontal bars may be removed from the primitive draws');
          if (time === 800 || time === 900) {
            const firstNote = clean.draws.find(draw => draw.image === bitmap(skin, session.layout.columns[0]!.noteStem));
            assert.ok(firstNote, 'control frame must contain the unhit tap note');
            const anchorY = firstNote.y + firstNote.height;
            const bar = bars.find(fill => Math.abs(fill.y - anchorY) < 1e-8);
            assert.ok(bar, 'same-beat bar must coincide with the note bottom anchor');
            const noteBounds = clean.visibleBounds(firstNote);
            assert.ok(noteBounds.y + noteBounds.height < bar.y, 'sprite padding exposes the bar below the visible note');
            if (time === 800) firstLineY = bar.y;
            else assert.ok(bar.y > firstLineY!, 'the unwanted bar must move with the falling note');
          }
        }
      }
    }
  });

  it('reuses bitmaps on repeat calls and shares common assets across variants and key counts', async () => {
    const first = await createBuiltinSkin('brick', 4);
    const count = produced.length;
    assert.equal(await createBuiltinSkin('brick', 4), first);
    assert.equal(produced.length, count);
    const circle = await createBuiltinSkin('circle', 4);
    const seven = await createBuiltinSkin('circle', 7);
    assert.equal(bitmap(first, 'hitcircle'), bitmap(circle, 'hitcircle'));
    assert.equal(bitmap(first, 'fruit-catcher-idle'), bitmap(seven, 'fruit-catcher-idle'));
    assert.equal(bitmap(circle, circle.config.maniaSections[0]!.imageLookups.keyimage0!), bitmap(seven, seven.config.maniaSections[0]!.imageLookups.keyimage0!));
    const ten = await createBuiltinSkin('circle', 10), seventeen = await createBuiltinSkin('circle', 17), eighteen = await createBuiltinSkin('circle', 18);
    const key = (skin: typeof circle) => bitmap(skin, skin.config.maniaSections[0]!.imageLookups.keyimage0!);
    assert.equal(key(circle), key(ten), 'normal stages retain identical raster art');
    assert.notEqual(key(circle), key(seventeen), 'fitted receptors must not reuse a normal-width raster');
    assert.notEqual(key(seventeen), key(eighteen), 'different fitted widths need different receptor compensation');
    assert.equal(await createBuiltinSkin('circle', 18), eighteen);
    assert.notEqual(first.config.maniaSections[0]!.imageLookups.noteimage0, circle.config.maniaSections[0]!.imageLookups.noteimage0);
  });

  it('bounds width changes to 91 small body sets per variant and 32 skin wrappers without closing live images', async () => {
    for (const variant of ['brick', 'circle'] as const) {
      const first = await createBuiltinSkin(variant, 4, 10);
      const count = produced.length;
      const bodySet = new Set<Bitmap>();
      for (let width = 10; width <= 100; width++) {
        const skin = await createBuiltinSkin(variant, 4, width + 0.1);
        assert.equal(await createBuiltinSkin(variant, 4, width), skin, 'fractional input rounds to a shared integer width');
        for (const [name, image] of skin.images) {
          if (name.endsWith('-body@2x.png')) {
            bodySet.add(image as Bitmap);
            assert.equal(image.width, 256); assert.equal(image.height, 2);
          } else assert.equal(image, first.images.get(name), `width change rerasterized ${name}`);
        }
        const section = skin.config.maniaSections[0]!;
        const body = bitmap(skin, section.imageLookups.noteimage0l!);
        close(body.rects[0]!.width / 2, (variant === 'circle' ? 108 : 118) * width / 100);
      }
      assert.equal(bodySet.size, 91 * 3);
      assert.ok(produced.length - count <= 90 * 3);
      const afterSweep = produced.length;
      const rebuilt = await createBuiltinSkin(variant, 4, 10);
      assert.notEqual(rebuilt, first, 'old wrappers must leave the bounded LRU');
      assert.equal(produced.length, afterSweep, 'wrapper eviction must retain small body resources');
      for (const [name, image] of first.images) {
        assert.equal(image, rebuilt.images.get(name));
        assert.equal((image as Bitmap).closed, 0, 'live skin assets must not close during slider changes');
      }
      assert.equal(await createBuiltinSkin(variant, 4, -999), rebuilt);
      assert.equal(await createBuiltinSkin(variant, 4, 999), await createBuiltinSkin(variant, 4, 100));
      assert.equal(await createBuiltinSkin(variant, 4, NaN), await createBuiltinSkin(variant, 4, 60));
      assert.equal(await createBuiltinSkin(variant, 4, Infinity), await createBuiltinSkin(variant, 4));
      const fitted = await createBuiltinSkin(variant, 18, 10);
      for (const [name, image] of fitted.images) {
        if (name.endsWith('-body@2x.png')) assert.equal(image, first.images.get(name), 'body widths are independent of lane fit');
      }
    }
  });

  it('releases each shared bitmap once and can rebuild cleanly after disposal', async () => {
    const old = await createBuiltinSkin('brick', 4);
    const before = [...produced];
    await disposeBuiltinSkins();
    for (const image of before) assert.equal(image.closed, 1);
    const next = await createBuiltinSkin('brick', 4);
    assert.notEqual(bitmap(next, 'hitcircle'), bitmap(old, 'hitcircle'));
    assert.equal(bitmap(next, 'hitcircle').closed, 0);
  });
});

describe('mania skin preference', () => {
  it('accepts circles and defaults invalid stored values to bricks', () => {
    assert.equal(DEFAULT_MANIA_SKIN, 'brick');
    assert.equal(parseManiaSkinVariant('circle'), 'circle');
    for (const invalid of [null, undefined, 'old-skin.zip', 'CIRCLE', 1, {}]) assert.equal(parseManiaSkinVariant(invalid), 'brick');
  });
});
