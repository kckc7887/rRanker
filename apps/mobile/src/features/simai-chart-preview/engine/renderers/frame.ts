/** MajdataViewX NoteDatas / Updaters / shaders, adapted to deterministic Canvas commands.
 * GPL-3.0; see THIRD_PARTY_NOTICES.md. Real time controls lifetimes; SV affects poses only. */
import type { Chart, Note, RendererConfig, SlideBranch } from '../types';
import { ScrollTimeline } from '../core/timing/ScrollTimeline';
import { buttonPoint, pathPose, prepareBranch, joinGeometries, consumedArrows, type Geometry } from '../core/geometry/slidePath';
import { arcadeTapTravelSpeed, arcadeTouchDurations, breakPulseBrightness } from '../utils/arcadeMotion';
import { judgeTextSkinPath, judgeHintTapHoldTouchText } from '../utils/judgeHint';
import { effectCurve } from './effects';
import { SKIN_TRANSFORM, EACH_COLOR, resolveStarSkin } from './skinSemantics';

export type DrawCommand = {
  path: string; x: number; y: number; angle: number; scale: number; alpha: number; layer: number; time: number; order: number;
  stretch?: number; exPath?: string; tint?: string; cutoff?: number; brightness?: number;
  stack?: number; effect?: { kind: 'tap' | 'touch' | 'hold' | 'firework'; ageMs: number; isBreak: boolean };
};
type TimedNotes = { times: number[]; notes: Note[] };
type NoteFacts = { startScroll: number; endScroll: number; point: { x: number; y: number }; slide?: { double: boolean; length: number; duration: number } };
export type PreparedChart = {
  chart: Chart; scroll: ScrollTimeline; branches: Map<SlideBranch, ReturnType<typeof prepareBranch>>; paths: Map<SlideBranch, Geometry>; groups: Map<number, Note[]>;
  starts: Map<string | number, TimedNotes>; finishes: Map<string | number, TimedNotes>; fireworks: TimedNotes;
  touches: Note[]; facts: Map<Note, NoteFacts>; eachGroups: { time: number; usingSV: boolean; heads: Note[] }[];
  judgements: { notes: number[]; breaks: number[]; noEx: number[] };
};
export function prepareChart(chart: Chart): PreparedChart {
  const branches = new Map<SlideBranch, ReturnType<typeof prepareBranch>>(), groups = new Map<number, Note[]>();
  const paths = new Map<SlideBranch, Geometry>();
  const judgements = { notes: [] as number[], breaks: [] as number[], noEx: [] as number[] };
  const addJudgement = (time: number, isBreak: boolean, isEx: boolean) => {
    judgements.notes.push(time); if (isBreak) { judgements.breaks.push(time); if (!isEx) judgements.noEx.push(time); }
  };
  for (const note of chart.notes) {
    if (!note.isMine && !(note.type === 'slide' && note.isHeadless)) addJudgement(note.type === 'slide' ? note.timingMs : note.endTimeMs, note.isBreak, note.isEx);
    if (note.type === 'slide') for (const branch of note.branches) {
      if (!branch.isMine) addJudgement(note.timingMs + branch.delayMs + branch.durationMs, branch.isBreak, false);
      try { const parts = prepareBranch(branch); branches.set(branch, parts); paths.set(branch, joinGeometries(parts.map(p => p.geometry))); } catch (error) { throw new Error(`Invalid slide at ${note.source.line}:${note.source.column}: ${note.source.text}`, { cause: error }); }
    }
    const group = groups.get(note.group) ?? []; group.push(note); groups.set(note.group, group);
  }
  for (const times of Object.values(judgements)) times.sort((a, b) => a - b);
  const scroll = new ScrollTimeline(chart.scrollEvents);
  const facts = new Map<Note, NoteFacts>();
  const startNotes = new Map<string | number, Note[]>(), finishNotes = new Map<string | number, Note[]>();
  const fireworks: Note[] = [], touches: Note[] = [];
  const finishTime = (note: Note) => note.type === 'slide' ? note.timingMs : note.endTimeMs;
  for (const note of chart.notes) {
    const touch = note.type === 'touch' || note.type === 'touch-hold-start';
    facts.set(note, { startScroll: scroll.at(note.timingMs), endScroll: scroll.at(note.endTimeMs),
      point: touch ? touchPoint(String(note.position)) : buttonPoint(Number(note.position)) });
    if (note.type === 'touch') touches.push(note);
    if (note.isMine || (note.type === 'slide' && note.isHeadless)) continue;
    const starts = startNotes.get(note.position) ?? []; starts.push(note); startNotes.set(note.position, starts);
    const finishes = finishNotes.get(note.position) ?? []; finishes.push(note); finishNotes.set(note.position, finishes);
    if ('hasFirework' in note && note.hasFirework) fireworks.push(note);
  }
  const index = (notes: Note[], time: (note: Note) => number): TimedNotes => {
    // Stable sort retains original input order for simultaneous events (the last one wins).
    const sorted = notes.filter((note) => !Number.isNaN(time(note))).sort((a, b) => time(a) - time(b));
    return { notes: sorted, times: sorted.map(time) };
  };
  const starts = new Map([...startNotes].map(([position, notes]) => [position, index(notes, (note) => note.timingMs)]));
  const finishes = new Map([...finishNotes].map(([position, notes]) => [position, index(notes, finishTime)]));
  const eachGroups = [...groups.values()].map((group) => {
    const slideHeads = new Map<string | number, Note[]>();
    for (const note of group) if (note.type === 'slide') {
      const same = slideHeads.get(note.position) ?? []; same.push(note); slideHeads.set(note.position, same);
    }
    for (const same of slideHeads.values()) {
      const sameBranches = same.flatMap((note) => note.type === 'slide' ? note.branches : []);
      const slide = { double: sameBranches.length > 1,
        length: sameBranches.reduce((sum, branch) => sum + branches.get(branch)!.reduce((length, part) => length + part.geometry.length, 0), 0),
        duration: sameBranches.reduce((sum, branch) => sum + branch.durationMs / 1000, 0) };
      for (const note of same) facts.get(note)!.slide = slide;
    }
    return { time: group[0].timingMs,
      usingSV: group.some((note) => !note.isMine && note.usingSV && (note.type === 'tap' || note.type === 'break' || note.type === 'hold-start')),
      heads: group.filter((note) => !note.isMine && typeof note.position === 'number' && !(note.type === 'slide' && note.isHeadless)) };
  });
  return { chart, scroll, branches, paths, groups, judgements, starts, finishes,
    fireworks: index(fireworks, finishTime), touches, facts, eachGroups };
}
export function completedAt(times: readonly number[], now: number): number {
  let lo = 0, hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] <= now) lo = mid + 1; else hi = mid; }
  return lo;
}
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const DEG = Math.PI / 180;
export function touchPoint(position: string) {
  const type = position[0], i = Number(position[1] ?? 1);
  if (type === 'C') return { x: 0, y: 0 };
  const radius = type === 'B' ? 2.2 : type === 'E' ? 3.1 : 4.1;
  const angle = Math.PI * ((type === 'D' || type === 'E' ? 6 : 5) - i * 2) / 8;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}
