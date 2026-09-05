import { describe, expect, it } from 'vitest';
import cases from './fixtures/maimai-simai-cases.json';
import reference from './fixtures/maimai-simai-reference.json';
import customReference from './fixtures/maimai-custom-reference.json';
import connectedReference from './fixtures/maimai-connected-reference.json';
import { parseSimaiBody, SimaiParseError } from '@/features/maimai-chart-preview/engine/core/parser/SimaiParser';
import { ScrollTimeline } from '@/features/maimai-chart-preview/engine/core/timing/ScrollTimeline';
import { geometryFor, prepareBranch, joinGeometries } from '@/features/maimai-chart-preview/engine/core/geometry/slidePath';
import { prepareAudioEvents } from '@/features/maimai-chart-preview/engine/core/audio/AudioManager';

describe('MajSimai 2.2.2 reference output', () => {
  for (const [code, expected] of Object.entries(connectedReference)) it(`ViewX connected geometry ${code}`, () => {
    const note = parseSimaiBody(`(120)${code},`).notes[0];
    if (note.type !== 'slide') throw new Error('Expected slide');
    const parts = prepareBranch(note.branches[0]), actual = joinGeometries(parts.map(p => p.geometry));
    expect(actual.length).toBeCloseTo(expected.SlideLength, 4);
    expect(actual.slideConst).toBeCloseTo(expected.SlideConst, 4);
    expect(actual.okType).toBe(expected.OkType);
    expect(actual.omitLast).toBe(expected.ConditionalLastArrow);
    expect(actual.arrows).toHaveLength(expected.ArrowPoses.length);
    actual.arrows.forEach((p, i) => {
      const q = expected.ArrowPoses[i];
      expect(p.x).toBeCloseTo(q.X, 4); expect(p.y).toBeCloseTo(q.Y, 4); expect(p.length).toBeCloseTo(q.L, 4);
      expect(Math.sin(p.angle)).toBeCloseTo(Math.sin(q.RotZ * Math.PI / 180), 4);
      expect(Math.cos(p.angle)).toBeCloseTo(Math.cos(q.RotZ * Math.PI / 180), 4);
    });
    expect(actual.areas).toEqual(expected.JudgeAreaQueue.map(a => [a.ArrowProgressPush, a.ArrowProgressFinish, a.SensorA, a.SensorB]));
    expect(parts[0].durationMs / parts[0].geometry.length).toBeCloseTo(parts[1].durationMs / parts[1].geometry.length, 6);
    expect(note.branches[0].segments.map(s => s.durationMs)).toEqual([500, 1000]);
  });
  for (const [code, expected] of Object.entries(customReference)) it(`ViewX custom geometry ${code}`, () => {
    const note = parseSimaiBody(`(120)${code}[4:1],`).notes[0];
    if (note.type !== 'slide') throw new Error('Expected slide');
    if ('error' in expected) { expect(() => prepareBranch(note.branches[0])).toThrow(); return; }
    const actual = prepareBranch(note.branches[0])[0].geometry;
    expect(actual.length).toBeCloseTo(expected.SlideLength, 4);
    expect(actual.slideConst).toBeCloseTo(expected.SlideConst, 4);
    expect(actual.omitLast).toBe(expected.ConditionalLastArrow);
    expect(actual.okType).toBe(expected.OkType);
    const compare = (a: { x: number; y: number; angle: number }, b: { X: number; Y: number; RotZ: number }) => {
      expect(a.x).toBeCloseTo(b.X, 4); expect(a.y).toBeCloseTo(b.Y, 4);
      expect(Math.sin(a.angle)).toBeCloseTo(Math.sin(b.RotZ * Math.PI / 180), 4);
      expect(Math.cos(a.angle)).toBeCloseTo(Math.cos(b.RotZ * Math.PI / 180), 4);
    };
    compare(actual.ok, expected.OkPose);
    expect(actual.arrows).toHaveLength(expected.ArrowPoses.length);
    actual.arrows.forEach((pose, i) => { compare(pose, expected.ArrowPoses[i]); expect(pose.length).toBeCloseTo(expected.ArrowPoses[i].L, 4); });
    expect(actual.areas).toEqual(expected.JudgeAreaQueue.map(a => [a.ArrowProgressPush, a.ArrowProgressFinish, a.SensorA, a.SensorB]));
  });
  for (const [name, body] of Object.entries(cases)) it(name, () => {
    const chart = parseSimaiBody(body), lead = 240000 / chart.bpm;
    const expected = reference[name as keyof typeof reference];
    const actual = chart.notes.flatMap(n => {
      const base = {
        Timing: (n.timingMs - lead) / 1000, Bpm: n.bpm, HSpeed: n.hiSpeed,
        type: n.type === 'slide' ? 1 : n.type === 'hold-start' ? 2 : n.type === 'touch' ? 3 : n.type === 'touch-hold-start' ? 4 : 0,
        StartPosition: typeof n.position === 'number' ? n.position : n.position === 'C' ? 8 : Number(n.position[1]),
        IsEx: n.isEx, IsBreak: n.isBreak, IsMine: n.isMine, UsingSV: n.usingSV,
        HoldTime: 'durationMs' in n ? n.durationMs / 1000 : 0,
        IsHanabi: 'hasFirework' in n ? n.hasFirework : false,
        IsForceStar: n.isForceStar,
        IsFakeRotate: n.isFakeRotate,
        IsSlideNoHead: n.type === 'slide' ? n.isHeadless : false,
        IsTapHeadSlide: n.type === 'slide' ? n.isTapHead : false,
        SlideStartTime: 0, SlideTime: 0, IsMineSlide: false, IsSlideBreak: false,
      };
      return n.type === 'slide' ? n.branches.map((b, i) => ({ ...base,
        ...(i ? { IsBreak: false, IsMine: false, IsEx: false, UsingSV: true } : {}),
        IsSlideNoHead: i > 0 || n.isHeadless,
        SlideStartTime: (n.timingMs - lead + b.delayMs) / 1000, SlideTime: b.durationMs / 1000, IsMineSlide: b.isMine, IsSlideBreak: b.isBreak,
      })) : [base];
    });
    const flat = expected.notes.flatMap(t => t.notes.map(n => ({ ...n, Timing: t.Timing, Bpm: t.Bpm, HSpeed: t.HSpeed })));
    expect(actual.length).toBe(flat.length);
    for (let i = 0; i < actual.length; i++) for (const [key, value] of Object.entries(actual[i])) {
      const wanted = flat[i][key as keyof typeof flat[number]];
      if (typeof value === 'number') expect(value, `${name} note ${i} ${key}`).toBeCloseTo(Number(wanted), 5);
      else expect(value, `${name} note ${i} ${key}`).toBe(wanted);
    }
    const scroll = new ScrollTimeline(chart.scrollEvents);
    let lastTime = 0, velocity = 1, position = 0;
    for (const comma of expected.commas) {
      position += (comma.Timing * 1000 - lastTime) * velocity;
      expect(scroll.at(comma.Timing * 1000 + lead) - lead).toBeCloseTo(position, 4);
      lastTime = comma.Timing * 1000; velocity = comma.SVeloc;
    }
  });
  it('rejects unknown notes with line and column rather than dropping them', () => {
    expect(() => parseSimaiBody('(120)\n1j,')).toThrow(SimaiParseError);
    try { parseSimaiBody('(120)\n1j,'); } catch (error) { expect((error as SimaiParseError).source).toMatchObject({ line: 2, column: 1, text: '1j' }); }
  });
  it('prepares every custom path in the reference cases', () => {
    for (const note of parseSimaiBody(cases.custom).notes) if (note.type === 'slide') for (const branch of note.branches) {
      const parts = prepareBranch(branch);
      expect(parts[0].geometry.arrows.length).toBeGreaterThan(2);
    }
  });
  it('retains the written duration on the final segment of a shared-duration connection', () => {
    const note = parseSimaiBody('(120)1-3-5[4:3],').notes[0];
    if (note.type !== 'slide') throw new Error('Expected slide');
    expect(note.branches[0].segments.map(s => s.durationMs)).toEqual([null, 1500]);
    expect(note.branches[0].durationMs).toBe(1500);
  });
  it('deduplicates answer sounds within 1ms and includes hold ends', () => {
    const chart = parseSimaiBody('(120){4}1/2h[4:1],3?-7[4:1],');
    expect(prepareAudioEvents(chart.notes).map(e => e.timeMs)).toEqual([2000, 2500]);
  });
  it('uses the ViewX arrow coordinate and rotation convention', () => {
    const g = geometryFor({ code: '1-5', type: '-', startPos: 1, endPos: 5, durationMs: null });
    expect(g.arrows[0].x).toBeCloseTo(4.8 * Math.cos(3 * Math.PI / 8), 5);
    expect(g.arrows[g.arrows.length - 1].x).toBeCloseTo(-g.arrows[0].x, 5);
    expect(g.length).toBeCloseTo(9.6, 5);
  });
});
