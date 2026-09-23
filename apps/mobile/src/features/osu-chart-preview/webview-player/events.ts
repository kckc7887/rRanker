import {
  assertChartPreviewEventCount,
  assertChartPreviewLoopExpansion,
  assertChartPreviewNestingDepth,
  CHART_PREVIEW_MAX_LOOP_EXPANSION,
  type ChartPreviewCancellation,
  interruptChartPreviewParse,
  throwIfChartPreviewCancelled,
} from '../../chart-preview-shared/chart-preview-resource-budget';
import { resolveArchivePath } from './osu-text';

export type StoryboardLayer = 'Background' | 'Fail' | 'Pass' | 'Foreground' | 'Overlay';
export type StoryboardOrigin =
  | 'TopLeft' | 'Centre' | 'CentreLeft' | 'TopRight' | 'BottomCentre'
  | 'TopCentre' | 'Custom' | 'CentreRight' | 'BottomLeft' | 'BottomRight';

type CommandTiming = { easing: number; start: number; end: number };
export type ScalarCommand = CommandTiming & {
  type: 'F' | 'MX' | 'MY' | 'S' | 'R'; startValue: number; endValue: number;
};
export type VectorCommand = CommandTiming & {
  type: 'M' | 'V'; startX: number; startY: number; endX: number; endY: number;
};
export type ColourCommand = CommandTiming & {
  type: 'C'; startR: number; startG: number; startB: number; endR: number; endG: number; endB: number;
};
export type ParameterCommand = CommandTiming & { type: 'P'; parameter: 'H' | 'V' | 'A' };
export type StoryboardCommand = ScalarCommand | VectorCommand | ColourCommand | ParameterCommand;

/** 未展开的故事板循环。求值时按时间映射到单次迭代，不复制 count 份指令。 */
export type StoryboardLoop = {
  start: number;
  count: number;
  duration: number;
  commands: StoryboardCommand[];
  loops?: StoryboardLoop[];
};

export type StoryboardTrigger = {
  name: string;
  start: number;
  end: number;
  group: number;
  commands: StoryboardCommand[];
  loops?: StoryboardLoop[];
};

export type StoryboardTriggerRun = {
  start: number;
  end: number;
  activationMs: number;
  stopMs?: number;
  commands: StoryboardCommand[];
  loops?: StoryboardLoop[];
};

export type StoryboardObject = {
  kind: 'Sprite' | 'Animation';
  layer: StoryboardLayer;
  origin: StoryboardOrigin;
  file: string;
  x: number;
  y: number;
  frameCount: number;
  frameDelay: number;
  loopForever: boolean;
  commands: StoryboardCommand[];
  loops?: StoryboardLoop[];
  triggers?: StoryboardTrigger[];
  triggerRuns?: StoryboardTriggerRun[];
};

export type StoryboardSample = { file: string; timeMs: number; layer: StoryboardLayer; volume: number };
export type VideoEvent = { file: string; startMs: number };
export type BeatmapVisuals = {
  widescreen: boolean;
  background: string | null;
  backgroundOffset: { x: number; y: number };
  video: VideoEvent | null;
  objects: StoryboardObject[];
  samples: StoryboardSample[];
};

export const STORYBOARD_LAYERS: readonly StoryboardLayer[] = ['Background', 'Fail', 'Pass', 'Foreground', 'Overlay'];
export const UNDER_LAYERS: readonly StoryboardLayer[] = ['Background', 'Pass', 'Foreground'];
export const OVER_LAYERS: readonly StoryboardLayer[] = ['Overlay'];

const ORIGINS: readonly StoryboardOrigin[] = [
  'TopLeft', 'Centre', 'CentreLeft', 'TopRight', 'BottomCentre',
  'TopCentre', 'Custom', 'CentreRight', 'BottomLeft', 'BottomRight',
];
const EVENT_NAMES = ['BACKGROUND', 'VIDEO', 'BREAK', 'COLOUR', 'SPRITE', 'SAMPLE', 'ANIMATION'];

