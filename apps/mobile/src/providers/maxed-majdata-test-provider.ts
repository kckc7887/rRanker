import type { MajdataScore, MajdataSnapshot, MajdataSong } from '@/domain/majdata';
import { calculateAchievement, type NoteCounts } from '@/domain/tolerance';
import { generatedSource } from './generated-source';

export function maxedMajdataSnapshot(displayName: string): MajdataSnapshot {
  return { player: { username: displayName }, records: [], recent: [], source: generatedSource() };
}

export function buildMaxedMajdataScore(song: MajdataSong, level: number, counts: NoteCounts): MajdataScore {
  const notes = { tap: counts.tap, hold: counts.hold, slide: counts.slide, touch: counts.touch, break: counts.break };
  return {
    chartInfo: song, chartLevel: level, hash: song.hash, timestamp: song.timestamp, comboState: 4,
    acc: { dx: calculateAchievement(notes, {}, 'dx'), classic: calculateAchievement(notes, {}, 'classic') },
    dxScore: 3 * (notes.tap + notes.hold + notes.slide + notes.touch + notes.break),
  };
}
