import {
  formatOsuAccuracy,
  formatOsuPlayTime,
  formatOsuPp,
  normalizeOsuSnapshot,
  osuCatalogSongsFromBest,
  OSU_RULESET_BY_GAME_ID,
  type OsuBestScoreRaw,
  type OsuUserResponseRaw,
} from '@/domain/osu';

function rawUser(overrides: Record<string, unknown> = {}): OsuUserResponseRaw {
  return {
    id: 2,
    username: 'peppy',
    avatar_url: 'https://a.ppy.sh/2.png',
    statistics: {
      pp: 1175.66,
      accuracy: 0.968413,
      play_time: 744884,
      play_count: 7769,
      global_rank: 755659,
      country_rank: 15485,
    },
    ...overrides,
  } as OsuUserResponseRaw;
}

function rawScore(overrides: Record<string, unknown> = {}): OsuBestScoreRaw {
  return {
    id: 166715063,
    accuracy: 0.99,
    total_score: 985754,
    max_combo: 450,
    pp: 72.9787,
    rank: 'X',
    beatmap: {
      id: 22423,
      beatmapset_id: 3720,
      difficulty_rating: 3.56467,
      version: 'Hard',
      mode: 'osu',
      status: 'ranked',
      total_length: 129,
    },
    beatmapset: {
      id: 3720,
      title: 'Tori no Uta',
      title_unicode: '鳥の詩',
      artist: 'Lix',
      artist_unicode: undefined,
      creator: 'James',
      covers: { list: 'https://assets.ppy.sh/beatmaps/3720/covers/list.jpg' },
    },
    weight: { percentage: 100, pp: 72.9787 },
    ...overrides,
  } as OsuBestScoreRaw;
}

describe('osu! 数据规范化', () => {
  it('ruleset 映射：catch 的 API 值是 fruits', () => {
    expect(OSU_RULESET_BY_GAME_ID['osu-standard']).toBe('osu');
    expect(OSU_RULESET_BY_GAME_ID['osu-taiko']).toBe('taiko');
    expect(OSU_RULESET_BY_GAME_ID['osu-catch']).toBe('fruits');
    expect(OSU_RULESET_BY_GAME_ID['osu-mania']).toBe('mania');
  });

  it('normalizeOsuSnapshot：优先 unicode 标题、得分取 total_score', () => {
    const snapshot = normalizeOsuSnapshot(rawUser(), [rawScore()]);
    expect(snapshot.player.username).toBe('peppy');
    expect(snapshot.player.pp).toBe(1175.66);
    expect(snapshot.player.playTimeSeconds).toBe(744884);
    expect(snapshot.bestScores[0].beatmapset.title).toBe('鳥の詩');
    expect(snapshot.bestScores[0].beatmapset.artist).toBe('Lix');
    expect(snapshot.bestScores[0].score).toBe(985754);
    expect(snapshot.bestScores[0].accuracy).toBe(0.99);
    expect(snapshot.bestScores[0].pp).toBe(72.9787);
    expect(snapshot.bestScores[0].beatmap.difficultyRating).toBe(3.56467);
    expect(snapshot.bestScores[0].beatmapset.listCover).toBe('https://assets.ppy.sh/beatmaps/3720/covers/list.jpg');
  });

  it('normalizeOsuSnapshot：legacy score 字段回退、pp 为空容错', () => {
    const score = rawScore({ total_score: undefined, score: 985754, pp: null });
    const snapshot = normalizeOsuSnapshot(rawUser(), [score]);
    expect(snapshot.bestScores[0].score).toBe(985754);
    expect(snapshot.bestScores[0].pp).toBeNull();
  });

  it('normalizeOsuSnapshot：缺 beatmap/beatmapset 的条目剔除', () => {
    const snapshot = normalizeOsuSnapshot(rawUser(), [
      rawScore({ beatmapset: null }),
      rawScore({ beatmap: null }),
      rawScore(),
    ]);
    expect(snapshot.bestScores).toHaveLength(1);
  });

  it('normalizeOsuSnapshot：statistics 字段缺失容错', () => {
    const snapshot = normalizeOsuSnapshot(
      rawUser({ statistics: { pp: 0 } }),
      [],
    );
    expect(snapshot.player.pp).toBe(0);
    expect(snapshot.player.accuracy).toBeNull();
    expect(snapshot.player.globalRank).toBeNull();
  });

  it('osuCatalogSongsFromBest 按 beatmapset id 去重', () => {
    const songs = osuCatalogSongsFromBest(
      normalizeOsuSnapshot(rawUser(), [rawScore(), rawScore({ id: 2 })]).bestScores,
    );
    expect(songs).toHaveLength(1);
    expect(songs[0].beatmapSetId).toBe(3720);
  });

  it('展示口径：PP 千分位、准确率两位小数、游戏时间', () => {
    expect(formatOsuPp(1175.66)).toBe('1,176');
    expect(formatOsuPp(null)).toBe('—');
    expect(formatOsuAccuracy(0.9684)).toBe('96.84%');
    expect(formatOsuPlayTime(744884)).toBe('游戏时间 8 天 14 小时');
    expect(formatOsuPlayTime(1800)).toBe('游戏时间 0 小时');
    expect(formatOsuPlayTime(null)).toBe('游戏时间 0 小时');
  });
});
