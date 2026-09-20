import {
  STORYBOARD_LAYERS,
  animationFrameFile,
  type StoryboardCommand,
  type StoryboardLayer,
  type StoryboardObject,
  type StoryboardOrigin,
  type StoryboardTriggerRun,
} from './events';

const LOGICAL_W = 1280;
const LOGICAL_H = 720;
const SB_SCALE = LOGICAL_H / 480;
const SB_OFFSET_X = (LOGICAL_W - 640 * SB_SCALE) / 2;

export type SpriteState = {
  x: number; y: number; fade: number; scaleX: number; scaleY: number; rotation: number;
  r: number; g: number; b: number; flipH: boolean; flipV: boolean; additive: boolean; file: string;
};

const ORIGIN_PIVOT: Record<StoryboardOrigin, [number, number]> = {
  TopLeft: [0, 0], TopCentre: [0.5, 0], TopRight: [1, 0], CentreLeft: [0, 0.5],
  Centre: [0.5, 0.5], CentreRight: [1, 0.5], BottomLeft: [0, 1], BottomCentre: [0.5, 1],
  BottomRight: [1, 1], Custom: [0, 0],
};

function bounceOut(t: number): number {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t - 1.5 / 2.75) ** 2 + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t - 2.25 / 2.75) ** 2 + 0.9375;
  return 7.5625 * (t - 2.625 / 2.75) ** 2 + 0.984375;
}

function elasticOut(t: number, frequency = 1): number {
  const wave = (value: number): number => Math.sin((frequency * value - 0.075) * 2 * Math.PI / 0.3);
  return 1 + 2 ** (-10 * t) * wave(t) - 2 ** -10 * wave(1) * t;
}

export function ease(easing: number, time: number): number {
  const t = Math.max(0, Math.min(1, time));
  if (t === 0 || t === 1) return t;
  switch (easing | 0) {
    case 1: case 4: return t * (2 - t);
    case 2: case 3: return t * t;
    case 5: return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2;
    case 6: return t ** 3;
    case 7: return 1 - (1 - t) ** 3;
    case 8: return t < 0.5 ? 4 * t ** 3 : 1 - 4 * (1 - t) ** 3;
    case 9: return t ** 4;
    case 10: return 1 - (1 - t) ** 4;
    case 11: return t < 0.5 ? 8 * t ** 4 : 1 - 8 * (1 - t) ** 4;
    case 12: return t ** 5;
    case 13: return 1 - (1 - t) ** 5;
    case 14: return t < 0.5 ? 16 * t ** 5 : 1 - 16 * (1 - t) ** 5;
    case 15: return 1 - Math.cos(t * Math.PI / 2);
    case 16: return Math.sin(t * Math.PI / 2);
    case 17: return (1 - Math.cos(t * Math.PI)) / 2;
    case 18: return 2 ** (10 * (t - 1)) + 2 ** -10 * (t - 1);
    case 19: return 1 - 2 ** (-10 * t) + 2 ** -10 * t;
    case 20: return t < 0.5
      ? (2 ** (20 * t - 10) + 2 ** -10 * (2 * t - 1)) / 2
      : 1 - (2 ** (10 - 20 * t) + 2 ** -10 * (1 - 2 * t)) / 2;
    case 21: return 1 - Math.sqrt(1 - t * t);
    case 22: return Math.sqrt(1 - (t - 1) ** 2);
    case 23: return t < 0.5 ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2 : (1 + Math.sqrt(1 - (2 * t - 2) ** 2)) / 2;
    case 24: return 1 - elasticOut(1 - t);
    case 25: return elasticOut(t);
    case 26: return elasticOut(t, 0.5);
    case 27: return elasticOut(t, 0.25);
    case 28: {
      const wave = (x: number): number => Math.sin((x - 0.1125) * 2 * Math.PI / 0.45);
      const correction = 2 ** -10 * wave(1);
      return t < 0.5
        ? -(2 ** (20 * t - 10) * wave(1 - 2 * t) - correction * (1 - 2 * t)) / 2
        : 1 + (2 ** (10 - 20 * t) * wave(2 * t - 1) - correction * (2 * t - 1)) / 2;
    }
    case 29: return t * t * (2.70158 * t - 1.70158);
    case 30: return 1 + (t - 1) ** 2 * (2.70158 * (t - 1) + 1.70158);
    case 31: {
      const c = 1.70158 * 1.525;
      return t < 0.5 ? (2 * t) ** 2 * ((c + 1) * 2 * t - c) / 2
        : ((2 * t - 2) ** 2 * ((c + 1) * (2 * t - 2) + c) + 2) / 2;
    }
    case 32: return 1 - bounceOut(1 - t);
    case 33: return bounceOut(t);
    case 34: return t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2;
    default: return t;
  }
}

