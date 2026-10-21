import { describe, expect, it, vi } from 'vitest';
import cases from './fixtures/maimai-simai-cases.json';
import reference from './fixtures/maimai-simai-reference.json';
import { parseSimaiBody, parseSimaiChartAsync, SimaiParseError } from '@/features/simai-chart-preview/engine/core/parser/SimaiParser';
import { prepareAudioEvents } from '@/features/simai-chart-preview/engine/core/audio/AudioManager';

describe('Simai 解析与播放时序', () => {
  it.each(Object.entries(cases))('%s 保留谱面写入的音符时间', (name, body) => {
    const chart = parseSimaiBody(body);
    const expected = reference[name as keyof typeof reference];
    const timings = [...new Set(chart.notes.map(note => (note.timingMs - 240000 / chart.bpm) / 1000))];
    const sourceTimes = expected.notes.filter(group => group.notes.length).map(group => group.Timing);
    expect(timings).toHaveLength(sourceTimes.length);
    timings.forEach((time, index) => expect(time).toBeCloseTo(sourceTimes[index], 5));
  });
  it('rejects unknown notes with line and column rather than dropping them', () => {
    expect(() => parseSimaiBody('(120)\n1j,')).toThrow(SimaiParseError);
    try { parseSimaiBody('(120)\n1j,'); } catch (error) { expect((error as SimaiParseError).source).toMatchObject({ line: 2, column: 1, text: '1j' }); }
  });
  it('preserves slot metadata and source positions in asynchronous parsing', async () => {
    const text = '&title=Sample\n&artist=Artist\n&bpm=120\n&first=-0.25\n&des=Designer\n&lv_5=12+\n&inote_5=\n1/2h[4:1],\n&inote_7=(150)3,';
    const chart = await parseSimaiChartAsync(text, 5);
    expect(chart).toMatchObject({
      title: 'Sample', artist: 'Artist', designer: 'Designer', difficulty: 5,
      firstMs: -250, bpm: 120, level: { lv_5: '12+' }, availableDifficulties: { 5: true, 7: true },
      notes: [
        { type: 'tap', position: 1, timingMs: 2000, isEach: true, source: { line: 8, column: 1, text: '1' } },
        { type: 'hold-start', position: 2, timingMs: 2000, endTimeMs: 2500, isEach: true, source: { line: 8, column: 3, text: '2h[4:1]' } },
      ],
    });
    await expect(parseSimaiChartAsync('&inote_5=(120)\n1j,', 5)).rejects.toMatchObject({
      name: 'SimaiParseError', source: { line: 2, column: 1, text: '1j' },
    });
  });
  it('lets queued work run while parsing and completes all notes', async () => {
    let elapsed = 0, completed = false;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => elapsed++);
    try {
      const pending = parseSimaiChartAsync(`&inote_5=(120){4}${'1/2,'.repeat(16)}`, 5).then(chart => {
        completed = true;
        return chart;
      });
      await new Promise<void>(resolve => { setTimeout(resolve, 0); });
      expect(completed).toBe(false);
      const chart = await pending;
      expect(chart.notes).toHaveLength(32);
      expect(chart.notes[31]).toMatchObject({ position: 2, timingMs: 9500, isEach: true });
    } finally { now.mockRestore(); }
  });
  it('stops parsing when its consumer cancels between slices', async () => {
    let elapsed = 0;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => elapsed++);
    const controller = new AbortController(), reason = new Error('closed chart');
    try {
      const pending = parseSimaiChartAsync(`&inote_5=(120)${'1/2,'.repeat(16)}`, 5, controller.signal);
      const rejection = expect(pending).rejects.toBe(reason);
      setTimeout(() => { controller.abort(reason); }, 0);
      await rejection;
      await expect(parseSimaiChartAsync('invalid', 5, controller.signal)).rejects.toBe(reason);
    } finally { now.mockRestore(); }
  });
  it('retains the total duration of a connected slide', () => {
    const note = parseSimaiBody('(120)1-3-5[4:3],').notes[0];
    if (note.type !== 'slide') throw new Error('Expected slide');
    expect(note.branches[0].durationMs).toBe(1500);
  });
  it('deduplicates answer sounds within 1ms and includes hold ends', () => {
    const chart = parseSimaiBody('(120){4}1/2h[4:1],3?-7[4:1],');
    expect(prepareAudioEvents(chart.notes).map(e => e.timeMs)).toEqual([2000, 2500]);
  });
});