function splitCsv(line: string): string[] {
  const parts: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { parts.push(value.trim()); value = ''; }
    else value += char;
  }
  parts.push(value.trim());
  return parts;
}

function number(raw: string | undefined, fallback = 0): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function layer(raw = ''): StoryboardLayer {
  return STORYBOARD_LAYERS[Number(raw)]
    ?? STORYBOARD_LAYERS.find((value) => value.toLowerCase() === raw.toLowerCase())
    ?? 'Background';
}

function origin(raw = ''): StoryboardOrigin {
  if (raw.toLowerCase() === 'center') return 'Centre';
  return ORIGINS[Number(raw)] ?? ORIGINS.find((value) => value.toLowerCase() === raw.toLowerCase()) ?? 'Centre';
}

function sectionLines(text: string, section: string): string[] {
  let active = false;
  let hasSections = false;
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(raw);
    if (header) { hasSections = true; active = header[1]!.toLowerCase() === section.toLowerCase(); }
    else if (active) lines.push(raw);
  }
  return !hasSections && section === 'Events' ? text.split(/\r?\n/) : lines;
}

function variablesIn(text: string): Map<string, string> {
  const variables = new Map<string, string>();
  for (const line of sectionLines(text, 'Variables')) {
    const match = /^\s*(\$[^=\s]+)\s*=(.*)$/.exec(line);
    if (match) variables.set(match[1]!, match[2]!.trim());
  }
  return variables;
}

function expandVariables(line: string, variables: Map<string, string>): string {
  const names = [...variables.keys()].sort((a, b) => b.length - a.length);
  const seen = new Set<string>();
  let result = line;
  while (result.includes('$') && !seen.has(result)) {
    seen.add(result);
    let next = result;
    for (const name of names) next = next.split(name).join(variables.get(name)!);
    if (next === result) break;
    result = next;
    if (seen.size > variables.size + 1) break;
  }
  return result;
}

function parseCommands(parts: readonly string[]): StoryboardCommand[] {
  const type = parts[0]?.toUpperCase();
  const easing = number(parts[1]);
  const start = number(parts[2]);
  const end = Math.max(start, number(parts[3], start));
  if (type === 'P') {
    const parameter = parts[4]?.toUpperCase();
    return parameter === 'H' || parameter === 'V' || parameter === 'A'
      ? [{ type, easing, start, end, parameter }] : [];
  }
  const dimensions = type === 'C' ? 3 : type === 'M' || type === 'V' ? 2 : 1;
  if (!['F', 'MX', 'MY', 'S', 'R', 'M', 'V', 'C'].includes(type ?? '')) return [];
  const fallback = type === 'C' ? 255 : type === 'S' || type === 'V' ? 1 : 0;
  const values = parts.slice(4).map((part) => number(part, fallback));
  while (values.length < dimensions) values.push(fallback);
  const groups: number[][] = [];
  for (let index = 0; index + dimensions <= values.length; index += dimensions) {
    groups.push(values.slice(index, index + dimensions));
  }
  if (groups.length === 1) groups.push(groups[0]!);
  const commands: StoryboardCommand[] = [];
  for (let index = 0; index < groups.length - 1; index += 1) {
    const first = groups[index]!;
    const last = groups[index + 1]!;
    const timing = { easing, start: start + (end - start) * index, end: end + (end - start) * index };
    if (type === 'M' || type === 'V') {
      commands.push({ ...timing, type, startX: first[0]!, startY: first[1]!, endX: last[0]!, endY: last[1]! });
    } else if (type === 'C') {
      commands.push({ ...timing, type, startR: first[0]!, startG: first[1]!, startB: first[2]!, endR: last[0]!, endG: last[1]!, endB: last[2]! });
    } else {
      commands.push({ ...timing, type: type as ScalarCommand['type'], startValue: first[0]!, endValue: last[0]! });
    }
  }
  return commands;
}

