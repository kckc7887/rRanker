import type { ManiaSkinSection, SkinAssets } from './engine';
import type { ManiaSkinVariant } from './mania-skin';

const P = {
  navy: '#202833', ink: '#11161e', mint: '#8fcbd8', purple: '#b5b3dc',
  gold: '#ffd783', white: '#eef3f6', don: '#eb452c', kat: '#448dab',
} as const;
type PaintContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Paint = (ctx: PaintContext) => void;
type Sprite = { stem: string; width: number; height: number; paint: Paint; density?: number };
const TAU = Math.PI * 2;
const RECEPTOR_SCALE = 720 / 768;
const MANIA_CONFIG_SCALE = 720 / 480;
const HIT_TARGET_Y = 610;
const RECEPTOR_HEIGHT = 256;
const SKIN_CACHE_LIMIT = 32;
const commonCache: { promise?: Promise<Map<string, ImageBitmap>> } = {};
const maniaImageCache = new Map<string, Promise<Map<string, ImageBitmap>>>();
const maniaBodyCache = new Map<string, Promise<Map<string, ImageBitmap>>>();
const skinCache = new Map<string, Promise<SkinAssets>>();

function disc(ctx: PaintContext, x: number, y: number, radius: number, fill: string, stroke?: string, width = 2) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function ring(ctx: PaintContext, x: number, y: number, radius: number, color: string, width = 2) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function rect(ctx: PaintContext, x: number, y: number, w: number, h: number, fill: string) {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
}

async function rasterize(specs: readonly Sprite[]): Promise<Map<string, ImageBitmap>> {
  const result = new Map<string, ImageBitmap>();
  try {
    for (const spec of specs) {
      const density = spec.density ?? 2;
      const width = spec.width * density, height = spec.height * density;
      const canvas = typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement('canvas'), { width, height });
      const ctx = canvas.getContext('2d') as PaintContext | null;
      if (!ctx) throw new Error('无法准备播放画面');
      ctx.scale(density, density);
      spec.paint(ctx);
      const bitmap = 'transferToImageBitmap' in canvas
        ? canvas.transferToImageBitmap()
        : await createImageBitmap(canvas);
      result.set(`${spec.stem}${density === 2 ? '@2x' : ''}.png`, bitmap);
    }
    return result;
  } catch (error) {
    for (const bitmap of result.values()) bitmap.close();
    throw error;
  }
}