type TrackKey = 'x' | 'y' | 'fade' | 'uniform' | 'vectorX' | 'vectorY' | 'rotation' | 'r' | 'g' | 'b';
type TrackCommand = { start: number; end: number; easing: number; from: number; to: number };
type Tracks = Record<TrackKey, TrackCommand[]>;
type PreparedCommands = { tracks: Tracks; parameters: Extract<StoryboardCommand, { type: 'P' }>[]; start: number; end: number };
const prepared = new WeakMap<readonly StoryboardCommand[], PreparedCommands>();

function prepare(commands: readonly StoryboardCommand[]): PreparedCommands {
  const existing = prepared.get(commands);
  if (existing) return existing;
  const tracks: Tracks = { x: [], y: [], fade: [], uniform: [], vectorX: [], vectorY: [], rotation: [], r: [], g: [], b: [] };
  const result: PreparedCommands = { tracks, parameters: [], start: Infinity, end: -Infinity };
  for (const command of commands) {
    result.start = Math.min(result.start, command.start);
    result.end = Math.max(result.end, command.end);
    const add = (key: TrackKey, from: number, to: number): void => {
      tracks[key].push({ start: command.start, end: command.end, easing: command.easing, from, to });
    };
    switch (command.type) {
      case 'F': add('fade', command.startValue, command.endValue); break;
      case 'MX': add('x', command.startValue, command.endValue); break;
      case 'MY': add('y', command.startValue, command.endValue); break;
      case 'S': add('uniform', command.startValue, command.endValue); break;
      case 'R': add('rotation', command.startValue, command.endValue); break;
      case 'M': add('x', command.startX, command.endX); add('y', command.startY, command.endY); break;
      case 'V': add('vectorX', command.startX, command.endX); add('vectorY', command.startY, command.endY); break;
      case 'C': add('r', command.startR, command.endR); add('g', command.startG, command.endG); add('b', command.startB, command.endB); break;
      case 'P': result.parameters.push(command); break;
    }
  }
  for (const track of Object.values(tracks)) track.sort((a, b) => a.start - b.start);
  if (tracks.fade[0]?.from === 0) {
    const visible = tracks.fade.find((command) => command.from > 0 || command.to > 0);
    if (visible) result.start = visible.start;
  }
  result.parameters.sort((a, b) => a.start - b.start);
  prepared.set(commands, result);
  return result;
}

function commandAt(track: readonly TrackCommand[], timeMs: number): TrackCommand | undefined {
  let low = 0;
  let high = track.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (track[middle]!.start <= timeMs) low = middle + 1;
    else high = middle;
  }
  return track[Math.max(0, low - 1)];
}

function valueAt(track: readonly TrackCommand[], timeMs: number, fallback: number): number {
  const command = commandAt(track, timeMs);
  if (!command) return fallback;
  if (timeMs < command.start) return command.from;
  const span = command.end - command.start;
  const fraction = span <= 0 ? 1 : ease(command.easing, (timeMs - command.start) / span);
  return command.from + (command.to - command.from) * fraction;
}

function parameterAt(commands: PreparedCommands['parameters'], timeMs: number, parameter: 'H' | 'V' | 'A'): boolean {
  let current: PreparedCommands['parameters'][number] | undefined;
  for (const command of commands) {
    if (command.start > timeMs) break;
    if (command.parameter === parameter) current = command;
  }
  return current !== undefined && (current.start === current.end || timeMs <= current.end);
}

const combinedRuns = new WeakMap<StoryboardObject, { runs: StoryboardTriggerRun[]; commands: PreparedCommands }>();

