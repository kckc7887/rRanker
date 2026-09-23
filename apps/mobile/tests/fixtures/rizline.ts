import type { RizlineCatalog, RizlineChart, RizlineSave, RizlineSong } from '@/domain/rizline';

export function rizlineReleasePrefix(resourceVersion = 'r1'): string {
  return `rizline/releases/${resourceVersion}`;
}
export function rizlineChart(overrides: Partial<RizlineChart> = {}): RizlineChart {
  return { id: 'chart.Song.A.0.IN', songId: 'Song.A.0', difficulty: 'IN', level: '12', constant: 12,
    designer: 'Designer', hit: 100, combo: 376, maxScore: 1_002_000, riztimeHit: 20,
    chartPath: `${rizlineReleasePrefix()}/charts/Song.A.0.IN.json`, ...overrides };
}
export function rizlineSong(overrides: Partial<RizlineSong> = {}): RizlineSong {
  return { id: 'Song.A.0', title: 'Song', artist: 'Artist', illustrator: 'Illustrator', packId: 'disc1', packName: 'Disc 1',
    bpm: '150', durationSeconds: 120, updatedAt: null, coverPath: null,
    audioPath: `${rizlineReleasePrefix()}/audio/Song.A.0.m4a`, charts: [rizlineChart()], achievements: [], ...overrides };
}
export function rizlineCatalog(resourceVersion = 'r1'): RizlineCatalog {
  const prefix = rizlineReleasePrefix(resourceVersion);
  return {
    schemaVersion: 1, resourceVersion, gameVersion: '2.7.1',
    songs: [rizlineSong({
      audioPath: `${prefix}/audio/Song.A.0.m4a`,
      charts: [rizlineChart({ chartPath: `${prefix}/charts/Song.A.0.IN.json` })],
    })],
  };
}
export function rizlineCatalogAssetFiles(catalog: RizlineCatalog): { path: string; size: number; sha256: string }[] {
  const paths = new Set<string>();
  for (const song of catalog.songs) {
    if (song.coverPath) paths.add(song.coverPath);
    paths.add(song.audioPath);
    for (const chart of song.charts) paths.add(chart.chartPath);
  }
  return [...paths].map(path => ({ path, size: 1, sha256: path }));
}
export function rizlineSave(overrides: Partial<RizlineSave> = {}): RizlineSave {
  return { userId: 'user-a', username: 'Player A', totalRks: 99.1234,
    myBest: [{ trackAssetId: 'track.Song.A.0', difficultyClassName: 'IN', score: 1_002_000, completeRate: 120, isFullCombo: true }],
    levelsRks: [{ trackId: 'track.Song.A.0', difficultyClassName: 'IN', rks: 142.5 }], ...overrides };
}