type EventLine = { indent: number; parts: string[] };
type ParsedGroup = { commands: StoryboardCommand[]; triggers: StoryboardTrigger[]; loops: StoryboardLoop[] };
type ParseState = { events: number; cancellation?: ChartPreviewCancellation };

function accountEvent(state: ParseState): void {
  state.events += 1;
  assertChartPreviewEventCount(state.events);
  interruptChartPreviewParse(state.events, state.cancellation);
}

function groupExtent(group: Pick<ParsedGroup, 'commands' | 'loops'>): { first: number; end: number } {
  let first = Infinity;
  let end = -Infinity;
  for (const command of group.commands) {
    first = Math.min(first, command.start);
    end = Math.max(end, command.end);
  }
  for (const loop of group.loops) {
    const bounds = storyboardLoopBounds(loop);
    first = Math.min(first, bounds.start);
    end = Math.max(end, bounds.end);
  }
  return { first, end };
}

function parseGroup(lines: readonly EventLine[], offset: number, depth: number, state: ParseState): ParsedGroup {
  assertChartPreviewNestingDepth(depth);
  const commands: StoryboardCommand[] = [];
  const triggers: StoryboardTrigger[] = [];
  const loops: StoryboardLoop[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    accountEvent(state);
    const type = line.parts[0]?.toUpperCase();
    if (type !== 'L' && type !== 'T') {
      commands.push(...parseCommands(line.parts).map((command) => ({ ...command, start: command.start + offset, end: command.end + offset })));
      continue;
    }
    let last = index + 1;
    while (last < lines.length && lines[last]!.indent > line.indent) last += 1;
    const child = parseGroup(lines.slice(index + 1, last), 0, depth + 1, state);
    index = last - 1;
    if (type === 'T') {
      triggers.push({
        name: line.parts[1] ?? '', start: number(line.parts[2], -Infinity), end: number(line.parts[3], Infinity),
        group: number(line.parts[4]), commands: child.commands,
        ...(child.loops.length > 0 ? { loops: child.loops } : {}),
      });
      continue;
    }
    const loopStart = number(line.parts[1]) + offset;
    const count = Math.max(1, Math.floor(number(line.parts[2], 1)));
    if (child.commands.length === 0 && child.loops.length === 0) continue;
    const extent = groupExtent(child);
    const duration = extent.end - extent.first;
    const iterations = duration === 0 ? 1 : count;
    const expansion = iterations * Math.max(1, child.commands.length + child.loops.length);
    const span = duration > 0 ? duration * (iterations - 1) : 0;
    if (!Number.isFinite(loopStart) || !Number.isFinite(span) || !Number.isFinite(expansion)) {
      assertChartPreviewLoopExpansion(Number.NaN);
    }
    if (child.loops.length === 0 && expansion <= CHART_PREVIEW_MAX_LOOP_EXPANSION) {
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        interruptChartPreviewParse(iteration, state.cancellation);
        const shift = loopStart + duration * iteration;
        for (const command of child.commands) commands.push({ ...command, start: command.start + shift, end: command.end + shift });
      }
      continue;
    }
    loops.push({
      start: loopStart,
      count: iterations,
      duration: duration === 0 ? 0 : duration,
      commands: child.commands,
      ...(child.loops.length > 0 ? { loops: child.loops } : {}),
    });
  }
  return { commands, triggers, loops };
}

