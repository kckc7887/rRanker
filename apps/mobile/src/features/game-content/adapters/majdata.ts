import type { ScoreCardPresentation, SongRowPresentation } from '../presentation';
import { MAJDATA_NAMES, MAJDATA_ORDER, type MajdataScore, type MajdataRecent, type MajdataSong } from '@/domain/majdata';

export type MajdataCard = { key: string; songId: string; title: string; level: number; difficulty: string; dx: number; classic?: number; combo: number; timestamp?: string | null; hash?: string };
export function majdataRecordCard(score: MajdataScore): MajdataCard {
  return { key: `${score.chartInfo.id}:${score.hash}:${score.chartLevel}`, songId: score.chartInfo.id, title: score.chartInfo.title,
    level: score.chartLevel, difficulty: score.chartInfo.levels[score.chartLevel] ?? '', dx: score.acc.dx, classic: score.acc.classic,
    combo: score.comboState, timestamp: score.timestamp, hash: score.hash };
}
export function majdataRecentCard(score: MajdataRecent, index: number): MajdataCard {
  return { key: `${score.chartId}:${score.timestamp}:${index}`, songId: score.chartId, title: score.title, level: score.level,
    difficulty: score.difficulty, dx: score.acc, combo: score.comboState, timestamp: score.timestamp };
}
export function presentMajdataScore(card: MajdataCard, rank?: number): ScoreCardPresentation<'majdata-net'> {
  return { key: card.key, gameId: 'majdata-net', title: card.title, route: { songId: card.songId, levelIndex: card.level, params: { gameId: 'majdata-net' } },
    accessibilityLabel: `${card.title} ${MAJDATA_NAMES[card.level]} ${card.difficulty} ${card.dx.toFixed(4)}%`,
    primaryMetric: { key: 'dx', text: `${card.dx.toFixed(4)}%` },
    secondaryMetrics: [{ key: 'rank', label: '排名', text: rank === undefined ? '-' : String(rank) }],
    difficulty: { key: 'difficulty', label: MAJDATA_NAMES[card.level], value: card.difficulty, tone: MAJDATA_NAMES[card.level] }, achievementRows: [] };
}
export function presentMajdataSong(song: MajdataSong): SongRowPresentation<'majdata-net'> {
  return { key: song.id, gameId: 'majdata-net', title: song.title, subtitle: song.artist, accessibilityLabel: `打开歌曲 ${song.title}`,
    route: { songId: song.id, params: { gameId: 'majdata-net' } }, chartBadges: MAJDATA_ORDER.filter(i => song.levels[i]?.trim())
      .map(i => ({ key: `${song.id}:${i}`, label: MAJDATA_NAMES[i], value: song.levels[i], tone: MAJDATA_NAMES[i] })) };
}