function commandsAt(object: StoryboardObject, timeMs: number): { commands: PreparedCommands; start: number } | null {
  const base = prepare(object.commands);
  const baseActive = timeMs >= base.start && timeMs <= base.end;
  if (!object.triggerRuns?.length) return baseActive ? { commands: base, start: base.start } : null;
  const runs = object.triggerRuns.filter((run) => timeMs >= run.start && timeMs <= run.end && (run.stopMs === undefined || timeMs < run.stopMs));
  if (!baseActive && runs.length === 0) return null;
  if (runs.length === 0) return { commands: base, start: base.start };
  const cached = combinedRuns.get(object);
  if (cached && cached.runs.length === runs.length && cached.runs.every((run, index) => run === runs[index])) {
    return { commands: cached.commands, start: baseActive ? base.start : runs[runs.length - 1]!.start };
  }
  const commands = prepare([...object.commands, ...runs.flatMap((run) => run.commands)]);
  combinedRuns.set(object, { runs, commands });
  return { commands, start: baseActive ? base.start : runs[runs.length - 1]!.start };
}

export function evaluateSprite(object: StoryboardObject, timeMs: number): SpriteState | null {
  const active = commandsAt(object, timeMs);
  if (!active) return null;
  const { tracks, parameters } = active.commands;
  let fade = valueAt(tracks.fade, timeMs, 1);
  if (fade > 1) fade %= 1;
  if (fade <= 0) return null;
  const uniform = valueAt(tracks.uniform, timeMs, 1);
  let file = object.file;
  if (object.kind === 'Animation') {
    const frame = Math.floor(Math.max(0, timeMs - active.start) / object.frameDelay);
    file = animationFrameFile(file, object.loopForever ? frame % object.frameCount : Math.min(object.frameCount - 1, frame));
  }
  return {
    x: valueAt(tracks.x, timeMs, object.x), y: valueAt(tracks.y, timeMs, object.y), fade,
    scaleX: uniform * valueAt(tracks.vectorX, timeMs, 1), scaleY: uniform * valueAt(tracks.vectorY, timeMs, 1),
    rotation: valueAt(tracks.rotation, timeMs, 0),
    r: valueAt(tracks.r, timeMs, 255), g: valueAt(tracks.g, timeMs, 255), b: valueAt(tracks.b, timeMs, 255),
    flipH: parameterAt(parameters, timeMs, 'H'), flipV: parameterAt(parameters, timeMs, 'V'),
    additive: parameterAt(parameters, timeMs, 'A'), file,
  };
}

function sourceSize(image: CanvasImageSource): { width: number; height: number } {
  const source = image as { width?: number; height?: number; videoWidth?: number; videoHeight?: number };
  return { width: Number(source.videoWidth ?? source.width ?? 0), height: Number(source.videoHeight ?? source.height ?? 0) };
}