function parseEventsBlock(text: string, sourcePath: string, formatVersion: number, state: ParseState): Omit<BeatmapVisuals, 'widescreen'> {
  const variables = variablesIn(text);
  const lines: EventLine[] = sectionLines(text, 'Events')
    .filter((line) => line.trim() && !line.trimStart().startsWith('//'))
    .map((line) => {
      const expanded = expandVariables(line, variables);
      const indent = /^[ _\t]*/.exec(expanded)![0].length;
      return { indent, parts: splitCsv(expanded.slice(indent)) };
    });
  const result: Omit<BeatmapVisuals, 'widescreen'> = {
    background: null, backgroundOffset: { x: 0, y: 0 }, video: null, objects: [], samples: [],
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.indent > 0) continue;
    accountEvent(state);
    const parts = line.parts;
    const rawType = parts[0]?.toUpperCase() ?? '';
    const type = /^\d+$/.test(rawType) ? EVENT_NAMES[Number(rawType)] : rawType;
    if (type === 'BACKGROUND' && !result.background) {
      result.background = resolveArchivePath(parts[2] ?? '', sourcePath) || null;
      result.backgroundOffset = { x: number(parts[3]), y: number(parts[4]) };
    } else if (type === 'VIDEO' && !result.video) {
      const file = resolveArchivePath(parts[2] ?? '', sourcePath);
      if (file) result.video = { file, startMs: number(parts[1]) };
    } else if (type === 'SAMPLE') {
      const file = resolveArchivePath(parts[3] ?? '', sourcePath);
      if (file) result.samples.push({ file, timeMs: number(parts[1]), layer: layer(parts[2]), volume: Math.max(0, Math.min(100, number(parts[4], 100))) / 100 });
    } else if (type === 'SPRITE' || type === 'ANIMATION') {
      let last = index + 1;
      while (last < lines.length && lines[last]!.indent > 0) last += 1;
      const group = parseGroup(lines.slice(index + 1, last), 0, 1, state);
      index = last - 1;
      const file = resolveArchivePath(parts[3] ?? '', sourcePath);
      if (!file) continue;
      const rawDelay = Math.max(1, number(parts[7], 1000));
      const delay = formatVersion < 6 ? Math.round(0.015 * rawDelay) * 1.186 * 1000 / 60 : rawDelay;
      result.objects.push({
        kind: type === 'ANIMATION' ? 'Animation' : 'Sprite', layer: layer(parts[1]), origin: origin(parts[2]), file,
        x: number(parts[4]), y: number(parts[5]),         frameCount: type === 'ANIMATION' ? Math.max(1, Math.floor(number(parts[6], 1))) : 1,
        frameDelay: Math.max(1, delay), loopForever: !['looponce', '1'].includes((parts[8] ?? '').toLowerCase()),
        commands: group.commands, triggers: group.triggers,
        ...(group.loops.length > 0 ? { loops: group.loops } : {}),
      });
    }
  }
  return result;
}

export function parseBeatmapVisuals(
  osuText: string,
  osbTexts: readonly string[] = [],
  sources: { osuPath?: string; osbPaths?: readonly string[]; cancellation?: ChartPreviewCancellation } = {},
): BeatmapVisuals {
  const state: ParseState = { events: 0, cancellation: sources.cancellation };
  throwIfChartPreviewCancelled(state.cancellation);
  const formatVersion = number(/^\s*osu file format v(\d+)/im.exec(osuText)?.[1], 14);
  const parsed = parseEventsBlock(osuText, sources.osuPath ?? '', formatVersion, state);
  for (let index = 0; index < osbTexts.length; index += 1) {
    interruptChartPreviewParse(index, state.cancellation);
    const shared = parseEventsBlock(osbTexts[index]!, sources.osbPaths?.[index] ?? '', formatVersion, state);
    parsed.objects.push(...shared.objects);
    parsed.samples.push(...shared.samples);
    parsed.video ??= shared.video;
  }
  return { widescreen: /^\s*WidescreenStoryboard\s*:\s*1\s*$/im.test(osuText), ...parsed };
}

export function animationFrameFile(file: string, frame: number): string {
  const slash = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
  const dot = file.lastIndexOf('.');
  return dot > slash ? `${file.slice(0, dot)}${frame}${file.slice(dot)}` : `${file}${frame}.png`;
}

