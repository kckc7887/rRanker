import { encodeDetailTarget } from '@/domain/detail-target';
import type { ExampleRecord, ExampleSong } from '@/domain/example';
import type { ScoreCardPresentation, SongRowPresentation } from '../presentation';

const difficulty = { key: 'insane', label: 'Insane', value: '27.5', tone: 'example', effect: 'gradient' as const };

export function presentExampleRecord(record: ExampleRecord, position?: number): ScoreCardPresentation<'example'> {
  return {
    key: record.song.id, gameId: 'example', route: encodeDetailTarget({ game: 'example', songId: record.song.id, levelIndex: 0 }),
    title: record.song.title, position, accessibilityLabel: record.song.title,
    primaryMetric: { key: 'score', label: 'Score', text: String(record.score), effect: 'flowing-gradient' },
    secondaryMetrics: [{ key: 'rating', label: 'Rating', text: String(record.rating) }], difficulty,
    grade: { key: 'ex', label: 'EX', tone: 'rainbow', effect: 'gradient' }, achievementRows: [],
  };
}

export function presentExampleSong(song: ExampleSong): SongRowPresentation<'example'> {
  return { key: song.id, gameId: 'example', route: encodeDetailTarget({ game: 'example', songId: song.id }),
    title: song.title, subtitle: `ID${song.id} · ${song.artist}`, accessibilityLabel: song.title, chartBadges: [difficulty] };
}