export function drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, width = LOGICAL_W, height = LOGICAL_H): void {
  const size = sourceSize(image);
  if (size.width <= 0 || size.height <= 0) return;
  const scale = Math.max(width / size.width, height / size.height);
  const drawW = size.width * scale;
  const drawH = size.height * scale;
  ctx.drawImage(image, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
}

export function multiplyRgbaPixels(source: Uint8ClampedArray, r: number, g: number, b: number, result = new Uint8ClampedArray(source.length)): Uint8ClampedArray {
  const red = Math.max(0, Math.min(255, r)) / 255;
  const green = Math.max(0, Math.min(255, g)) / 255;
  const blue = Math.max(0, Math.min(255, b)) / 255;
  for (let index = 0; index < source.length; index += 4) {
    result[index] = source[index]! * red;
    result[index + 1] = source[index + 1]! * green;
    result[index + 2] = source[index + 2]! * blue;
    result[index + 3] = source[index + 3]!;
  }
  return result;
}

type TintCanvas = OffscreenCanvas | HTMLCanvasElement;
type TintEntry = { canvas: TintCanvas; bytes: number };
const TINT_CACHE_BYTES = 32 * 1024 * 1024;
const tintCache = new Map<CanvasImageSource, Map<string, TintEntry>>();
const tintLru = new Map<TintEntry, { image: CanvasImageSource; colour: string }>();
let tintCacheBytes = 0;
let nativeColourFilter: boolean | undefined;
const colourFilters = new Map<string, string>();

function colourFilter(red: number, green: number, blue: number): string {
  const key = `${red},${green},${blue}`;
  const cached = colourFilters.get(key);
  if (cached) return cached;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><filter id="c" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${red / 255} 0 0 0 0 0 ${green / 255} 0 0 0 0 0 ${blue / 255} 0 0 0 0 0 1 0"/></filter></svg>`;
  const filter = `url(data:image/svg+xml,${encodeURIComponent(svg)}#c)`;
  if (colourFilters.size >= 1024) colourFilters.delete(colourFilters.keys().next().value!);
  colourFilters.set(key, filter);
  return filter;
}

function supportsNativeColourFilter(ctx: CanvasRenderingContext2D): boolean {
  // OffscreenCanvas accepts URL filters but silently ignores them in Chromium.
  if (typeof document === 'undefined' || typeof CanvasRenderingContext2D === 'undefined' || !(ctx instanceof CanvasRenderingContext2D)) return false;
  if (nativeColourFilter !== undefined) return nativeColourFilter;
  const canvas = document.createElement('canvas');
  canvas.width = 2; canvas.height = 1;
  const probe = canvas.getContext('2d', { willReadFrequently: true });
  if (!probe) return nativeColourFilter = false;
  probe.fillStyle = '#ff4020'; probe.fillRect(0, 0, 1, 1);
  probe.fillStyle = 'rgba(255,64,32,0.5019607843137255)'; probe.fillRect(1, 0, 1, 1);
  const source = document.createElement('canvas'); source.width = 2; source.height = 1;
  const sourceContext = source.getContext('2d')!;
  sourceContext.drawImage(canvas, 0, 0);
  probe.clearRect(0, 0, 2, 1);
  probe.filter = colourFilter(128, 255, 0);
  probe.drawImage(source, 0, 0);
  const pixel = probe.getImageData(0, 0, 2, 1).data;
  nativeColourFilter = pixel[0] === 128 && pixel[1] === 64 && pixel[2] === 0 && pixel[3] === 255 &&
    pixel[4] === 128 && pixel[5] === 64 && pixel[6] === 0 && pixel[7] === 128;
  canvas.width = source.width = 0;
  return nativeColourFilter;
}

export function releaseStoryboardRenderResources(): void {
  for (const entry of tintLru.keys()) { entry.canvas.width = 0; entry.canvas.height = 0; }
  tintCache.clear();
  tintLru.clear();
  colourFilters.clear();
  tintCacheBytes = 0;
}

function tintedImage(image: CanvasImageSource, r: number, g: number, b: number): CanvasImageSource {
  const red = Math.round(Math.max(0, Math.min(255, r)));
  const green = Math.round(Math.max(0, Math.min(255, g)));
  const blue = Math.round(Math.max(0, Math.min(255, b)));
  if (red === 255 && green === 255 && blue === 255) return image;
  const colour = `${red},${green},${blue}`;
  let entry = tintCache.get(image)?.get(colour);
  if (!entry) {
    const size = sourceSize(image);
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size.width, size.height) : document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!context) return image;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, size.width, size.height);
    multiplyRgbaPixels(pixels.data, red, green, blue, pixels.data);
    context.putImageData(pixels, 0, 0);
    const bytes = size.width * size.height * 4;
    while (tintLru.size > 0 && tintCacheBytes + bytes > TINT_CACHE_BYTES) {
      const [oldest, owner] = tintLru.entries().next().value!;
      tintCacheBytes -= oldest.bytes;
      oldest.canvas.width = 0; oldest.canvas.height = 0;
      tintLru.delete(oldest);
      const variants = tintCache.get(owner.image)!;
      variants.delete(owner.colour);
      if (!variants.size) tintCache.delete(owner.image);
    }
    entry = { canvas, bytes };
    const variants = tintCache.get(image) ?? new Map<string, TintEntry>();
    variants.set(colour, entry);
    tintCache.set(image, variants);
    tintCacheBytes += bytes;
  } else tintLru.delete(entry);
  tintLru.set(entry, { image, colour });
  return entry.canvas;
}

type ActiveInterval = { start: number; end: number; order: number; object: StoryboardObject };
type IntervalNode = { centre: number; byStart: ActiveInterval[]; byEnd: ActiveInterval[]; left: IntervalNode | null; right: IntervalNode | null };
const objectIndexes = new WeakMap<readonly StoryboardObject[], Map<StoryboardLayer, IntervalNode | null>>();

