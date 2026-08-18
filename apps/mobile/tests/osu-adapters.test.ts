import {
  buildOsuBeatmapsetSearchQuery,
  formatOsuAccuracy,
  formatOsuPlayTime,
  formatOsuPp,
  normalizeOsuCatalogSongs,
  normalizeOsuSnapshot,
  OSU_RULESET_BY_GAME_ID,
  type OsuBeatmapsetSearchRaw,
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

function rawSearch(overrides: Record<string, unknown> = {}): OsuBeatmapsetSearchRaw {
  return {
    beatmapsets: [
      {
        id: 3720,
        title: 'Tori no Uta',
        title_unicode: '鳥の詩',
        artist: 'Lix',
        artist_unicode: undefined,
        creator: 'James',
        covers: { list: 'https://assets.ppy.sh/beatmaps/3720/covers/list.jpg' },
        status: 'ranked',
        beatmaps: [
          { id: 22423, beatmapset_id: 3720, difficulty_rating: 7.34, version: 'Insane', mode: 'osu', mode_int: 0, status: 'ranked' },
          { id: 22424, beatmapset_id: 3720, difficulty_rating: 3.56, version: 'Hard', mode: 'osu', mode_int: 0, status: 'ranked' },
          { id: 22425, beatmapset_id: 3720, difficulty_rating: 2.1, version: 'Muzukashii', mode: 'taiko', mode_int: 1, status: 'ranked' },
          { id: 22426, beatmapset_id: 3720, difficulty_rating: 4.4, version: 'Fruits', mode: 'fruits', mode_int: 2, status: 'ranked' },
        ],
      },
    ],
    total: 1,
    cursor_string: null,
    recommended_difficulty: 4.72,
    search: { sort: 'ranked_desc' },
    ...overrides,
  } as OsuBeatmapsetSearchRaw;
}

describe('osu! 曲库搜索口径', () => {
  const base = {
    gameId: 'osu-standard' as const,
    general: [] as const,
    status: 'any' as const,
    genre: 0,
    language: 0,
    nsfw: false,
    extras: [] as const,
  };

  it('buildOsuBeatmapsetSearchQuery：m 恒为当前模式且 nsfw 恒携带', () => {
    expect(buildOsuBeatmapsetSearchQuery(base)).toEqual({ m: '0', nsfw: 'false' });
    expect(buildOsuBeatmapsetSearchQuery({ ...base, gameId: 'osu-taiko' })).toEqual({ m: '1', nsfw: 'false' });
    expect(buildOsuBeatmapsetSearchQuery({ ...base, gameId: 'osu-catch' })).toEqual({ m: '2', nsfw: 'false' });
    expect(buildOsuBeatmapsetSearchQuery({ ...base, gameId: 'osu-mania' })).toEqual({ m: '3', nsfw: 'false' });
  });

  it('buildOsuBeatmapsetSearchQuery：常规/其他点号连接，非默认项与 q/cursor 才携带', () => {
    expect(buildOsuBeatmapsetSearchQuery({
      ...base,
      gameId: 'osu-catch',
      general: ['recommended', 'converts'],
      status: 'loved',
      genre: 9,
      language: 6,
      nsfw: true,
      extras: ['video', 'storyboard'],
      q: '  stars>6  ',
      cursor: 'abc',
    })).toEqual({
      m: '2',
      c: 'recommended.converts',
      s: 'loved',
      g: '9',
      l: '6',
      nsfw: 'true',
      e: 'video.storyboard',
      q: 'stars>6',
      cursor_string: 'abc',
    });
  });

  it('buildOsuBeatmapsetSearchQuery：q 为空串时不携带', () => {
    expect(buildOsuBeatmapsetSearchQuery({ ...base, q: '   ' })).toEqual({ m: '0', nsfw: 'false' });
  });

  it('normalizeOsuCatalogSongs：unicode 优先、只留当前模式、难度升序', () => {
    const songs = normalizeOsuCatalogSongs(rawSearch(), 'osu-standard');
    expect(songs).toHaveLength(1);
    expect(songs[0].title).toBe('鳥の詩');
    expect(songs[0].artist).toBe('Lix');
    expect(songs[0].difficultyRatings).toEqual([3.56, 7.34]);
  });

  it('normalizeOsuCatalogSongs：catch 模式取 fruits 谱面（含转谱）', () => {
    const songs = normalizeOsuCatalogSongs(rawSearch(), 'osu-catch');
    expect(songs[0].difficultyRatings).toEqual([4.4]);
  });

  it('normalizeOsuCatalogSongs：mode 字段缺失时按 mode_int 兜底', () => {
    const raw = rawSearch();
    raw.beatmapsets[0].beatmaps = [
      { id: 1, beatmapset_id: 3720, difficulty_rating: 5.5, version: 'Another', mode_int: 0 },
    ];
    const songs = normalizeOsuCatalogSongs(raw, 'osu-standard');
    expect(songs[0].difficultyRatings).toEqual([5.5]);
  });

  it('normalizeOsuCatalogSongs：封面 list@2x → list → card@2x → card 回退', () => {
    const listAt2x = normalizeOsuCatalogSongs(rawSearch({
      beatmapsets: [{ ...rawSearch().beatmapsets[0], covers: { 'list@2x': 'https://x/l2.jpg' } }],
    }), 'osu-standard');
    expect(listAt2x[0].listCover).toBe('https://x/l2.jpg');
    const card = normalizeOsuCatalogSongs(rawSearch({
      beatmapsets: [{ ...rawSearch().beatmapsets[0], covers: { card: 'https://x/c.jpg' } }],
    }), 'osu-standard');
    expect(card[0].listCover).toBe('https://x/c.jpg');
    const none = normalizeOsuCatalogSongs(rawSearch({
      beatmapsets: [{ ...rawSearch().beatmapsets[0], covers: {} }],
    }), 'osu-standard');
    expect(none[0].listCover).toBeNull();
  });

  it('normalizeOsuCatalogSongs：beatmaps 缺失时难度为空数组', () => {
    const raw = rawSearch();
    raw.beatmapsets[0].beatmaps = undefined;
    const songs = normalizeOsuCatalogSongs(raw, 'osu-standard');
    expect(songs[0].difficultyRatings).toEqual([]);
  });
});

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

  it('展示口径：PP 千分位、准确率两位小数、游戏时间', () => {
    expect(formatOsuPp(1175.66)).toBe('1,176');
    expect(formatOsuPp(null)).toBe('—');
    expect(formatOsuAccuracy(0.9684)).toBe('96.84%');
    expect(formatOsuPlayTime(744884)).toBe('游戏时间 8 天 14 小时');
    expect(formatOsuPlayTime(1800)).toBe('游戏时间 0 小时');
    expect(formatOsuPlayTime(null)).toBe('游戏时间 0 小时');
  });
});