const variant = (n: { isMine: boolean; isBreak: boolean; isEach: boolean }) => n.isMine ? n.isBreak ? '_break_mine' : '_mine' : n.isBreak ? '_break' : n.isEach ? '_each' : '';
const tint = (n: { isMine: boolean; isBreak: boolean; isEach: boolean }, star = false) => n.isMine ? '#272727' : n.isBreak ? '#ffbe50' : n.isEach ? EACH_COLOR : star ? '#00ccff' : '#ffb7e8';
const guide = (n: Note, star: boolean) => `NoteGuideSkins/${n.isMine ? 'Mine' : n.isBreak ? 'Break' : n.isEach ? 'Each' : star ? 'Slide' : 'Normal'}.png`;

export function buildFrame(prepared: PreparedChart, now: number, config: RendererConfig): DrawCommand[] {
  const result: DrawCommand[] = [], { chart, scroll } = prepared;
  const tapSpeed = arcadeTapTravelSpeed(config.hiSpeed) / (config.alwaysKeepHiSpeed ? config.playbackSpeed : 1);
  const currentScroll = scroll.at(now);
  const elapsed = (note: Note, end = false) => ((note.usingSV
    ? currentScroll - (end ? prepared.facts.get(note)!.endScroll : prepared.facts.get(note)!.startScroll)
    : now - (end ? note.endTimeMs : note.timingMs)) / 1000);
  const latest = (events: TimedNotes | undefined) => events?.notes[completedAt(events.times, now) - 1];
  const firework = latest(prepared.fireworks);
  const touchOverlaps = new Map<string | number, Note[]>();
  // Touch visibility still evaluates full SV semantics, including zero and negative velocity.
  for (const n of prepared.touches) {
    if (n.timingMs >= now && -elapsed(n) < arcadeTouchDurations(config.hiSpeed * n.hiSpeed / (config.alwaysKeepHiSpeed ? config.playbackSpeed : 1)).wholeDuration) {
      const notes = touchOverlaps.get(n.position) ?? []; notes.push(n); touchOverlaps.set(n.position, notes);
    }
  }
  const emit = (n: Note, path: string, layer: number, values: Partial<DrawCommand> = {}) => {
    const command: DrawCommand = { path: resolveStarSkin(path, config.pinkSlideStart), layer, x: 0, y: 0, angle: 0, scale: 1, alpha: 1, time: n.timingMs, order: n.id, ...values };
    if (command.alpha > 0 && command.scale > 0 && Number.isFinite(command.x + command.y + command.angle + command.scale)) result.push(command);
  };
  for (const n of chart.notes) {
    const age = now - n.timingMs, endAge = now - n.endTimeMs;
    if (endAge > 1400) continue;
    if (n.type === 'slide') {
      for (const branch of n.branches) {
        const parts = [{ geometry: prepared.paths.get(branch)!, startMs: branch.delayMs, durationMs: branch.durationMs }];
        const style = { isBreak: branch.isBreak && !config.normalColorBreakSlide, isMine: branch.isMine, isEach: n.isSlideEach };
        const fadeStart = -3.926913 / (tapSpeed * n.hiSpeed) * 1000;
        const fadeDuration = Math.min(fadeStart + 200, 0) - fadeStart;
        const alpha = age > 0 ? 1 : clamp((age - fadeStart) / fadeDuration);
        const branchEnd = n.timingMs + branch.delayMs + branch.durationMs;
        const branchAge = now - branchEnd;
        for (let segmentIndex = 0; segmentIndex < parts.length; segmentIndex++) {
          const part = parts[segmentIndex], g = part.geometry;
          const started = age - part.startMs, progress = clamp(started / Math.max(1, part.durationMs));
          if (branchAge <= 0 && started <= part.durationMs) {
            const consumed = consumedArrows(g, progress);
            for (let i = 1; i < g.arrows.length - 1 - (g.omitLast && segmentIndex === parts.length - 1 ? 1 : 0); i++) {
              const p = g.arrows[i];
              if (started > 0 && i <= consumed) continue;
              const path = g.wifi ? `WifiSkins/wifi${style.isMine ? '_mine' : variant(style)}_${i - 1}.png` : `SlideSkins/slide${variant(style)}.png`;
              emit(n, path, 2, { ...p, alpha, order: n.id * 1024 + segmentIndex * 256 + i, brightness: style.isBreak ? breakPulseBrightness(now) : 1 });
            }
            if (age >= 0 && (started >= 0 || segmentIndex === 0)) {
              const starAlpha = started <= 0 ? clamp(age / Math.max(1, branch.delayMs)) : 1;
              const starScale = starAlpha + 0.5;
              if (g.wifi) {
                const endPosition = branch.segments[0].endPos;
                for (const position of [endPosition - 1, endPosition, endPosition + 1]) {
                  const start = buttonPoint(n.position), end = buttonPoint(position);
                  const p = { x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress };
                  emit(n, `StarSkins/star${variant(style)}.png`, 3, { ...p, angle: Math.atan2(end.y - start.y, end.x - start.x) - Math.PI / 2, alpha: starAlpha, scale: starScale, stack: 1 });
                }
              } else {
                const p = pathPose(g, progress);
                emit(n, `StarSkins/star${variant(style)}.png`, 3, { ...p, angle: p.angle + Math.PI / 2, alpha: starAlpha, scale: starScale, stack: 1 });
              }
            }
          }
        }
        if (branchAge >= 0 && branchAge < 450 && !branch.isMine && config.judgeHint !== 'hidden') {
          const g = parts[parts.length - 1].geometry;
          emitSlideOk(n, g, branch.isBreak, branchAge, config, emit);
        }
      }
    }
    const touch = n.type === 'touch' || n.type === 'touch-hold-start';
    const hold = n.type === 'hold-start' || n.type === 'touch-hold-start';
    const alive = now <= (hold ? n.endTimeMs : n.timingMs);
    if (touch && alive) {
      const timing = elapsed(n), p = prepared.facts.get(n)!.point;
      const speed = config.hiSpeed * n.hiSpeed / (config.alwaysKeepHiSpeed ? config.playbackSpeed : 1);
      const durations = arcadeTouchDurations(speed), { wholeDuration, moveDuration, displayDuration } = durations;
      if (-timing <= wholeDuration) {
        const alpha = -timing > moveDuration ? clamp(1 - (-timing - moveDuration) / displayDuration) : 1;
        const fanDist = clamp(-Math.exp(8 * timing * 0.43 / moveDuration - 0.85) + 0.42, 0, 0.4);
        const radius = 0.226 + fanDist;
        if (hold) {
          const border = n.isMine ? 'TouchHoldSkins/touchhold_mine_border.png' : `TouchHoldSkins/touchhold${n.isBreak ? '_break' : ''}_border.png`;
          const duration = n.usingSV ? (prepared.facts.get(n)!.endScroll - prepared.facts.get(n)!.startScroll) / 1000 : (n.endTimeMs - n.timingMs) / 1000;
          const cutoff = duration === 0 ? 1 : clamp(timing / duration);
          emit(n, border, 4, { ...p, alpha, cutoff });
        }
        for (let i = 0; i < 4; i++) {
          const angle = (hold ? 45 - 90 * i : 90 * i) * DEG;
          const path = hold ? `TouchHoldSkins/touchhold${n.isMine ? '_mine' : n.isBreak ? '_break' : ''}_${i}.png` : `TouchSkins/touch${variant(n)}.png`;
          emit(n, path, 5, { x: p.x + Math.cos(angle) * radius, y: p.y + Math.sin(angle) * radius, angle: (hold ? SKIN_TRANSFORM.touchHoldPetalDegrees[i] : SKIN_TRANSFORM.touchPetalDegrees[i]) * DEG, alpha, order: n.id * 4 + 3 });
        }
        const point = n.isMine ? n.isBreak ? 'touch_break_point_mine' : 'touch_point_mine' : n.isBreak ? 'touch_break_point' : n.isEach ? 'touch_point_each' : 'touch_point';
        emit(n, `TouchSkins/${point}.png`, 5, { ...p, alpha, order: n.id * 4 + 2 });
        if (!hold && timing > -0.02) emit(n, 'TouchSkins/touch_just.png', 5, { ...p, order: n.id * 4 + 1 });
        if (!hold) {
          const overlaps = touchOverlaps.get(n.position) ?? [];
          if (overlaps[0] === n && overlaps.length > 1) {
            const count = Math.min(3, overlaps.length);
            const path = n.isMine ? `touch${n.isBreak ? '_break' : ''}_mine_border_${count}` : n.isBreak ? `touch_break_border_${count}` : `touch_border_${count}${n.isEach ? '_each' : ''}`;
            emit(n, `TouchSkins/${path}.png`, 5, { ...p, alpha, order: n.id * 4 });
          }
        }
      }
    } else if (!touch && alive && !(n.type === 'slide' && n.isHeadless)) {
      const raw = elapsed(n) * tapSpeed * n.hiSpeed + 4.8, scale = Math.min(raw * 0.4 + 0.51, 1), distance = Math.max(raw, 1.225);
      if (scale <= 0) continue;
      const keyAngle = (22.5 - 45 * Number(n.position)) * DEG;
      const star = n.type === 'slide' ? !n.isTapHead : 'isStar' in n && n.isStar;
      if (scale > 0.3) emit(n, guide(n, star), 0, { angle: keyAngle, scale: hold ? Math.min(distance / 4.8, 1) : distance / 4.8 });
      if (hold) {
        const tail = elapsed(n, true) * tapSpeed * n.hiSpeed + 4.8;
        const headClamped = Math.min(distance, 4.8), tailClamped = clamp(tail, 1.225, 4.8);
        const barLength = raw < 1.225 ? 0 : Math.max(headClamped - tailClamped, 0);
        const middle = raw < 1.225 ? 1.225 : (headClamped + tailClamped) / 2;
        emit(n, `HoldSkins/hold${variant(n)}${age >= 0 ? '_on' : ''}.png`, 3, { ...buttonPoint(Number(n.position), middle), angle: keyAngle, scale, stretch: barLength - 0.58, exPath: n.isEx && config.highlightExNotes ? 'HoldSkins/hold_ex.png' : undefined, tint: tint(n), brightness: n.isBreak ? breakPulseBrightness(now) : 1 });
        if (raw >= 1.225 && tail >= 1.225) emit(n, `NoteGuideSkins/Hold${n.isMine ? '_Mine' : n.isBreak ? '_Break' : n.isEach ? '_Each' : ''}_End.png`, 3, { ...buttonPoint(Number(n.position), Math.min(tail, 4.8)), angle: keyAngle });
      } else {
        let angle = keyAngle, double = false;
        if (n.type === 'slide') {
          const { double: multiple, length, duration } = prepared.facts.get(n)!.slide!;
          double = multiple;
          if (config.slideRotation && duration > 0) angle -= (now - n.timingMs) / 1000 * Math.PI * Math.min(6, length / (duration * 2 * Math.PI));
        } else if ('isSpinningStar' in n && n.isSpinningStar) angle += (now - n.timingMs) / 1000 * Math.PI * 3;
        const path = star ? `StarSkins/star${double ? n.isMine ? n.isBreak ? '_break_double_mine' : '_double_mine' : n.isBreak ? '_break_double' : n.isEach ? '_each_double' : '_double' : variant(n)}.png` : `TapSkins/tap${variant(n)}.png`;
        emit(n, path, 3, { ...buttonPoint(Number(n.position), distance), angle, scale, exPath: n.isEx && config.highlightExNotes ? star ? `StarSkins/star_ex${double ? '_double' : ''}.png` : 'TapSkins/tap_ex.png' : undefined, tint: tint(n, star), brightness: n.isBreak ? breakPulseBrightness(now) : 1 });
      }
    }
    const hitAge = now - (hold ? n.endTimeMs : n.timingMs);
    const hitPosition = prepared.facts.get(n)!.point;
    if (!n.isMine && !(n.type === 'slide' && n.isHeadless)) {
      if (config.showHitEffect && latest(prepared.starts.get(n.position)) === n && age >= 0 && age < (touch ? 317 : 889)) emit(n, '', 6, { ...hitPosition, angle: touch ? 0 : (22.5 - 45 * Number(n.position)) * DEG, effect: { kind: touch ? 'touch' : 'tap', ageMs: age, isBreak: n.isBreak } });
      if (config.showHitEffect && hold && age >= 0 && endAge < 300) {
        const lastEmission = Math.min(Math.floor(age / 100), Math.floor((n.endTimeMs - n.timingMs) / 100));
        for (let i = Math.max(0, lastEmission - 2); i <= lastEmission; i++) {
          const particleAge = age - i * 100;
          if (particleAge < 300) emit(n, '', 6, { ...hitPosition, effect: { kind: 'hold', ageMs: particleAge, isBreak: n.isBreak } });
        }
      }
      if (config.showFireworks && firework === n && hitAge >= 0 && hitAge < 1334) emit(n, '', 7, { ...hitPosition, effect: { kind: 'firework', ageMs: hitAge, isBreak: n.isBreak } });
    }
    if (hitAge >= 0 && hitAge < 450 && latest(prepared.finishes.get(n.position)) === n && !n.isMine && !(n.type === 'slide' && n.isHeadless)) {
      const index = typeof n.position === 'number' ? n.position : Number(n.position[1] ?? 0);
      const angle = String(n.position).startsWith('C') ? 0 : (22.5 - 45 * index) * DEG;
      const p = { x: hitPosition.x + Math.sin(angle), y: hitPosition.y - Math.cos(angle) };
      const kind = judgeHintTapHoldTouchText(config.judgeHint, n.isBreak);
      const clip = n.isBreak && config.judgeHint === 'distinguish' ? 'judgeBreak' : 'judge';
      const alpha = Math.max(0, effectCurve(clip, 'LevelObject/LevelText', 'm_Color.a', hitAge / 1000));
      const scale = effectCurve(clip, 'LevelObject', 'scale.x', hitAge / 1000);
      const cover = clip === 'judgeBreak' && effectCurve(clip, 'LevelObject/LevelBreakCover', 'm_Enabled', hitAge / 1000) > 0;
      if (kind) emit(n, judgeTextSkinPath(cover ? 'cPerfectBreak' : kind === 'cPerfectBreak' ? 'cPerfect' : kind), 7, { ...p, angle, alpha, scale });
    }
  }
  for (const { time, usingSV, heads } of prepared.eachGroups) {
    if (time <= now) continue;
    for (let i = 1; i < heads.length; i++) {
      const n = heads[i - 1]; if (now >= n.timingMs) continue;
      const a = Number(n.position), b = Number(heads[i].position), diff = (b - a + 8) % 8;
      const span = Math.min(diff, 8 - diff); if (!span) continue;
      const raw = (usingSV ? currentScroll - prepared.facts.get(n)!.startScroll : now - n.timingMs) / 1000 * tapSpeed * n.hiSpeed + 4.8;
      if (raw * 0.4 + 0.51 <= 0) continue;
      const start = diff < 4 ? a : b;
      emit(n, `NoteGuideSkins/EachLine${span}.png`, 1, { angle: (45 - 45 * start) * DEG, scale: Math.max(raw, 1.225) / 4.8 });
    }
  }
  return result.sort((a, b) => a.layer - b.layer || (b.stack ?? 0) - (a.stack ?? 0) || b.time - a.time || b.order - a.order);
}
function emitSlideOk(n: Note, g: Geometry, isBreak: boolean, age: number, config: RendererConfig, emit: (n: Note, path: string, layer: number, options: Partial<DrawCommand>) => void) {
  const names = ['str_l', 'str_r', 'curv_l', 'curv_r', 'wifi_u', 'wifi_d'];
  const flash = isBreak && config.judgeHint === 'distinguish' && Math.floor(age / (1000 / 60) / 2) % 2 === 0;
  const alpha = age < 1000 / 30 ? age / (1000 / 30) : 1 - clamp((age - 17000 / 60) / (8000 / 60));
  emit(n, `SlideOKSkins/just_${names[g.okType]}${config.judgeHint === 'unified' ? '_p' : flash ? '_break' : ''}.png`, 7, { ...g.ok, alpha });
}