function commonSpecs(): Sprite[] {
  const specs: Sprite[] = [];
  const add = (stem: string, width: number, height: number, paint: Paint) => specs.push({ stem, width, height, paint });
  const blank = (stem: string, size = 2) => specs.push({ stem, width: size, height: size, paint: () => {}, density: 1 });

  for (const stem of ['hitcircle', 'sliderstartcircle']) add(stem, 128, 128, ctx => {
    disc(ctx, 64, 64, 59, '#ffffff66');
  });
  for (const stem of ['hitcircleoverlay', 'sliderstartcircleoverlay']) add(stem, 128, 128, ctx => {
    ring(ctx, 64, 64, 57.5, P.white, 3);
  });
  add('approachcircle', 128, 128, ctx => ring(ctx, 64, 64, 58, '#ffffff', 2));
  add('sliderb', 128, 128, ctx => disc(ctx, 64, 64, 51, P.white));
  add('sliderfollowcircle', 224, 224, ctx => ring(ctx, 112, 112, 99, '#ffffff40', 2));
  // The reverse endpoint retains a plain ring cue, without an arrow or emblem.
  add('reversearrow', 128, 128, ctx => ring(ctx, 64, 64, 27, P.white, 4));
  add('sliderscorepoint', 32, 32, ctx => disc(ctx, 16, 16, 5, P.white));
  add('followpoint', 16, 16, ctx => disc(ctx, 8, 8, 2, '#ffffff66'));
  add('cursor', 32, 32, ctx => disc(ctx, 16, 16, 11, P.gold));
  blank('cursormiddle');
  blank('cursortrail');

  add('spinner-bottom', 360, 360, ctx => ring(ctx, 180, 180, 154, '#ffffff33', 4));
  add('spinner-top', 360, 360, ctx => {
    ctx.beginPath(); ctx.arc(180, 180, 154, -Math.PI / 2, Math.PI / 6);
    ctx.strokeStyle = P.white; ctx.lineWidth = 4; ctx.stroke();
  });
  add('spinner-middle2', 100, 100, () => {});
  add('spinner-circle', 360, 360, ctx => ring(ctx, 180, 180, 154, '#ffffff99', 3));
  add('spinner-approachcircle', 360, 360, ctx => ring(ctx, 180, 180, 164, P.white, 2));
  add('spinner-metre', 360, 360, () => {});
  for (const stem of ['spinner-background', 'spinner-glow', 'spinner-middle', 'spinner-spin', 'spinner-clear', 'spinner-warning', 'spinner-osu']) blank(stem, 1);

  for (const stem of ['taikohitcircle', 'taikobigcircle']) add(stem, 128, 128, ctx => disc(ctx, 64, 64, 61, '#ffffff'));
  for (const stem of ['taikohitcircleoverlay', 'taikobigcircleoverlay']) add(stem, 128, 128, ctx => {
    ring(ctx, 64, 64, 60, P.white, 2);
  });
  add('taiko-roll-middle', 8, 128, ctx => rect(ctx, 0, 3, 8, 122, '#ffffff'));
  add('taiko-roll-end', 64, 128, ctx => {
    ctx.beginPath(); ctx.arc(0, 64, 61, -Math.PI / 2, Math.PI / 2); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill();
  });
  add('taiko-bar-right', 1280, 200, ctx => {
    rect(ctx, 0, 0, 1280, 200, '#151a22eb');
    rect(ctx, 0, 0, 1280, 1, '#ffffff26'); rect(ctx, 0, 199, 1280, 1, '#ffffff26');
  });
  blank('taiko-bar-right-glow');
  add('taiko-bar-left', 180, 200, ctx => {
    rect(ctx, 0, 0, 180, 200, P.ink);
    disc(ctx, 90, 100, 78, '#252d38', '#737d89', 2);
    disc(ctx, 90, 100, 50, '#151a22', '#737d89', 2);
    rect(ctx, 89.5, 23, 1, 154, '#737d89');
  });
  // flat-feedback maps these LEFT half textures to the left half of the drum,
  // then mirrors them for the right. Both use the same 90x200 origin and size.
  add('taiko-drum-inner', 90, 200, ctx => disc(ctx, 90, 100, 48, P.don));
  add('taiko-drum-outer', 90, 200, ctx => {
    disc(ctx, 90, 100, 76, P.kat);
    ctx.globalCompositeOperation = 'destination-out'; disc(ctx, 90, 100, 52, '#ffffff');
  });
  add('taiko-barline', 4, 200, ctx => rect(ctx, 1, 0, 1, 200, '#ffffff26'));
  blank('taiko-glow');
  for (const stem of ['taiko-hit300', 'taiko-hit300k', 'taiko-hit100', 'taiko-hit100k', 'taiko-hit0']) blank(stem);
  for (const state of ['idle', 'kiai', 'fail', 'clear']) blank('pippidon' + state);

  // Fruit identity is encoded by the original tint and size; all silhouettes stay round.
  for (const stem of ['fruit-pear', 'fruit-grapes', 'fruit-apple', 'fruit-orange', 'fruit-drop', 'fruit-bananas']) {
    add(stem, 128, 128, ctx => disc(ctx, 64, 64, 56, '#ffffff80'));
    blank(stem + '-overlay');
  }
  for (const state of ['idle', 'fail', 'kiai']) add('fruit-catcher-' + state, 160, 40, ctx => {
    // Only 80% of the legacy visual width is catchable. The top edge is the y=16 catch anchor.
    rect(ctx, 16, 16, 128, 8, P.white);
  });
  blank('scoreboard-explosion-1');
  blank('scoreboard-explosion-2');

  // Missing glyphs trigger text fallback; retain transparent sentinels.
  for (const prefix of ['default', 'score', 'combo', 'scoreentry']) {
    for (const glyph of [...'0123456789', 'dot', 'percent', 'x', 'comma']) blank(prefix + '-' + glyph, 1);
  }
  for (const stem of ['hit0', 'hit50', 'hit100', 'hit100k', 'hit300', 'hit300k', 'hit300g']) blank(stem);
  for (const stem of ['mania-hit0', 'mania-hit50', 'mania-hit100', 'mania-hit200', 'mania-hit300', 'mania-hit300g']) blank(stem, 1);
  for (const stem of ['mania-stage-hint', 'mania-stage-bottom']) blank(stem);
  return specs;
}

function maniaFitScale(keys: number): number {
  const defaultWidth = keys * 80 - (keys % 2 === 1 ? 10 : 0);
  return defaultWidth > 1280 ? 1200 / defaultWidth : 1;
}