export function referencedImageFiles(objects: readonly StoryboardObject[]): string[] {
  const files = new Map<string, string>();
  for (const object of objects) {
    for (let frame = 0; frame < object.frameCount; frame += 1) {
      const file = object.kind === 'Animation' ? animationFrameFile(object.file, frame) : object.file;
      files.set(file.replace(/\\/g, '/').toLowerCase(), file);
    }
  }
  return [...files.values()];
}

export function storyboardLoopBounds(loop: StoryboardLoop): { start: number; end: number } {
  let first = Infinity;
  let end = -Infinity;
  for (const command of loop.commands) {
    first = Math.min(first, command.start);
    end = Math.max(end, command.end);
  }
  for (const nested of loop.loops ?? []) {
    const bounds = storyboardLoopBounds(nested);
    first = Math.min(first, bounds.start);
    end = Math.max(end, bounds.end);
  }
  const iterations = loop.duration === 0 ? 1 : loop.count;
  const lastShift = loop.start + (loop.duration > 0 ? loop.duration * (iterations - 1) : 0);
  return { start: first + loop.start, end: end + lastShift };
}

function iterationIndex(baseStart: number, duration: number, count: number, timeMs: number): number | null {
  if (!(baseStart <= timeMs)) return null;
  if (!(duration > 0) || count <= 1) return 0;
  const index = Math.floor((timeMs - baseStart) / duration);
  if (!Number.isFinite(index) || index < 0) return null;
  return Math.min(count - 1, index);
}

function shiftCommand(command: StoryboardCommand, shift: number): StoryboardCommand {
  return { ...command, start: command.start + shift, end: command.end + shift };
}

function activeLoopCommands(loop: StoryboardLoop, timeMs: number, parentShift = 0): StoryboardCommand[] {
  const commands: StoryboardCommand[] = [];
  for (const command of loop.commands) {
    const base = parentShift + loop.start + command.start;
    const index = iterationIndex(base, loop.duration, loop.count, timeMs);
    if (index === null) continue;
    const shift = parentShift + loop.start + (loop.duration > 0 ? loop.duration * index : 0);
    commands.push(shiftCommand(command, shift));
  }
  for (const nested of loop.loops ?? []) {
    const bounds = storyboardLoopBounds(nested);
    const index = iterationIndex(parentShift + loop.start + bounds.start, loop.duration, loop.count, timeMs);
    if (index === null) continue;
    const shift = parentShift + loop.start + (loop.duration > 0 ? loop.duration * index : 0);
    commands.push(...activeLoopCommands(nested, timeMs, shift));
  }
  return commands;
}

/** 在给定时间展开当前迭代。没有循环时返回原数组，避免每帧复制。 */
export function resolveStoryboardCommands(
  commands: readonly StoryboardCommand[],
  loops: readonly StoryboardLoop[] | undefined,
  timeMs: number,
): readonly StoryboardCommand[] {
  if (!loops?.length) return commands;
  return [...commands, ...loops.flatMap((loop) => activeLoopCommands(loop, timeMs))];
}

export function storyboardTimeRange(
  objects: readonly StoryboardObject[], samples: readonly StoryboardSample[] = [],
): { startMs: number; endMs: number } {
  let startMs = 0;
  let endMs = 0;
  for (const object of objects) {
    for (const command of object.commands) { startMs = Math.min(startMs, command.start); endMs = Math.max(endMs, command.end); }
    for (const loop of object.loops ?? []) {
      const bounds = storyboardLoopBounds(loop);
      startMs = Math.min(startMs, bounds.start);
      endMs = Math.max(endMs, bounds.end);
    }
    for (const run of object.triggerRuns ?? []) { startMs = Math.min(startMs, run.start); endMs = Math.max(endMs, run.end); }
  }
  for (const sample of samples) { startMs = Math.min(startMs, sample.timeMs); endMs = Math.max(endMs, sample.timeMs); }
  return { startMs, endMs };
}
