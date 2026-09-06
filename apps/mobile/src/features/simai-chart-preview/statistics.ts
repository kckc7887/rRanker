import type { Chart } from './engine/types';
import type { NoteCounts, NoteKind } from '@/domain/tolerance';

export type SimaiJudgmentUnit = { body: Exclude<NoteKind, 'break'>; isBreak: boolean; isMine: boolean; isEx: boolean };
export type SimaiStatistics = {
  counts: NoteCounts & { mine: number };
  scoring: NoteCounts;
  mines: NoteCounts;
  units: SimaiJudgmentUnit[];
};
const empty = (): NoteCounts => ({ tap: 0, hold: 0, slide: 0, touch: 0, break: 0 });

/** One connected slide branch is one judgment unit; its head is independent. */
export function simaiStatistics(chart: Chart): SimaiStatistics {
  const result: SimaiStatistics = { counts: { ...empty(), mine: 0 }, scoring: empty(), mines: empty(), units: [] };
  const add = (unit: SimaiJudgmentUnit) => {
    result.units.push(unit);
    const kind = unit.isBreak ? 'break' : unit.body;
    result.scoring[kind]++;
    if (unit.isMine) { result.counts.mine++; result.mines[kind]++; }
    else result.counts[kind]++;
  };
  for (const note of chart.notes) {
    if (note.type === 'slide') {
      if (!note.isHeadless) add({ body: 'tap', isBreak: note.isStartBreak, isMine: note.isMine, isEx: note.isEx });
      for (const branch of note.branches) add({ body: 'slide', isBreak: branch.isBreak, isMine: branch.isMine, isEx: note.isEx });
    } else add({ body: note.type === 'hold-start' || note.type === 'touch-hold-start' ? 'hold' : note.type === 'touch' ? 'touch' : 'tap', isBreak: note.isBreak, isMine: note.isMine, isEx: note.isEx });
  }
  return result;
}