function maniaSpecs(variant: ManiaSkinVariant, keys: number, fitScale: number): { specs: Sprite[]; section: ManiaSkinSection } {
  const specs: Sprite[] = [];
  const families = new Set<string>();
  const section: ManiaSkinSection = {
    keys, imageLookups: {}, colours: [], coloursLight: [],
    keysUnderNotes: true, judgementLine: false, noteBodyStyle: 0,
    columnLineWidth: Array.from({ length: keys + 1 }, () => 0.5),
    colourColumnLine: '#ffffff18', lightPosition: HIT_TARGET_Y / 1.5,
    barlineHeight: 0,
  };
  if (fitScale < 1) section.columnWidth = [];
  const add = (stem: string, width: number, height: number, paint: Paint) => specs.push({ stem, width, height, paint });
  const noteHeight = variant === 'circle' ? 128 : 32;
  for (let col = 0; col < keys; col++) {
    const special = keys % 2 === 1 && col === Math.floor(keys / 2);
    const laneWidth = (special ? 70 : 80) * fitScale;
    // Only overflowing stages override widths, through the engine's existing 480-space config.
    section.columnWidth?.push(laneWidth / MANIA_CONFIG_SCALE);
    const family = special ? 'center' : Math.min(col, keys - 1 - col) % 2 === 0 ? 'outer' : 'inner';
    const accent = family === 'center' ? P.gold : family === 'outer' ? P.white : P.mint;
    const stem = 'builtin/' + variant + '/' + family;
    section.colours.push(col % 2 === 0 ? '#11161eee' : '#171e27ee');
    section.coloursLight.push(accent);
    for (const [lookup, suffix] of [['noteimage', 'note'], ['noteimageh', 'head'], ['noteimaget', 'tail'], ['noteimagel', 'body'], ['keyimage', 'key'], ['keyimaged', 'down']] as const) {
      const field = lookup === 'noteimage' || lookup === 'keyimage' ? lookup + col : lookup.slice(0, -1) + col + lookup.slice(-1);
      section.imageLookups[field] = stem + '-' + suffix;
    }
    if (families.has(family)) continue;
    families.add(family);
    for (const part of ['note', 'head', 'tail']) add(stem + '-' + part, 128, noteHeight, ctx => {
      if (variant === 'circle') disc(ctx, 64, 64, 54, accent);
      else rect(ctx, 5, 5, 118, 22, accent);
    });
    for (const pressed of [false, true]) add(stem + '-' + (pressed ? 'down' : 'key'), 128, RECEPTOR_HEIGHT, ctx => {
      const displayedHeight = laneWidth * noteHeight / 128;
      const cy = RECEPTOR_HEIGHT - (720 - HIT_TARGET_Y + displayedHeight / 2) / RECEPTOR_SCALE;
      const yScale = laneWidth / 128 / RECEPTOR_SCALE;
      ctx.save(); ctx.translate(64, cy); ctx.scale(1, yScale);
      if (variant === 'circle') {
        if (pressed) disc(ctx, 0, 0, 54, accent);
        else ring(ctx, 0, 0, 54, accent + '88', 2);
      } else if (pressed) rect(ctx, -59, -11, 118, 22, accent);
      else {
        ctx.strokeStyle = accent + '88'; ctx.lineWidth = 2;
        ctx.strokeRect(-59, -11, 118, 22);
      }
      ctx.restore();
    });
  }
  for (const side of ['left', 'right']) add('mania-stage-' + side, 8, 720, ctx => {
    rect(ctx, side === 'left' ? 5 : 1, 0, 1, 720, '#ffffff33');
  });
  add('mania-stage-light', 2, 2, () => {});
  for (const kind of ['lightingn', 'lightingl']) {
    for (let frame = 0; frame < 4; frame++) add(kind + '-' + frame, 2, 2, () => {});
  }
  return { specs, section };
}

function commonImages(): Promise<Map<string, ImageBitmap>> {
  if (!commonCache.promise) {
    const pending = rasterize(commonSpecs());
    commonCache.promise = pending;
    void pending.catch(() => { if (commonCache.promise === pending) commonCache.promise = undefined; });
  }
  return commonCache.promise;
}

function maniaImages(variant: ManiaSkinVariant, fitScale: number): Promise<Map<string, ImageBitmap>> {
  const cacheKey = `${variant}:${fitScale}`;
  let pending = maniaImageCache.get(cacheKey);
  if (!pending) {
    // Five columns contain both regular lane colours and the narrow centre lane.
    // Share only at the same fitted width: receptors encode the note's screen height.
    pending = rasterize(maniaSpecs(variant, 5, fitScale).specs);
    maniaImageCache.set(cacheKey, pending);
    const current = pending;
    void current.catch(() => { if (maniaImageCache.get(cacheKey) === current) maniaImageCache.delete(cacheKey); });
  }
  return pending;
}

