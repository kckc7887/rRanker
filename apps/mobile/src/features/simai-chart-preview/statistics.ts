import type { Chart } from './engine/types';
import type { NoteCounts, NoteKind } from '@/domain/tolerance';

export type SimaiStatistics = {
  counts: NoteCounts & { mine: number };
  mines: NoteCounts;
};
const empty = (): NoteCounts => ({ tap: 0, hold: 0, slide: 0, touch: 0, break: 0 });

/** 连接 slide 每个分支计一份判定，头部另计。 */
export function simaiStatistics(chart: Chart): SimaiStatistics {
  const result: SimaiStatistics = { counts: { ...empty(), mine: 0 }, mines: empty() };
  const add = (body: Exclude<NoteKind, 'break'>, isBreak: boolean, isMine: boolean) => {
    const kind = isBreak ? 'break' : body;
    if (isMine) { result.counts.mine++; result.mines[kind]++; }
    else result.counts[kind]++;
  };
  for (const note of chart.notes) {
    if (note.type === 'slide') {
      if (!note.isHeadless) add('tap', note.isStartBreak, note.isMine);
      for (const branch of note.branches) add('slide', branch.isBreak, branch.isMine);
    } else add(note.type === 'hold-start' || note.type === 'touch-hold-start' ? 'hold' : note.type === 'touch' ? 'touch' : 'tap', note.isBreak, note.isMine);
  }
  return result;
}
