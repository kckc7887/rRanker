import { describe, expect, it } from 'vitest';
import {
  getAvailableDifficulties,
  parseSimaiBuddyCharts,
  parseSimaiChart,
  parseSimaiSideChart,
} from '@/features/maimai-chart-preview/engine/core/parser/SimaiParser';

const BUDDY_SIMAI = [
  '&title=テスタメント',
  '&artist=あーと',
  '&bpm=180',
  '&inote_2=1,2h[4:1],3b-5[8:1]',
  '&lv_2=14',
  '&des_2=谱师A',
  '&inote_102=5,6h[4:1],A1,4b',
  '&lv_102=14',
  '&des_102=谱师B',
].join('\n');

const BUDDY_1P_ONLY = [
  '&title=テスタメント',
  '&bpm=180',
  '&inote_2=1,2h[4:1]',
].join('\n');

const MASTER_WITHOUT_REMASTER = [
  '&title=没有 Re:MASTER 的歌曲',
  '&bpm=150',
  '&inote_2=(150){4}1,',
  '&inote_3=(150){4}2,',
  '&inote_4=(150){4}3,',
  '&inote_5=(150){4}4,',
].join('\n');

describe('maimai buddy chart parser', () => {
  it('parses both sides with identical lead-in timing', () => {
    const { side1, side2 } = parseSimaiBuddyCharts(BUDDY_SIMAI);
    expect(side1.bpm).toBe(180);
    expect(side2.bpm).toBe(180);
    expect(side1.title).toBe('テスタメント');
    expect(side1.designer).toBe('谱师A');
    expect(side2.designer).toBe('谱师B');
    expect(side1.difficulty).toBe(2);
    expect(side2.difficulty).toBe(102);

    const tap1 = side1.notes.find((n) => n.type === 'tap' && 'position' in n && n.position === 1);
    const tap2 = side2.notes.find((n) => n.type === 'tap' && 'position' in n && n.position === 5);
    expect(tap1?.timing).toBe(4);
    expect(tap2?.timing).toBe(4);
    expect(tap1?.timingMs).toBeCloseTo(tap2?.timingMs ?? NaN);
  });

  it('parses 2P holds, slides, touches and breaks with their own positions', () => {
    const { side1, side2 } = parseSimaiBuddyCharts(BUDDY_SIMAI);

    const hold1 = side1.notes.find(
      (n) => n.type === 'hold-start' && 'position' in n && n.position === 2,
    );
    expect(hold1?.timing).toBe(5);
    expect(hold1).toMatchObject({ isHoldStart: true, duration: 1 });

    const slide = side1.notes.find((n) => n.type === 'slide' && 'position' in n && n.position === 3);
    expect(slide?.timing).toBe(6);
    expect(slide).toMatchObject({ isStartBreak: true });

    const hold2 = side2.notes.find(
      (n) => n.type === 'hold-start' && 'position' in n && n.position === 6,
    );
    expect(hold2?.timing).toBe(5);

    const touch = side2.notes.find((n) => n.type === 'touch' && 'position' in n && n.position === 'A1');
    expect(touch?.timing).toBe(6);

    const breakNote = side2.notes.find((n) => n.type === 'break' && 'position' in n && n.position === 4);
    expect(breakNote?.timing).toBe(7);
  });

  it('single-side parsing returns the same charts as the dual parse', () => {
    const { side1, side2 } = parseSimaiBuddyCharts(BUDDY_SIMAI);
    const single1 = parseSimaiSideChart(BUDDY_SIMAI, 0);
    const single2 = parseSimaiSideChart(BUDDY_SIMAI, 1);

    const summarize = (chart: typeof side1) =>
      chart.notes.map((n) => [n.type, n.timing, n.timingMs]);
    expect(summarize(single1)).toEqual(summarize(side1));
    expect(summarize(single2)).toEqual(summarize(side2));
  });

  it('single-side 2P does not fall back to the 1P section', () => {
    const side2 = parseSimaiSideChart(BUDDY_SIMAI, 1);
    const has2POnlyNote = side2.notes.some((n) => n.type === 'touch' || n.type === 'break');
    expect(has2POnlyNote).toBe(true);
    expect(side2.notes.some((n) => 'position' in n && n.position === 1)).toBe(false);
  });

  it('throws a clear error when a buddy side is missing', () => {
    expect(() => parseSimaiBuddyCharts(BUDDY_1P_ONLY)).toThrow(/缺少 2P 段（&inote_102）/);
    expect(() => parseSimaiSideChart(BUDDY_1P_ONLY, 1)).toThrow(/缺少 2P 段（&inote_102）/);
    expect(() => parseSimaiSideChart('&bpm=120\n&inote_102=1', 0)).toThrow(/缺少 1P 段（&inote_2）/);
  });

  it('keeps the single-difficulty detection unchanged for buddy files', () => {
    expect(getAvailableDifficulties(BUDDY_SIMAI)).toEqual({ 2: true });
  });

  it('single-difficulty parse of the 1P slot matches the buddy 1P chart', () => {
    const viaBuddy = parseSimaiBuddyCharts(BUDDY_SIMAI).side1;
    const viaDifficulty = parseSimaiChart(BUDDY_SIMAI, 2);
    const summarize = (chart: typeof viaDifficulty) =>
      chart.notes.map((n) => [n.type, n.timing, n.timingMs]);
    expect(summarize(viaDifficulty)).toEqual(summarize(viaBuddy));
  });

  it('plays MASTER from inote_5 when Re:MASTER is absent', () => {
    expect(getAvailableDifficulties(MASTER_WITHOUT_REMASTER)).toEqual({
      2: true,
      3: true,
      4: true,
      5: true,
    });
    const chart = parseSimaiChart(MASTER_WITHOUT_REMASTER, 5);
    expect(chart.difficulty).toBe(5);
    expect(chart.notes.some((note) => 'position' in note && note.position === 4)).toBe(true);
  });
});