function intervalNode(intervals: ActiveInterval[]): IntervalNode | null {
  if (!intervals.length) return null;
  const points = intervals.map(interval => interval.start).sort((a, b) => a - b);
  const centre = points[points.length >>> 1]!;
  const left: ActiveInterval[] = [], right: ActiveInterval[] = [], crossing: ActiveInterval[] = [];
  for (const interval of intervals) {
    if (interval.end < centre) left.push(interval);
    else if (interval.start > centre) right.push(interval);
    else crossing.push(interval);
  }
  return { centre, byStart: crossing.sort((a, b) => a.start - b.start), byEnd: [...crossing].sort((a, b) => b.end - a.end),
    left: intervalNode(left), right: intervalNode(right) };
}

function indexesFor(objects: readonly StoryboardObject[]): Map<StoryboardLayer, IntervalNode | null> {
  const existing = objectIndexes.get(objects);
  if (existing) return existing;
  const entries = new Map<StoryboardLayer, ActiveInterval[]>();
  objects.forEach((object, order) => {
    const layer = entries.get(object.layer) ?? [];
    const base = prepare(object.commands);
    if (base.start <= base.end) layer.push({ start: base.start, end: base.end, object, order });
    for (const run of object.triggerRuns ?? []) {
      const end = Math.min(run.end, run.stopMs ?? Infinity);
      if (run.start <= end) layer.push({ start: run.start, end, object, order });
    }
    entries.set(object.layer, layer);
  });
  const result = new Map([...entries].map(([layer, values]) => [layer, intervalNode(values)]));
  objectIndexes.set(objects, result);
  return result;
}

function activeObjects(node: IntervalNode | null, timeMs: number, found: Map<number, StoryboardObject>): void {
  if (!node) return;
  if (timeMs < node.centre) {
    for (const interval of node.byStart) {
      if (interval.start > timeMs) break;
      found.set(interval.order, interval.object);
    }
    activeObjects(node.left, timeMs, found);
  } else {
    for (const interval of node.byEnd) {
      if (interval.end < timeMs) break;
      found.set(interval.order, interval.object);
    }
    activeObjects(node.right, timeMs, found);
  }
}

export function drawStoryboardLayer(
  ctx: CanvasRenderingContext2D,
  objects: readonly StoryboardObject[],
  timeMs: number,
  layers: readonly StoryboardLayer[],
  getImage: (file: string) => CanvasImageSource | undefined,
  widescreen: boolean,
): void {
  ctx.save();
  const indexes = indexesFor(objects);
  const nativeTint = supportsNativeColourFilter(ctx);
  if (!widescreen) { ctx.beginPath(); ctx.rect(SB_OFFSET_X, 0, 640 * SB_SCALE, LOGICAL_H); ctx.clip(); }
  for (const layer of STORYBOARD_LAYERS) {
    if (!layers.includes(layer)) continue;
    const found = new Map<number, StoryboardObject>();
    activeObjects(indexes.get(layer) ?? null, timeMs, found);
    for (const [, object] of [...found].sort((a, b) => a[0] - b[0])) {
      const state = evaluateSprite(object, timeMs);
      if (!state) continue;
      const image = getImage(state.file);
      if (!image) continue;
      const size = sourceSize(image);
      if (size.width <= 0 || size.height <= 0) continue;
      const pivot = ORIGIN_PIVOT[object.origin];
      const scaleX = state.scaleX * (state.flipH ? -1 : 1);
      const scaleY = state.scaleY * (state.flipV ? -1 : 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, state.fade);
      ctx.translate(SB_OFFSET_X + state.x * SB_SCALE, state.y * SB_SCALE);
      ctx.rotate(state.rotation);
      ctx.scale(scaleX * SB_SCALE, scaleY * SB_SCALE);
      ctx.globalCompositeOperation = state.additive ? 'lighter' : 'source-over';
      const ox = size.width * (scaleX < 0 ? 1 - pivot[0] : pivot[0]);
      const oy = size.height * (scaleY < 0 ? 1 - pivot[1] : pivot[1]);
      let source = image;
      if (nativeTint) {
        const red = Math.round(Math.max(0, Math.min(255, state.r)));
        const green = Math.round(Math.max(0, Math.min(255, state.g)));
        const blue = Math.round(Math.max(0, Math.min(255, state.b)));
        if (red !== 255 || green !== 255 || blue !== 255) ctx.filter = colourFilter(red, green, blue);
      } else source = tintedImage(image, state.r, state.g, state.b);
      ctx.drawImage(source, -ox, -oy, size.width, size.height);
      ctx.restore();
    }
  }
  ctx.restore();
}
