/** MajdataViewX NoteDatas / Updaters / shaders, adapted to deterministic Canvas commands.
 * GPL-3.0; see THIRD_PARTY_NOTICES.md. Real time controls lifetimes; SV affects poses only. */
import type { Chart, Note, RendererConfig, SlideBranch } from '../types';
import { ScrollTimeline } from '../core/timing/ScrollTimeline';
import { buttonPoint, pathPose, prepareBranch, joinGeometries, consumedArrows, type Geometry } from '../core/geometry/slidePath';
import { arcadeTapTravelSpeed, arcadeTouchDurations, breakPulseBrightness } from '../utils/arcadeMotion';
import { judgeTextSkinPath, judgeHintTapHoldTouchText } from '../utils/judgeHint';
import { effectCurve } from './effects';
import { SKIN_TRANSFORM } from './skinSemantics';

export type DrawCommand = {
  path: string; x: number; y: number; angle: number; scale: number; alpha: number; layer: number; time: number; order: number;
  stretch?: number; exPath?: string; tint?: string; cutoff?: number; brightness?: number;
  recolor?: string; stack?: number; effect?: { kind: 'tap' | 'touch' | 'hold' | 'firework'; ageMs: number; isBreak: boolean; color?: string };
};
export type PreparedChart = {
  chart: Chart; scroll: ScrollTimeline; branches: Map<SlideBranch, ReturnType<typeof prepareBranch>>; paths: Map<SlideBranch, Geometry>; groups: Map<number, Note[]>;
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
  return { chart, scroll: new ScrollTimeline(chart.scrollEvents), branches, paths, groups, judgements };
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
const tint = (n: { isMine: boolean; isBreak: boolean; isEach: boolean }, star = false) => n.isMine ? '#272727' : n.isBreak ? '#ffbe50' : n.isEach ? '#fff55d' : star ? '#00ccff' : '#ffb7e8';
const guide = (n: Note, star: boolean) => `NoteGuideSkins/${n.isMine ? 'Mine' : n.isBreak ? 'Break' : n.isEach ? 'Each' : star ? 'Slide' : 'Normal'}.png`;

export function buildFrame(prepared: PreparedChart, now: number, config: RendererConfig): DrawCommand[] {
  const result: DrawCommand[] = [], { chart, scroll } = prepared;
  const tapSpeed = arcadeTapTravelSpeed(config.hiSpeed) / (config.alwaysKeepHiSpeed ? config.playbackSpeed : 1);
  const elapsed = (n: Note, end = false) => ((n.usingSV ? scroll.at(now) - scroll.at(end ? n.endTimeMs : n.timingMs) : now - (end ? n.endTimeMs : n.timingMs)) / 1000);
  const starts = new Map<string | number, { note: Note; time: number }>(), finishes = new Map<string | number, { note: Note; time: number }>();
  const touchOverlaps = new Map<string | number, Note[]>();
  let firework: Note | undefined, fireworkTime = -Infinity;
  for (const n of chart.notes) {
    if (n.type === 'touch' && n.timingMs >= now && -elapsed(n) < arcadeTouchDurations(config.hiSpeed * n.hiSpeed / (config.alwaysKeepHiSpeed ? config.playbackSpeed : 1)).wholeDuration) {
      const notes = touchOverlaps.get(n.position) ?? []; notes.push(n); touchOverlaps.set(n.position, notes);
    }
    if (n.isMine || (n.type === 'slide' && n.isHeadless)) continue;
    const finish = n.type === 'slide' ? n.timingMs : n.endTimeMs;
    if (n.timingMs <= now && n.timingMs >= (starts.get(n.position)?.time ?? -Infinity)) starts.set(n.position, { note: n, time: n.timingMs });
    if (finish <= now && finish >= (finishes.get(n.position)?.time ?? -Infinity)) finishes.set(n.position, { note: n, time: finish });
    if ('hasFirework' in n && n.hasFirework && finish <= now && finish >= fireworkTime) { firework = n; fireworkTime = finish; }
  }
  const emit = (n: Note, path: string, layer: number, values: Partial<DrawCommand> = {}) => {
    const command: DrawCommand = { path, layer, x: 0, y: 0, angle: 0, scale: 1, alpha: 1, time: n.timingMs, order: n.id, ...values };
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
      const timing = elapsed(n), p = touchPoint(String(n.position));
      const speed = config.hiSpeed * n.hiSpeed / (config.alwaysKeepHiSpeed ? config.playbackSpeed : 1);
      const durations = arcadeTouchDurations(speed), { wholeDuration, moveDuration, displayDuration } = durations;
      if (-timing <= wholeDuration) {
        const alpha = -timing > moveDuration ? clamp(1 - (-timing - moveDuration) / displayDuration) : 1;
        const fanDist = clamp(-Math.exp(8 * timing * 0.43 / moveDuration - 0.85) + 0.42, 0, 0.4);
        const radius = 0.226 + fanDist;
        if (hold) {
          const border = n.isMine ? 'TouchHoldSkins/touchhold_mine_border.png' : `TouchHoldSkins/touchhold${n.isBreak ? '_break' : ''}_border.png`;
          const duration = n.usingSV ? (scroll.at(n.endTimeMs) - scroll.at(n.timingMs)) / 1000 : (n.endTimeMs - n.timingMs) / 1000;
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
          const sameHeads = prepared.groups.get(n.group)!.filter(other => other.type === 'slide' && other.position === n.position);
          const sameBranches = sameHeads.flatMap(other => other.type === 'slide' ? other.branches : []);
          double = sameBranches.length > 1;
          const length = sameBranches.reduce((sum, b) => sum + prepared.branches.get(b)!.reduce((l, p) => l + p.geometry.length, 0), 0);
          const duration = sameBranches.reduce((sum, b) => sum + b.durationMs / 1000, 0);
          if (config.slideRotation && duration > 0) angle -= (now - n.timingMs) / 1000 * Math.PI * Math.min(6, length / (duration * 2 * Math.PI));
        } else if ('isSpinningStar' in n && n.isSpinningStar) angle += (now - n.timingMs) / 1000 * Math.PI * 3;
        let path = star ? `StarSkins/star${double ? n.isMine ? n.isBreak ? '_break_double_mine' : '_double_mine' : n.isBreak ? '_break_double' : n.isEach ? '_each_double' : '_double' : variant(n)}.png` : `TapSkins/tap${variant(n)}.png`;
        if (star && config.pinkSlideStart && !n.isMine && !n.isBreak && !n.isEach) path = 'StarSkins/star.png';
        emit(n, path, 3, { ...buttonPoint(Number(n.position), distance), angle, scale, recolor: star && config.pinkSlideStart && !n.isMine && !n.isBreak && !n.isEach ? '#ffb7e8' : undefined, exPath: n.isEx && config.highlightExNotes ? star ? `StarSkins/star_ex${double ? '_double' : ''}.png` : 'TapSkins/tap_ex.png' : undefined, tint: tint(n, star), brightness: n.isBreak ? breakPulseBrightness(now) : 1 });
      }
    }
    const hitAge = now - (hold ? n.endTimeMs : n.timingMs);
    const hitPosition = touch ? touchPoint(String(n.position)) : buttonPoint(Number(n.position));
    if (!n.isMine && !(n.type === 'slide' && n.isHeadless)) {
      if (config.showHitEffect && starts.get(n.position)?.note === n && age >= 0 && age < (touch ? 317 : 889)) emit(n, '', 6, { ...hitPosition, angle: touch ? 0 : (22.5 - 45 * Number(n.position)) * DEG, effect: { kind: touch ? 'touch' : 'tap', ageMs: age, isBreak: n.isBreak } });
      if (config.showHitEffect && hold && age >= 0 && endAge < 300) {
        const lastEmission = Math.min(Math.floor(age / 100), Math.floor((n.endTimeMs - n.timingMs) / 100));
        for (let i = Math.max(0, lastEmission - 2); i <= lastEmission; i++) {
          const particleAge = age - i * 100;
          if (particleAge < 300) emit(n, '', 6, { ...hitPosition, effect: { kind: 'hold', ageMs: particleAge, isBreak: n.isBreak, color: tint(n) } });
        }
      }
      if (config.showFireworks && firework === n && hitAge >= 0 && hitAge < 1334) emit(n, '', 7, { ...hitPosition, effect: { kind: 'firework', ageMs: hitAge, isBreak: n.isBreak } });
    }
    if (hitAge >= 0 && hitAge < 450 && finishes.get(n.position)?.note === n && !n.isMine && !(n.type === 'slide' && n.isHeadless)) {
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
  for (const group of prepared.groups.values()) {
    if (group[0].timingMs <= now) continue;
    const usingSV = group.some(n => !n.isMine && n.usingSV && (n.type === 'tap' || n.type === 'break' || n.type === 'hold-start'));
    const heads = group.filter(n => !n.isMine && typeof n.position === 'number' && !(n.type === 'slide' && n.isHeadless));
    for (let i = 1; i < heads.length; i++) {
      const n = heads[i - 1]; if (now >= n.timingMs) continue;
      const a = Number(n.position), b = Number(heads[i].position), diff = (b - a + 8) % 8;
      const span = Math.min(diff, 8 - diff); if (!span) continue;
      const raw = (usingSV ? scroll.at(now) - scroll.at(n.timingMs) : now - n.timingMs) / 1000 * tapSpeed * n.hiSpeed + 4.8;
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
  emit(n, `SlideOKSkins/just_${names[g.okType]}${flash ? '_break' : ''}.png`, 7, { ...g.ok, alpha });
}
