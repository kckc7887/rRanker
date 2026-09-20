import { rizlineDifficultyIndex, type RizlineChart, type RizlineDifficulty, type RizlineRecord, type RizlineSong } from '@/domain/rizline';

export function rizlineChart(difficulty: RizlineDifficulty, constant: number | null = 12, songId = 'song.a'): RizlineChart {
  return { id: `${songId}.${difficulty}`, songId, difficulty, level: difficulty === 'SP' ? '?' : '12', constant,
    designer: '谱师', hit: 400, combo: 450, maxScore: 1010000, riztimeHit: 100,
    chartPath: `rizline/releases/r1/charts/${songId}.${difficulty}.json` };
}

export function rizlineSong(overrides: Partial<RizlineSong> = {}): RizlineSong {
  return { id: 'song.a', title: '测试歌曲', artist: '曲师', illustrator: '画师', packId: 'main', packName: '主线曲包',
    bpm: '180', durationSeconds: 125, updatedAt: '2026-09-13', coverPath: 'covers/song.a.webp',
    audioPath: 'rizline/releases/r1/audio/song.a.m4a',
    charts: [rizlineChart('EZ', 3), rizlineChart('HD', 8), rizlineChart('IN', 12), rizlineChart('AT', 15)],
    achievements: [{ id: 'achievement.1', title: '初见成就', condition: '完成这首歌曲' }], ...overrides };
}

export function rizlineRecord(chart = rizlineChart('IN'), overrides: Partial<RizlineRecord> = {}): RizlineRecord {
  return { chartId: chart.id, songId: chart.songId, difficulty: chart.difficulty, levelIndex: rizlineDifficultyIndex(chart.difficulty),
    title: '测试歌曲', achievements: 119.123456, score: 1008000, rks: 139.123456, ap: false, ahStatus: 'unknown', chart, ...overrides };
}
