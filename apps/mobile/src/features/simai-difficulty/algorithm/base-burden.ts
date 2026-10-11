/** DXTag cbea1ff20d69c3eaa163c7d967b708bd076e5d96 (MIT), Copyright (c) 2026 尘言.
 * https://github.com/kckc7887/DXTag — see THIRD_PARTY_NOTICES.md.
 */
import { buttonPoint, touchPoint, geometryFor, pathPose, prepareBranch, type Geometry } from '../simai/core/geometry/slidePath';
import type { Chart, Note, SlideNote } from '../simai/types';
import { TimingTimeline } from '../simai/core/timing/TimingTimeline';
import { inferRhythmUnit, relativeRhythmNear } from './base-rhythm';
import { slideLaunchHandover } from './analysis-slide-handover';
import { repeatedLaunchTapCandidate } from './analysis-launch-tap-candidate';
import { slideActionGroupsCandidate } from './analysis-slide-action-groups-candidate';
import { localMotionRhythm, motionRhythmKey } from './analysis-local-motion-rhythm';
import { dottedBeatGapFlags } from './analysis-keyboard-rhythm';
import { doubleSweepSlideContext } from './analysis-double-sweep-slide-context';
import type { SlideEvent } from './types';
const CONTACT_POLICY = { version: 'contact-v2', earlyContactMs: 180, minimumLeadMs: 12, sampleMs: 35 } as const;
const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 8 - Math.abs(a - b));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const percentile = (values: number[], q: number) => values.length ? values[Math.min(values.length - 1, Math.floor(q * (values.length - 1)))]! : 0;
const angleDifference = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const isButton = (n: Note): n is Note & {
    position: number;
} => typeof n.position === 'number' && (n.type !== 'slide' || !n.isHeadless);
function pointOf(n: Note): {
    x: number;
    y: number;
} | null {
    if (typeof n.position === 'number')
        return buttonPoint(n.position);
    return /^(?:C[12]?|[ABDE][1-8])$/.test(n.position) ? touchPoint(n.position) : null;
}
function zoneOf(n: Note): number | null {
    if (typeof n.position === 'number')
        return n.position - 1;
    if (n.position === 'C' || n.position === 'C1' || n.position === 'C2')
        return 16;
    const match = /^([ABDE])([1-8])$/.exec(n.position);
    if (!match)
        return null;
    return Number(match[2]) - 1 + ({ A: 0, B: 8, D: 17, E: 25 }[match[1] as 'A' | 'B' | 'D' | 'E']);
}
function* windowCounts(shouldYield: () => boolean, notes: Note[], width: number, step: number): Generator<void, {
    start: number;
    end: number;
    count: number;
}[], void> {
    const result: {
        start: number;
        end: number;
        count: number;
    }[] = [];
    if (!notes.length)
        return result;
    let left = 0, right = 0;
    for (let start = notes[0]!.timingMs; start <= notes.at(-1)!.timingMs; start += step) { if (shouldYield()) yield;
        while (left < notes.length && notes[left]!.timingMs < start)
            { if (shouldYield()) yield; left++; }
        while (right < notes.length && notes[right]!.timingMs < start + width)
            { if (shouldYield()) yield; right++; }
        result.push({ start, end: start + width, count: right - left });
    }
    return result;
}
export function* baseBurden(shouldYield: () => boolean, chart: Chart): Generator<void, {
    features: Record<string, number>;
    slideEvents: SlideEvent[];
}, void> {
    const notes = [...chart.notes].filter(n => !n.isMine).sort((a, b) => a.timingMs - b.timingMs || a.id - b.id);
    if (!notes.length)
        throw new Error('Empty chart');
    const timeline = TimingTimeline.fromChart(chart);
    const scoreBeat = (ms: number) => timeline.scoreBeatFromChartMs(ms);
    const rhythmUnit = inferRhythmUnit(notes);
    const buttons = notes.filter(isButton);
    const keyboardNotes = buttons.filter(note => note.type !== 'slide');
    const slides = notes.filter((n): n is SlideNote => n.type === 'slide');
    const duration = Math.max(1, (Math.max(...notes.map(n => n.endTimeMs)) - notes[0]!.timingMs) / 1000);
    const timelineOffset = timeline.msFromBeat(4) - chart.firstMs;
    const audioTime = (chartMs: number) => chartMs - timelineOffset;
    const two = (yield* windowCounts(shouldYield, buttons, 2000, 500)), four = (yield* windowCounts(shouldYield, buttons, 4000, 1000));
    const sixteen = (yield* windowCounts(shouldYield, buttons, 16000, 4000)), thirtyTwo = (yield* windowCounts(shouldYield, buttons, 32000, 8000));
    let jacks = 0, wideMoves = 0, alternating = 0, sweeps = 0, rhythmChanges = 0, holdConflicts = 0;
    let holdHandSequences = 0, dottedMovePatterns = 0;
    let dottedSpatialEvents = 0, chordRepositions = 0;
    let dottedChordQualified8s = 0;
    let holdOneHandBurden = 0;
    for (let i = 1; i < keyboardNotes.length; i++) { if (shouldYield()) yield;
        const a = keyboardNotes[i - 1]!, b = keyboardNotes[i]!;
        const dt = b.timingMs - a.timingMs;
        if (dt > 0 && 1000 / dt >= 3 && a.position === b.position) {
            jacks++;
        }
        if (dt > 0 && dt <= rhythmUnit * 2.1 && distance(Number(a.position), Number(b.position)) >= 3)
            wideMoves++;
        if (i >= 5 && dt > 0) {
            const group = keyboardNotes.slice(i - 5, i + 1);
            if (5 / Math.max(.001, (group[5]!.timingMs - group[0]!.timingMs) / 1000) >= 3 && group.slice(1).every((n, j) => n.timingMs > group[j]!.timingMs) && group[0]!.position !== group[1]!.position && group.every((n, k) => n.position === group[k % 2]!.position)) {
                alternating++;
            }
        }
        if (i >= 2 && dt > 0) {
            const prior = a.timingMs - keyboardNotes[i - 2]!.timingMs;
            if (prior > 0 && Math.max(dt, prior) / Math.min(dt, prior) >= 1.75 && Math.max(dt, prior) <= rhythmUnit * 4.1)
                rhythmChanges++;
        }
    }
    for (let i = 3; i < keyboardNotes.length; i++) { if (shouldYield()) yield;
        const group = keyboardNotes.slice(i - 3, i + 1);
        if (3 / Math.max(.001, (group[3]!.timingMs - group[0]!.timingMs) / 1000) < 4)
            continue;
        const dir = (Number(group[1]!.position) - Number(group[0]!.position) + 8) % 8;
        if ((dir === 1 || dir === 7) && group.slice(1).every((n, j) => (Number(n.position) - Number(group[j]!.position) + 8) % 8 === dir)) {
            sweeps++;
        }
    }
    for (let i = 3; i < keyboardNotes.length; i++) { if (shouldYield()) yield;
        const group = keyboardNotes.slice(i - 3, i + 1);
        const gaps = group.slice(1).map((note, j) => note.timingMs - group[j]!.timingMs);
        if (gaps.some(gap => gap <= 0) || Math.max(...gaps) / Math.min(...gaps) > 1.3)
            continue;
        if (group[0]!.position !== group[2]!.position || group[1]!.position !== group[3]!.position || group[0]!.position === group[1]!.position)
            continue;
        const rate = 3000 / (group[3]!.timingMs - group[0]!.timingMs);
        if (rate < 5.5)
            continue;
        alternating++;
    }
    const onsets: {
        time: number;
        notes: typeof buttons;
    }[] = [];
    for (const note of buttons.filter(n => n.type !== 'slide')) { if (shouldYield()) yield;
        const last = onsets.at(-1);
        if (last && (last.notes[0]!.group === note.group || Math.abs(last.time - note.timingMs) < 1e-6))
            last.notes.push(note);
        else
            onsets.push({ time: note.timingMs, notes: [note] });
    }
    // Local long/short ratios include dotted rhythms without claiming that a
    // ratio proves a literal note spelling (a triplet ending can share one).
    // Legacy dotted_* field names remain stable. Repeated spatial/chord work is
    // what qualifies the sustained combination, not an isolated gap ratio.
    const dottedChordEvents: {
        time: number;
        dotted: boolean;
        chordShift: boolean;
        noteIds: string;
    }[] = [];
    const onsetBeatGaps = onsets.slice(1).map((onset, i) => scoreBeat(onset.time) - scoreBeat(onsets[i]!.time));
    const dottedOnsetGaps = dottedBeatGapFlags(onsetBeatGaps);
    for (let i = 1; i < onsets.length; i++) { if (shouldYield()) yield;
        const prior = onsets[i - 1]!, current = onsets[i]!;
        const gapBeats = onsetBeatGaps[i - 1]!;
        const localGaps = onsetBeatGaps.slice(Math.max(0, i - 2), i + 1).filter(gap => gap > 1e-6);
        const localPulse = Math.min(...localGaps);
        const before = prior.notes.map(note => Number(note.position));
        const after = current.notes.map(note => Number(note.position));
        const minimumMove = Math.min(...before.flatMap(a => after.map(b => distance(a, b))));
        const dotted = dottedOnsetGaps[i - 1]! && minimumMove >= 2;
        let chordCost = Infinity;
        if (before.length >= 2 && after.length >= 2 && gapBeats <= localPulse * 4.1) {
            for (let a = 0; a < before.length; a++)
                { if (shouldYield()) yield; for (let b = a + 1; b < before.length; b++) { if (shouldYield()) yield;
                    for (let c = 0; c < after.length; c++)
                        { if (shouldYield()) yield; for (let d = c + 1; d < after.length; d++) { if (shouldYield()) yield;
                            chordCost = Math.min(chordCost, distance(before[a]!, after[c]!) + distance(before[b]!, after[d]!), distance(before[a]!, after[d]!) + distance(before[b]!, after[c]!));
                        } }
                } }
        }
        const chordShift = chordCost >= 3 && Number.isFinite(chordCost);
        if (!dotted && !chordShift)
            continue;
        if (dotted)
            dottedSpatialEvents++;
        if (chordShift)
            chordRepositions++;
        dottedChordEvents.push({ time: current.time, dotted, chordShift,
            noteIds: [...prior.notes, ...current.notes].map(note => note.id).join(',') });
    }
    const dottedChordWindows: {
        start: number;
        end: number;
    }[] = [];
    for (let start = onsets[0]?.time ?? 0; start <= (onsets.at(-1)?.time ?? 0); start += 2000) { if (shouldYield()) yield;
        const matching = dottedChordEvents.filter(event => event.time >= start && event.time < start + 8000);
        const dotted = matching.filter(event => event.dotted).length;
        const chords = matching.filter(event => event.chordShift).length;
        if (dotted >= 2 && chords >= 2)
            dottedChordWindows.push({ start, end: start + 8000 });
    }
    dottedChordQualified8s = dottedChordWindows.length;
    for (let i = 3; i < onsets.length; i++) { if (shouldYield()) yield;
        const group = onsets.slice(i - 3, i + 1);
        const gapsBeats = group.slice(1).map((onset, j) => scoreBeat(onset.time) - scoreBeat(group[j]!.time));
        // Keep an unrelated long rest out of a four-onset rhythm relation. This
        // uses this group's subdivision, never a smaller pulse elsewhere in song.
        if (!dottedBeatGapFlags(gapsBeats).some(Boolean) || gapsBeats.some(gap => gap <= 1e-6) || Math.max(...gapsBeats) > Math.min(...gapsBeats) * 4.1)
            continue;
        let shifts = 0;
        for (let j = 1; j < group.length; j++) { if (shouldYield()) yield;
            if (group[j]!.notes.some(n => group[j - 1]!.notes.every(prior => distance(Number(n.position), Number(prior.position)) >= 2)))
                shifts++;
        }
        if (shifts < 2)
            continue;
        dottedMovePatterns++;
    }
    const holds = notes.filter(n => n.type === 'hold-start' || n.type === 'touch-hold-start');
    for (const h of holds) { if (shouldYield()) yield;
        const heldPoint = pointOf(h);
        if (!heldPoint || h.endTimeMs <= h.timingMs)
            continue;
        const inside = buttons.filter(n => n.id !== h.id && n.timingMs > h.timingMs + 1e-6 && n.timingMs < h.endTimeMs - 1e-6);
        let changes = 0, constrained = 0;
        for (let i = 0; i < inside.length; i++) { if (shouldYield()) yield;
            const p = pointOf(inside[i]!);
            if (p && Math.hypot(p.x - heldPoint.x, p.y - heldPoint.y) <= 4.1)
                constrained++;
            if (i && inside[i]!.timingMs - inside[i - 1]!.timingMs <= rhythmUnit * 4.1 &&
                distance(Number(inside[i]!.position), Number(inside[i - 1]!.position)) >= 2)
                changes++;
        }
        const positionalSequence = inside.length >= 3 && changes >= 1 && constrained >= 1;
        // The head TAP is a keyboard action even when its later movement also creates Slide burden.
        const accompaniment = inside;
        const runs: typeof accompaniment[] = [];
        for (const note of accompaniment) { if (shouldYield()) yield;
            const run = runs.at(-1);
            if (run && note.timingMs - run.at(-1)!.timingMs <= rhythmUnit * 4.1)
                run.push(note);
            else
                runs.push([note]);
        }
        let busy = false;
        for (const run of runs) { if (shouldYield()) yield;
            if (run.length < 4)
                continue;
            // The occupied-hand phrase can use eighths even when unrelated earlier
            // triplets determine the chart's smallest pulse. Its internal IOI pattern
            // determines adjacency; the physical action-rate requirement stays real.
            const runPulse = inferRhythmUnit(run);
            let fast = 0, adjacent = 0, moved = 0;
            for (let i = 1; i < run.length; i++) { if (shouldYield()) yield;
                const prior = run[i - 1]!, note = run[i]!;
                if (note.timingMs - prior.timingMs > runPulse * 2.1 || 1000 / (note.timingMs - prior.timingMs) < 3)
                    continue;
                fast++;
                const d = distance(Number(note.position), Number(prior.position));
                if (d === 1)
                    adjacent++;
                else if (d !== 0)
                    moved++;
            }
            if (fast < 3)
                continue;
            busy = true;
            const burden = run.length + 1.25 * fast + .75 * (adjacent + moved);
            holdOneHandBurden += burden;
        }
        if (positionalSequence || busy) {
            holdConflicts += inside.length;
            holdHandSequences++;
        }
    }
    type Zone = {
        area: number;
        enterMs: number;
        exitMs: number;
        lane: 'center' | 'left' | 'right';
        alternative: boolean;
    };
    type Turn = {
        atMs: number;
        position: number;
        angleDeg: number;
        kind: 'join' | 'V';
    };
    type Motion = {
        slide: SlideNote;
        branchIndex: number;
        start: number;
        end: number;
        speed: number;
        length: number;
        pieces: ReturnType<typeof prepareBranch>;
        sidePaths: {
            lane: 'left' | 'right';
            geometry: Geometry;
        }[];
        turns: Turn[];
        zones: Zone[];
    };
    const poseAt = (motion: Motion, timeMs: number, lane: Zone['lane'] = 'center') => {
        if (lane !== 'center') {
            const side = motion.sidePaths.find(path => path.lane === lane);
            if (side)
                return pathPose(side.geometry, clamp((timeMs - motion.start) / Math.max(1, motion.end - motion.start), 0, 1));
        }
        const localMs = clamp(timeMs, motion.start, motion.end) - motion.slide.timingMs;
        const piece = motion.pieces.find(part => localMs >= part.startMs && localMs <= part.startMs + part.durationMs)
            ?? motion.pieces.at(-1)!;
        return pathPose(piece.geometry, clamp((localMs - piece.startMs) / Math.max(1, piece.durationMs), 0, 1));
    };
    const motions: Motion[] = [];
    const slideEvents: SlideEvent[] = [];
    let slideBurstBurden = 0, slideStaminaBurden = 0, slideTechniqueBurden = 0;
    for (const slide of slides) { if (shouldYield()) yield;
        for (const [branchIndex, branch] of slide.branches.entries()) { if (shouldYield()) yield;
            let pieces: ReturnType<typeof prepareBranch>;
            try {
                pieces = prepareBranch(branch);
            }
            catch {
                continue;
            }
            const length = pieces.reduce((sum, part) => sum + part.geometry.length, 0);
            const speed = length / Math.max(.001, branch.durationMs / 1000);
            const turns: Turn[] = [];
            for (let i = 1; i < pieces.length; i++) { if (shouldYield()) yield;
                const before = pathPose(pieces[i - 1]!.geometry, .95).angle;
                const after = pathPose(pieces[i]!.geometry, .05).angle;
                const angle = angleDifference(after, before);
                if (angle > .75)
                    turns.push({ atMs: slide.timingMs + pieces[i]!.startMs,
                        position: branch.segments[i - 1]!.endPos, angleDeg: Math.round(angle * 180 / Math.PI), kind: 'join' });
            }
            for (let i = 0; i < pieces.length; i++) { if (shouldYield()) yield;
                const segment = branch.segments[i]!;
                const piece = pieces[i]!;
                if (segment.type !== 'V' || segment.midPos === undefined)
                    continue;
                const waypoint = buttonPoint(segment.midPos);
                const arrows = piece.geometry.arrows;
                let index = 1, nearest = Number.POSITIVE_INFINITY;
                for (let j = 1; j < arrows.length - 1; j++) { if (shouldYield()) yield;
                    const d = Math.hypot(arrows[j]!.x - waypoint.x, arrows[j]!.y - waypoint.y);
                    if (d < nearest) {
                        nearest = d;
                        index = j;
                    }
                }
                const progress = arrows[index]!.length / Math.max(.001, piece.geometry.length);
                const angle = angleDifference(pathPose(piece.geometry, Math.max(0, progress - .07)).angle, pathPose(piece.geometry, Math.min(1, progress + .07)).angle);
                turns.push({ atMs: slide.timingMs + piece.startMs + progress * piece.durationMs,
                    position: segment.midPos, angleDeg: Math.round(angle * 180 / Math.PI), kind: 'V' });
            }
            const pathZones = (geometry: Geometry, startMs: number, durationMs: number, lane: Zone['lane']): Zone[] => geometry.areas.flatMap(area => {
                const arrows = geometry.arrows;
                const enter = arrows[Math.min(arrows.length - 1, Math.max(0, area[0]))]!.length / Math.max(.001, geometry.length);
                const exit = arrows[Math.min(arrows.length - 1, Math.max(0, area[1]))]!.length / Math.max(.001, geometry.length);
                const firstMs = startMs + Math.min(enter, exit) * durationMs;
                const lastMs = startMs + Math.max(enter, exit) * durationMs;
                return [area[2], area[3]].flatMap((sensor, index) => sensor >= 0 ?
                    [{ area: sensor, enterMs: firstMs, exitMs: lastMs, lane, alternative: index === 1 }] : []);
            });
            const zones = pieces.flatMap(piece => pathZones(piece.geometry, slide.timingMs + piece.startMs, piece.durationMs, 'center'));
            const sidePaths: Motion['sidePaths'] = [];
            if (pieces.some(piece => piece.geometry.wifi)) {
                const endpoint = branch.segments.at(-1)!.endPos;
                const arrive = slide.timingMs + branch.delayMs + branch.durationMs;
                for (const [lane, sidePosition, dPosition] of [
                    ['left', ((endpoint + 6) % 8) + 1, endpoint],
                    ['right', (endpoint % 8) + 1, (endpoint % 8) + 1],
                ] as const) { if (shouldYield()) yield;
                    const side = geometryFor({ type: '-', startPos: slide.position,
                        endPos: sidePosition as typeof slide.position, code: `${slide.position}-${sidePosition}`, durationMs: branch.durationMs });
                    sidePaths.push({ lane, geometry: side });
                    zones.push(...pathZones(side, slide.timingMs + branch.delayMs, branch.durationMs, lane));
                    zones.push({ area: 17 + dPosition - 1, enterMs: arrive - Math.min(160, branch.durationMs * .25),
                        exitMs: arrive, lane, alternative: true });
                }
            }
            motions.push({ slide, branchIndex, start: slide.timingMs + branch.delayMs,
                end: slide.timingMs + branch.delayMs + branch.durationMs, speed, length, pieces, sidePaths, turns, zones });
            slideEvents.push({ slideId: slide.id, branchIndex, headMs: audioTime(slide.timingMs), waitMs: branch.delayMs,
                startMs: audioTime(slide.timingMs + branch.delayMs), endMs: audioTime(slide.timingMs + branch.delayMs + branch.durationMs),
                headBeat: scoreBeat(slide.timingMs), startBeat: scoreBeat(slide.timingMs + branch.delayMs),
                endBeat: scoreBeat(slide.timingMs + branch.delayMs + branch.durationMs),
                declaredWaitBeats: branch.waitSpec?.mode === 'default-beat' ? 1 : branch.delayMs * slide.bpm / 60000,
                headPosition: slide.position, headless: slide.isHeadless,
                segments: pieces.map((piece, i) => ({ code: branch.segments[i]!.code,
                    startMs: audioTime(slide.timingMs + piece.startMs), endMs: audioTime(slide.timingMs + piece.startMs + piece.durationMs),
                    length: piece.geometry.length })) });
        }
    }
    motions.sort((a, b) => a.start - b.start);
    const localRhythms = (yield* localMotionRhythm(shouldYield, slideEvents));
    const pulseOf = (motion: Motion) => localRhythms.get(motionRhythmKey(motion.slide.id, motion.branchIndex))!;
    const handoffs: {
        first: Motion;
        next: Motion;
        gapMs: number;
    }[] = [];
    for (let i = 1; i < motions.length; i++) { if (shouldYield()) yield;
        const previous = motions[i - 1]!, motion = motions[i]!;
        const gapMs = motion.start - previous.end;
        const previousEnd = previous.slide.branches[previous.branchIndex]!.segments.at(-1)!.endPos;
        if (previous.slide.id !== motion.slide.id && previousEnd === motion.slide.position && gapMs >= -Math.min(previous.end - previous.start, motion.end - motion.start) * .25 && gapMs <= Math.max(pulseOf(previous), pulseOf(motion))) {
            handoffs.push({ first: previous, next: motion, gapMs });
        }
    }
    // Independent actions are connected by their waiting/movement phase, never by a
    // minimum overlap in milliseconds. Physical speed contributes to strength below.
    const actionGroups = (yield* slideActionGroupsCandidate(shouldYield, chart, slideEvents));
    const representativeBranches = new Set(actionGroups.groups.flatMap(group => group.actions.map(action => action.representative)));
    const actionCountByHead = new Map(actionGroups.groups.map(group => [group.slideId, group.effectiveActionCount]));
    // Keep all scored branches/events. Only independent motion candidates enter
    // burst topology; a complete same-speed prefix is not another moving hand.
    // Unsupported/fan routes remain conservative singletons.
    const burstMotions = motions.filter(m => representativeBranches.has(`${m.slide.id}:${m.branchIndex}`));
    let lastBurstEnd = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < burstMotions.length; i++) { if (shouldYield()) yield;
        const first = burstMotions[i]!;
        if (first.start < lastBurstEnd - 1e-6)
            continue;
        const pulse = pulseOf(first);
        const close = burstMotions.slice(i).filter(m => m.start < first.start + pulse * 3 + 1e-6);
        const independent = close.filter((m, j) => close.findIndex(other => other.slide.id === m.slide.id) === j);
        const firstThree = independent.slice(0, 3);
        const overlapping = independent.filter(m => m !== first && Math.min(first.end, m.end) > Math.max(first.start, m.start) + 1e-6);
        const tightRecovery = firstThree.length === 3 && firstThree.slice(1).every((m, j) => m.start - firstThree[j]!.end <= pulse * .6);
        const rapid = firstThree.length === 3 && new Set(firstThree.map(m => m.start.toFixed(5))).size === 3 && firstThree[2]!.start - first.start <= pulse * (firstThree.reduce((sum, m) => sum + m.turns.length, 0) >= 2 ? 3 : 2) + 1e-6 && tightRecovery &&
            (3 / Math.max(.001, (firstThree[2]!.end - first.start) / 1000) >= 3 - 1e-6 || firstThree.reduce((sum, m) => sum + m.turns.length, 0) >= 2) &&
            (new Set(firstThree.map(m => m.slide.position)).size >= 2 || firstThree.reduce((sum, m) => sum + m.turns.length, 0) >= 1);
        const acceptedRapid = rapid;
        const pairs = close.flatMap((m, j) => close.slice(j + 1).filter(other => m.slide.id !== other.slide.id &&
            (distance(m.slide.position, other.slide.position) >= 2 || distance(m.slide.branches[m.branchIndex]!.segments.at(-1)!.endPos, other.slide.branches[other.branchIndex]!.segments.at(-1)!.endPos) >= 2) &&
            relativeRhythmNear(other.start - m.start, 0) && Math.min(m.end, other.end) > Math.max(m.start, other.start) + 1e-6)
            .map(other => ({ start: m.start, end: Math.min(m.end, other.end), first: m, second: other })));
        const chainedPairs = pairs.some(pair => pairs.some(next => next.start > pair.start + 1e-6 &&
            next.start - pair.start <= pulse * 2 + 1e-6 && next.start - pair.end <= pulse * 2 + 1e-6 &&
            (distance(next.first.slide.position, pair.first.slide.position) + distance(next.second.slide.position, pair.second.slide.position) >= 3)));
        const sharedHead = close.filter(m => m.slide.id === first.slide.id);
        const endpoints = sharedHead.map(m => m.slide.branches[m.branchIndex]!.segments.at(-1)!.endPos);
        const branching = (actionCountByHead.get(first.slide.id) ?? 0) >= 2 && (new Set(endpoints).size >= 3 || (sharedHead.length >= 2 &&
            endpoints.some((end, j) => endpoints.slice(j + 1).some(other => distance(end, other) >= 2)) &&
            2 / Math.max(.001, (Math.max(...sharedHead.map(m => m.end)) - first.start) / 1000) >= 6));
        // Two branches from one star head can demand two hands, but a lone split
        // with no next independent action is not itself a burst stream. Three
        // genuinely distinct routes remain a separate reviewable topology.
        const acceptedBranching = branching;
        const fastPair = pairs.some(pair => 2 / Math.max(.001, (pair.end - pair.start) / 1000) >= 6 &&
            pair.first.slide.branches[pair.first.branchIndex]!.segments.at(-1)!.endPos === pair.second.slide.position &&
            pair.second.slide.branches[pair.second.branchIndex]!.segments.at(-1)!.endPos === pair.first.slide.position);
        if (!(acceptedRapid || overlapping.length >= 2 || chainedPairs || acceptedBranching || fastPair))
            continue;
        const relevant = close.slice(0, 6), end = Math.max(...relevant.map(m => m.end));
        // Keep physical work as evidence. An unvalidated universal speed cut-off
        // dropped player-confirmed bursts while keeping a confirmed technique-only
        // counterexample, so it must not replace configuration/hand-order analysis.
        lastBurstEnd = Math.min(end, first.start + pulse);
        const actionRate = independent.length / Math.max(.001, (end - first.start) / 1000);
        slideBurstBurden += (independent.length + overlapping.length + (acceptedBranching ? sharedHead.length : 0)) * Math.sqrt(actionRate);
    }
    type Operation = {
        id: number;
        component: number;
        start: number;
        end: number;
        length: number;
        wait: number;
        pulse: number;
    };
    const motionsBySource = new Map<number, typeof motions>();
    for (const motion of motions) { if (shouldYield()) yield;
        const list = motionsBySource.get(motion.slide.id) ?? [];
        list.push(motion);
        motionsBySource.set(motion.slide.id, list);
    }
    const operations: Operation[] = [];
    for (const [id, sourceMotions] of motionsBySource) { if (shouldYield()) yield;
        const components: Operation[] = [];
        for (const motion of [...sourceMotions].sort((a, b) => a.start - b.start)) { if (shouldYield()) yield;
            const prior = components.at(-1), wait = motion.slide.branches[motion.branchIndex]!.delayMs;
            if (prior && motion.start <= prior.end + 1e-6) {
                prior.end = Math.max(prior.end, motion.end);
                prior.length = Math.max(prior.length, motion.length);
                prior.wait = Math.max(prior.wait, wait);
                prior.pulse = Math.max(prior.pulse, pulseOf(motion));
            }
            else
                components.push({ id, component: components.length, start: motion.start, end: motion.end, length: motion.length, wait, pulse: pulseOf(motion) });
        }
        operations.push(...components);
    }
    operations.sort((a, b) => a.start - b.start);
    let run: typeof operations = [], runEnd = Number.NEGATIVE_INFINITY;
    const operationGroups: (typeof operations)[] = [];
    const finishRun = function* (shouldYield: () => boolean)  {
        if (run.length)
            operationGroups.push([...run]);
        if (run.length < 4)
            return;
        let busy = 0, cursor = run[0]!.start;
        for (const motion of run)
            { if (shouldYield()) yield; if (motion.end > cursor) {
                busy += motion.end - Math.max(cursor, motion.start);
                cursor = motion.end;
            } }
        const span = runEnd - run[0]!.start, coverage = busy / Math.max(1e-6, span);
        // Four tightly occupied operations or a repeated multi-group sequence.
        const physicalWork = run.reduce((sum, m) => sum + m.length, 0);
        if (coverage < .22 || span < 3500 || (busy < 2500 && physicalWork < 40) || (run.length < 8 && coverage < .58))
            return;
        const continuousBurden = run.length * coverage * Math.sqrt(Math.max(.01, busy / 1000));
        slideStaminaBurden += continuousBurden;
    };
    for (const motion of operations) { if (shouldYield()) yield;
        const prior = run.at(-1);
        const scale = prior ? Math.max(prior.pulse, motion.pulse) : motion.pulse;
        if (prior && motion.start - runEnd > scale * 1.1 + 1e-6) {
            (yield* finishRun(shouldYield));
            run = [];
            runEnd = Number.NEGATIVE_INFINITY;
        }
        run.push(motion);
        runEnd = Math.max(runEnd, motion.end);
    }
    (yield* finishRun(shouldYield));
    // A repeated short group can have a real recovery gap and still form a long
    // stamina passage. Connect by the group's own cycle, not the last tiny slide.
    let groupRun: typeof operationGroups = [];
    const flushGroupRun = function* (shouldYield: () => boolean)  {
        if (groupRun.length < 2 || groupRun.reduce((sum, g) => sum + g.length, 0) < 8)
            return;
        const all = groupRun.flat(), start = all[0]!.start, end = Math.max(...all.map(m => m.end));
        let busy = 0, cursor = start;
        for (const op of all) { if (shouldYield()) yield;
            busy += Math.max(0, op.end - Math.max(cursor, op.start));
            cursor = Math.max(cursor, op.end);
        }
        const coverage = busy / Math.max(1e-6, end - start);
        if (coverage < .25)
            return;
        slideStaminaBurden += all.length * coverage * Math.sqrt(busy / 1000);
    };
    for (const group of operationGroups) { if (shouldYield()) yield;
        const prior = groupRun.at(-1);
        if (prior) {
            const span = Math.max(...prior.map(m => m.end)) - prior[0]!.start;
            const gap = group[0]!.start - Math.max(...prior.map(m => m.end));
            const groupScale = percentile(prior.map(op => Math.max(op.pulse, op.end - op.start)).sort((a, b) => a - b), .5);
            const comparable = group.length >= 3 && prior.length >= 3 && Math.max(group.length, prior.length) / Math.min(group.length, prior.length) <= 1.5;
            if (!comparable || gap > span * 1.5 + 1e-6 || gap > groupScale * 5 + 1e-6) {
                (yield* flushGroupRun(shouldYield));
                groupRun = [];
            }
        }
        groupRun.push(group);
    }
    (yield* flushGroupRun(shouldYield));
    let lastHandoffStart = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < handoffs.length; i++) { if (shouldYield()) yield;
        if (handoffs[i]!.first.start < lastHandoffStart + pulseOf(handoffs[i]!.first) * 8)
            continue;
        const chain = [handoffs[i]!];
        for (let j = i + 1; j < handoffs.length; j++) { if (shouldYield()) yield;
            const last = chain.at(-1)!;
            const next = handoffs[j]!;
            if (next.first.start >= chain[0]!.first.start + pulseOf(chain[0]!.first) * 8)
                break;
            if (next.first.slide.id === last.next.slide.id)
                chain.push(next);
        }
        if (chain.length < 2)
            continue;
        const turnAngles = chain.map(h => angleDifference(pathPose(h.first.pieces.at(-1)!.geometry, .95).angle, pathPose(h.next.pieces[0]!.geometry, .05).angle) * 180 / Math.PI);
        if (chain.length < 3 && (Math.max(...turnAngles) < 100 || chain.some(h => h.gapMs > Math.max(h.first.end - h.first.start, pulseOf(h.first)) * .5)))
            continue;
        const source = chain[0]!.first;
        lastHandoffStart = source.start;
        slideTechniqueBurden += chain.length;
    }
    const launchSeen = new Set<number>(), collisionSeen = new Set<string>(), holdSlideSeen = new Set<string>();
    const headReturnSeen = new Set<number>();
    const headReturnMotifs: {
        slideId: number;
        start: number;
        end: number;
        noteIds: number[];
    }[] = [];
    for (const motion of motions) { if (shouldYield()) yield;
        const branch = motion.slide.branches[motion.branchIndex]!;
        const head = buttonPoint(motion.slide.position);
        if (motion.turns.length && (branch.segments.length >= 2 || branch.segments.some(s => s.type === 'V')) &&
            (motion.speed >= 8 || motion.turns.length >= 2)) {
            slideTechniqueBurden += motion.turns.length;
        }
        if (!motion.slide.isHeadless && branch.delayMs > 0 && !launchSeen.has(motion.slide.id)) {
            launchSeen.add(motion.slide.id);
            const waiting = notes.filter(n => n.id !== motion.slide.id && (n.type !== 'slide' || !n.isHeadless) &&
                n.timingMs > motion.slide.timingMs + 1e-6 && n.timingMs <= motion.start + branch.delayMs * .025);
            const conflicting = waiting.filter(n => { const p = pointOf(n); return p && Math.hypot(head.x - p.x, head.y - p.y) <= (n.type === 'slide' ? 2.5 : 2.15); });
            const phases = conflicting.map(n => (n.timingMs - motion.slide.timingMs) / branch.delayMs);
            const repeatedWait = conflicting.length >= 2 && phases.some((phase, i) => i > 0 && !relativeRhythmNear(phase, phases[0]!));
            const launchTap = conflicting.some((n, i) => n.type !== 'slide' && n.position === motion.slide.position && relativeRhythmNear(phases[i]!, 1));
            const midpointTap = conflicting.some((n, i) => n.type !== 'slide' && n.position === motion.slide.position && relativeRhythmNear(phases[i]!, .5));
            const lateWaitTap = conflicting.some((n, i) => n.type !== 'slide' && n.position === motion.slide.position && phases[i]! > .5 && phases[i]! < 1);
            const anotherStar = conflicting.some(n => n.type === 'slide');
            if (repeatedWait || launchTap || midpointTap || lateWaitTap || anotherStar) {
                slideTechniqueBurden += conflicting.length;
            }
        }
        const headReturns = buttons.filter(n => n.id !== motion.slide.id && n.position === motion.slide.position &&
            n.timingMs >= motion.start - 1e-6 && n.timingMs < motion.end - 1e-6);
        if (motion.end > motion.start && headReturns.length && !headReturnSeen.has(motion.slide.id)) {
            headReturnSeen.add(motion.slide.id);
            headReturnMotifs.push({ slideId: motion.slide.id, start: motion.start, end: motion.end,
                noteIds: headReturns.map(n => n.id) });
            if (headReturns.length >= 2) {
                slideTechniqueBurden += 3 + headReturns.length;
            }
            else
                ;
        }
        const nearby = notes.filter(n => n.id !== motion.slide.id && (n.type !== 'slide' || !n.isHeadless) &&
            n.timingMs >= motion.start && n.timingMs <= motion.end + CONTACT_POLICY.earlyContactMs);
        for (const note of nearby) { if (shouldYield()) yield;
            const p = pointOf(note);
            if (!p)
                continue;
            const zone = zoneOf(note);
            const matching = zone === null ? [] : motion.zones.filter(pass => pass.area === zone &&
                pass.enterMs <= note.timingMs - CONTACT_POLICY.minimumLeadMs && pass.exitMs >= note.timingMs - CONTACT_POLICY.earlyContactMs);
            let separation = Number.POSITIVE_INFINITY;
            const matchingPass = matching.sort((a, b) => b.enterMs - a.enterMs)[0];
            let passMs: number | null = matchingPass?.enterMs ?? null;
            const firstContactMs = Math.max(motion.start, note.timingMs - CONTACT_POLICY.earlyContactMs);
            const lastContactMs = Math.min(motion.end, note.timingMs - CONTACT_POLICY.minimumLeadMs);
            const lanes = matchingPass ? [matchingPass.lane] : ['center', ...motion.sidePaths.map(path => path.lane)] as Zone['lane'][];
            for (let atMs = firstContactMs; atMs <= lastContactMs; atMs += CONTACT_POLICY.sampleMs) { if (shouldYield()) yield;
                for (const lane of lanes) { if (shouldYield()) yield;
                    const pose = poseAt(motion, atMs, lane);
                    const distanceToNote = Math.hypot(p.x - pose.x, p.y - pose.y);
                    if (distanceToNote < separation) {
                        separation = distanceToNote;
                        if (!matching.length)
                            passMs = atMs;
                    }
                }
            }
            if (!matching.length)
                passMs = null;
            if (passMs !== null && note.timingMs - passMs > CONTACT_POLICY.earlyContactMs)
                passMs = null;
            const collisionKey = `${motion.slide.id}:${note.id}`;
            if (passMs === null || collisionSeen.has(collisionKey))
                continue;
            collisionSeen.add(collisionKey);
            slideTechniqueBurden += 2;
        }
        for (const hold of notes.filter(n => n.type === 'hold-start' || n.type === 'touch-hold-start')) { if (shouldYield()) yield;
            const occupied = Math.min(hold.endTimeMs, motion.end) - Math.max(hold.timingMs, motion.start);
            if (occupied <= 1e-6 || hold.id === motion.slide.id)
                continue;
            const holdKey = `${motion.slide.id}:${hold.id}`;
            if (holdSlideSeen.has(holdKey))
                continue;
            const p = pointOf(hold);
            if (!p)
                continue;
            const extraNotes = buttons.filter(n => n.id !== hold.id && n.timingMs >= Math.max(hold.timingMs, motion.start) &&
                n.timingMs <= Math.min(hold.endTimeMs, motion.end));
            const curvedOccupied = branch.segments.some(segment => ['p', 'pp', 'q', 'qq', 's', 'z', 'V', 'w'].includes(segment.type));
            if (!extraNotes.length && !curvedOccupied)
                continue;
            holdSlideSeen.add(holdKey);
            slideTechniqueBurden += 1.5;
        }
    }
    // Repeated return-to-head motions are a sustained hand-order problem even when
    // each individual slide is slow. Only combine actual slide/TAP overlaps.
    let returnRun: typeof headReturnMotifs = [];
    const finishReturnRun = () => {
        if (returnRun.length < 3)
            return;
        slideTechniqueBurden += returnRun.length * 2;
    };
    for (const motif of headReturnMotifs) { if (shouldYield()) yield;
        if (returnRun.length && (motif.start - returnRun.at(-1)!.end > (returnRun.at(-1)!.end - returnRun.at(-1)!.start) * 2 ||
            returnRun.length >= 16)) {
            finishReturnRun();
            returnRun = [];
        }
        returnRun.push(motif);
    }
    finishReturnRun();
    const slideSensorSeen = new Set<string>();
    for (let i = 0; i < motions.length; i++) { if (shouldYield()) yield;
        const first = motions[i]!;
        for (let j = i + 1; j < motions.length && motions[j]!.start <= first.end; j++) { if (shouldYield()) yield;
            const second = motions[j]!;
            if (first.slide.id === second.slide.id)
                continue;
            const overlapStart = Math.max(first.start, second.start), overlapEnd = Math.min(first.end, second.end);
            if (overlapEnd <= overlapStart + 1e-6)
                continue;
            for (const [source, target] of [[first, second], [second, first]] as const) { if (shouldYield()) yield;
                const ordered = [...target.zones].sort((a, b) => a.enterMs - b.enterMs);
                for (let zoneIndex = 1; zoneIndex < ordered.length; zoneIndex++) { if (shouldYield()) yield;
                    const zone = ordered[zoneIndex]!;
                    const previous = ordered.slice(0, zoneIndex).filter(other => other.enterMs < zone.enterMs - 1e-6).at(-1);
                    if (!previous)
                        continue;
                    const eligible = Math.max(target.start, previous.enterMs);
                    const pass = source.zones.find(other => other.area === zone.area && Math.max(other.enterMs, eligible) < zone.enterMs - CONTACT_POLICY.minimumLeadMs && other.exitMs >= eligible);
                    if (!pass)
                        continue;
                    const at = Math.max(pass.enterMs, eligible), key = `${source.slide.id}:${target.slide.id}:${zone.area}`;
                    if (at < overlapStart || at > overlapEnd || slideSensorSeen.has(key))
                        continue;
                    slideSensorSeen.add(key);
                    slideTechniqueBurden += 1.5;
                    break;
                }
            }
            const speedRatio = Math.max(first.speed, second.speed) / Math.max(.001, Math.min(first.speed, second.speed));
            const endPhase = (first.end - second.end) / Math.max(first.end - first.start, second.end - second.start);
            if (speedRatio >= 1.8 && Math.abs(endPhase) >= .25) {
                slideTechniqueBurden += Math.log2(speedRatio);
            }
        }
    }
    // Sequential launch relations are distinct from nearby-head or sensor
    // conflicts. Keep the two explicit hand strategies as hypotheses, not a
    // minimum-hand or optimal-solution claim. Shared one-stroke chains emit none.
    const launchHandover = (yield* slideLaunchHandover(shouldYield, slideEvents));
    for (const candidate of launchHandover.candidates) { if (shouldYield()) yield;
        if (!candidate.candidateAxis)
            continue;
        const resets = candidate.relations.reduce((sum, relation) => sum + relation.resetDistance, 0);
        slideTechniqueBurden += candidate.relations.length + resets / 8;
    }
    const launchTap = (yield* repeatedLaunchTapCandidate(shouldYield, chart, slideEvents));
    for (const candidate of launchTap.candidates) { if (shouldYield()) yield;
        for (let index = 0; index < candidate.relations.length; index++) { if (shouldYield()) yield;
            const relation = candidate.relations[index]!;
            slideTechniqueBurden += 1 + relation.tapMovement / 4;
        }
    }
    // A shortest point-contact route does not measure the reading and action
    // continuity of two synchronous sweeps transitioning into delayed Slides.
    // Keep source-matched mixed evidence, bounded to the synchronous launch.
    const sweepSlideContext = (yield* doubleSweepSlideContext(shouldYield, chart));
    for (let i = 0; i < sweepSlideContext; i++)
        { if (shouldYield()) yield; slideTechniqueBurden += 1; }
    const peak = (windows: {
        count: number;
    }[]) => Math.max(0, ...windows.map(x => x.count));
    return { slideEvents, features: {
            axis_keyboard_burst: peak(four) / 4 + peak(two) / 2,
            axis_keyboard_stamina: peak(thirtyTwo) / 32 + percentile(sixteen.map(x => x.count).sort((a, b) => a - b), .75) / 16,
            axis_keyboard_technique: (jacks + wideMoves + 2 * alternating + sweeps + .5 * rhythmChanges + .25 * holdConflicts +
                3 * holdHandSequences + .5 * holdOneHandBurden + 3 * dottedMovePatterns + 2 * dottedSpatialEvents +
                1.5 * chordRepositions + 1.2 * dottedChordQualified8s + sweepSlideContext) / duration * 10,
            axis_star_burst: slideBurstBurden / duration * 10,
            axis_star_stamina: slideStaminaBurden / duration * 10,
            axis_star_technique: slideTechniqueBurden / duration * 10,
        } };
}