function maniaBodyImages(variant: ManiaSkinVariant, widthPercent: number): Promise<Map<string, ImageBitmap>> {
  const cacheKey = `${variant}:${widthPercent}`;
  let pending = maniaBodyCache.get(cacheKey);
  if (!pending) {
    const visibleWidth = (variant === 'circle' ? 108 : 118) * widthPercent / 100;
    // A uniform row stretches through the original LN path. Across both variants,
    // all 91 integer widths occupy at most 546 × 256 × 2 RGBA pixels (~1.07 MiB).
    pending = rasterize((['outer', 'inner', 'center'] as const).map(family => ({
      stem: `builtin/${variant}/${family}-body`, width: 128, height: 1,
      paint: ctx => rect(ctx, (128 - visibleWidth) / 2, 0, visibleWidth, 1,
        (family === 'center' ? P.gold : family === 'outer' ? P.white : P.mint) + '70'),
    })));
    maniaBodyCache.set(cacheKey, pending);
    const current = pending;
    void current.catch(() => { if (maniaBodyCache.get(cacheKey) === current) maniaBodyCache.delete(cacheKey); });
  }
  return pending;
}

/** Shared immutable assets; copy images before applying session-local changes. */
export function createBuiltinSkin(variant: ManiaSkinVariant, keys = 4, holdWidth = 60): Promise<SkinAssets> {
  const columnCount = Number.isFinite(keys) ? Math.max(1, Math.round(keys)) : 4;
  const widthPercent = Number.isFinite(holdWidth) ? Math.max(10, Math.min(100, Math.round(holdWidth))) : 60;
  const cacheKey = `${variant}:${columnCount}:${widthPercent}`;
  let pending = skinCache.get(cacheKey);
  if (pending) {
    skinCache.delete(cacheKey); skinCache.set(cacheKey, pending);
    return pending;
  }
  const fitScale = maniaFitScale(columnCount);
  // Start all owners before awaiting, so disposal also captures in-flight resources.
  const commonPending = commonImages();
  const maniaPending = maniaImages(variant, fitScale);
  const bodyPending = maniaBodyImages(variant, widthPercent);
  pending = (async () => {
    const [common, mania, bodies] = await Promise.all([commonPending, maniaPending, bodyPending]);
    const { section } = maniaSpecs(variant, columnCount, fitScale);
    const images = new Map([...common, ...mania, ...bodies]);
    return {
      images, sounds: new Map<string, AudioBuffer>(),
      spinnerImages: new Map([...common].filter(([name]) => name.startsWith('spinner-'))),
      config: {
        name: 'rRanker', version: '2.7', comboColors: [P.mint, P.purple, P.gold, P.white],
        hitCircleOverlap: 0, hitCirclePrefix: 'default', scorePrefix: 'score', comboPrefix: 'combo',
        sliderBorder: P.white, sliderTrackOverride: P.navy, allowSliderBallTint: false,
        maniaSections: [section],
      },
    };
  })();
  skinCache.set(cacheKey, pending);
  // Evict wrappers only; bitmap owners keep old renderers valid until global disposal.
  while (skinCache.size > SKIN_CACHE_LIMIT) skinCache.delete(skinCache.keys().next().value!);
  const current = pending;
  void current.catch(() => { if (skinCache.get(cacheKey) === current) skinCache.delete(cacheKey); });
  return pending;
}

/** Call only once the preview has released every renderer using these shared bitmaps. */
export async function disposeBuiltinSkins(): Promise<void> {
  const pending = [...skinCache.values()];
  const common = commonCache.promise;
  const variants = [...maniaImageCache.values(), ...maniaBodyCache.values()];
  skinCache.clear(); maniaImageCache.clear(); maniaBodyCache.clear(); commonCache.promise = undefined;
  const bitmaps = new Set<ImageBitmap>();
  for (const result of await Promise.allSettled(pending)) {
    if (result.status === 'fulfilled') for (const bitmap of result.value.images.values()) bitmaps.add(bitmap);
  }
  if (common) {
    const result = await common.catch(() => undefined);
    if (result) for (const bitmap of result.values()) bitmaps.add(bitmap);
  }
  for (const result of await Promise.allSettled(variants)) {
    if (result.status === 'fulfilled') for (const bitmap of result.value.values()) bitmaps.add(bitmap);
  }
  for (const bitmap of bitmaps) bitmap.close();
}
