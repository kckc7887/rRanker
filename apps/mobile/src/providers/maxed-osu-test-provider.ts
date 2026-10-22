import type {
  OsuBeatmapDetail,
  OsuBeatmapsetDetail,
  OsuBestScore,
  OsuSnapshot,
} from '@/domain/osu';
import { generatedSource } from './generated-source';

export function maxedOsuPlayerSnapshot(displayName = '示例账号'): OsuSnapshot {
  return {
    data: {
      player: {
        userId: 0,
        username: displayName,
        avatarUrl: null,
        pp: 40_000,
        accuracy: 100,
        playTimeSeconds: null,
        playCount: null,
        globalRank: null,
      },
      bestScores: [],
    },
    source: generatedSource(),
  };
}

export function buildMaxedOsuScore(song: OsuBeatmapsetDetail, beatmap: OsuBeatmapDetail): OsuBestScore {
  return {
    id: beatmap.id,
    score: 1_000_000,
    accuracy: 1,
    maxCombo: beatmap.maxCombo,
    pp: null,
    rank: 'X',
    beatmap: {
      id: beatmap.id,
      beatmapSetId: song.beatmapSetId,
      difficultyRating: beatmap.difficultyRating,
      version: beatmap.version,
    },
    beatmapset: {
      id: song.beatmapSetId,
      title: song.title,
      artist: song.artist,
      creator: song.creator,
      listCover: song.cover,
    },
    statistics: null,
    mods: [],
    achievedAt: null,
  };
}

export function buildMaxedOsuBeatmapsetScores(song: OsuBeatmapsetDetail): OsuBestScore[] {
  return song.beatmaps.map((beatmap) => buildMaxedOsuScore(song, beatmap));
}

export function buildMaxedOsuBestScores(songs: readonly OsuBeatmapsetDetail[]): OsuBestScore[] {
  return songs.flatMap((song) => {
    const highest = song.beatmaps.reduce<OsuBeatmapDetail | undefined>((current, beatmap) => (
      current === undefined || beatmap.difficultyRating > current.difficultyRating ? beatmap : current
    ), undefined);
    return highest ? [buildMaxedOsuScore(song, highest)] : [];
  });
}
