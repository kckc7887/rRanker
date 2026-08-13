import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { countPbcNotes, countPecNotes, countPgrNotes, countPhiraChartZip, countRpeNotes } from '@/services/phira-chart-notes';

describe('Phira chart note readers', () => {
  it('counts RPE notes, excludes fake and counts Hold once', () => {
    expect(countRpeNotes({ judgeLineList: [{ notes: [
      { type: 1 }, { type: 2 }, { type: 3 }, { type: 4 }, { type: 2, isFake: true },
    ] }] })).toEqual({ click: 1, hold: 1, flick: 1, drag: 1 });
  });

  it('counts PGR notes with its own type mapping', () => {
    expect(countPgrNotes({ judgeLineList: [{ notesAbove: [{ type: 1 }, { type: 2 }], notesBelow: [{ type: 3 }, { type: 4 }] }] }))
      .toEqual({ click: 1, hold: 1, flick: 1, drag: 1 });
  });

  it('counts PEC note commands and excludes fake notes', () => {
    expect(countPecNotes('n1 0 0 0 1 0\nn2 0 0 10 0 1 0\nn3 0 0 0 1 0\nn4 0 0 0 1 0\nn1 0 0 0 1 1'))
      .toEqual({ click: 1, hold: 1, flick: 1, drag: 1 });
  });

  it('parses an empty PBC chart', () => {
    const bytes = new Uint8Array(7);
    expect(countPbcNotes(bytes)).toEqual({ click: 0, hold: 0, flick: 0, drag: 0 });
  });

  it('counts every PBC note kind, excludes fake and counts Hold once', () => {
    const bytes: number[] = [];
    const u8 = (value: number) => bytes.push(value);
    const uleb = (value: number) => { u8(value); };
    const f32 = (value = 0) => {
      const raw = new Uint8Array(4); new DataView(raw.buffer).setFloat32(0, value, true); bytes.push(...raw);
    };
    const i32 = (value = 0) => {
      const raw = new Uint8Array(4); new DataView(raw.buffer).setInt32(0, value, true); bytes.push(...raw);
    };
    const defaultAnim = () => { u8(1); u8(0); };
    const object = () => { for (let index = 0; index < 6; index += 1) defaultAnim(); };
    const note = (kind: number, fake = false) => {
      object(); u8(kind); if (kind === 1) { f32(1); f32(1); }
      uleb(0); f32(); u8(0); u8(1); u8(fake ? 1 : 0);
    };
    f32(); uleb(1); object(); u8(0); defaultAnim(); uleb(5);
    note(0); note(1); note(2); note(3); note(0, true);
    defaultAnim(); uleb(0); u8(0); u8(0); u8(8);
    for (let index = 0; index < 5; index += 1) defaultAnim();
    i32(); u8(0); u8(0);
    expect(countPbcNotes(new Uint8Array(bytes))).toEqual({ click: 1, hold: 1, flick: 1, drag: 1 });
  });

  it('detects an RPE chart inside ZIP and rejects a damaged package', async () => {
    const zip = new JSZip();
    zip.file('info.yml', 'chart: chart.json\nformat: rpe');
    zip.file('chart.json', JSON.stringify({ META: {}, judgeLineList: [{ notes: [{ type: 1 }] }] }));
    expect(await countPhiraChartZip(await zip.generateAsync({ type: 'arraybuffer' }))).toEqual({ click: 1, hold: 0, flick: 0, drag: 0 });
    await expect(countPhiraChartZip(new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow();
  });
});
