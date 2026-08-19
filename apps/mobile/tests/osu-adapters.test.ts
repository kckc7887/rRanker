import {
  buildOsuBeatmapsetSearchQuery,
  formatOsuAccuracy,
  formatOsuPlayTime,
  formatOsuPp,
  normalizeOsuBeatmapsetDetail,
  normalizeOsuCatalogSongs,
  normalizeOsuSnapshot,
  OSU_RULESET_BY_GAME_ID,
  OsuBeatmapsetLookupSchema,
  recommendedOsuStar,
  type OsuBeatmapsetLookupRaw,
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

/** GET /api/v2/beatmapsets/{id} 原始响应（BeatmapsetExtended）：多模式混合 + 转谱。 */
function rawLookup(overrides: Record<string, unknown> = {}): OsuBeatmapsetLookupRaw {
  return {
    id: 3720,
    title: 'Tori no Uta',
    title_unicode: '鳥の詩',
    artist: 'Lix',
    artist_unicode: 'Lia',
    creator: 'James',
    covers: {
      'card@2x': 'https://x/card@2x.jpg',
      card: 'https://x/card.jpg',
      'cover@2x': 'https://x/cover@2x.jpg',
      cover: 'https://x/cover.jpg',
      list: 'https://x/list.jpg',
    },
    status: 'ranked',
    genre: { id: 3, name: '动漫' },
    language: { id: 6, name: '日语' },
    rating: 4.8,
    favourite_count: 1234,
    play_count: 999999,
    tags: 'anime lia vocal  aah ',
    beatmaps: [
      {
        id: 22423, beatmapset_id: 3720, difficulty_rating: 3.56, version: 'Hard',
        mode: 'osu', mode_int: 0, total_length: 129, max_combo: 450, bpm: 180.4,
        cs: 4, drain: 6, accuracy: 8, ar: 9,
        count_circles: 520, count_sliders: 12, count_spinners: 3,
      },
      {
        id: 22424, beatmapset_id: 3720, difficulty_rating: 7.34, version: 'Insane',
        mode: 'osu', mode_int: 0, total_length: 200, max_combo: 900, bpm: 210,
        cs: 3.5, drain: 5, accuracy: 7, ar: 8,
        count_circles: 800, count_sliders: 90, count_spinners: 2,
      },
      { id: 22425, beatmapset_id: 3720, difficulty_rating: 2.1, version: 'Muzukashii', mode: 'taiko', mode_int: 1 },
      { id: 22426, beatmapset_id: 3720, difficulty_rating: 4.4, version: 'Fruits', mode: 'fruits', mode_int: 2 },
      // 转谱：mode 仍标原模式 osu，mode_int 标查询模式 2（catch 下经 mode_int 分支保留）
      { id: 22427, beatmapset_id: 3720, difficulty_rating: 5.5, version: 'Convert', mode: 'osu', mode_int: 2 },
    ],
    ...overrides,
  } as OsuBeatmapsetLookupRaw;
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

describe('osu! 推荐星级 recommendedOsuStar', () => {
  it('standard/catch/mania 同公式 pp^0.4×0.195', () => {
    expect(recommendedOsuStar('osu-standard', 5000)).toBeCloseTo(5000 ** 0.4 * 0.195, 10);
    expect(recommendedOsuStar('osu-standard', 5000)).toBeCloseTo(5.8833, 3);
    expect(recommendedOsuStar('osu-catch', 8000)).toBeCloseTo(8000 ** 0.4 * 0.195, 10);
    expect(recommendedOsuStar('osu-catch', 8000)).toBeCloseTo(7.1002, 3);
    expect(recommendedOsuStar('osu-mania', 2000)).toBeCloseTo(2000 ** 0.4 * 0.195, 10);
    expect(recommendedOsuStar('osu-mania', 2000)).toBeCloseTo(4.078, 3);
  });

  it('taiko 公式 pp^0.35×0.27', () => {
    expect(recommendedOsuStar('osu-taiko', 5000)).toBeCloseTo(5000 ** 0.35 * 0.27, 10);
    expect(recommendedOsuStar('osu-taiko', 5000)).toBeCloseTo(5.3211, 3);
  });

  it('无 pp（null/undefined/0/负数/NaN）回退 1★', () => {
    expect(recommendedOsuStar('osu-standard', null)).toBe(1);
    expect(recommendedOsuStar('osu-standard', undefined)).toBe(1);
    expect(recommendedOsuStar('osu-catch', 0)).toBe(1);
    expect(recommendedOsuStar('osu-taiko', -100)).toBe(1);
    expect(recommendedOsuStar('osu-mania', Number.NaN)).toBe(1);
  });
});

describe('osu! 歌曲详情规范化 normalizeOsuBeatmapsetDetail', () => {
  it('仅保留当前模式并按星数降序；mode_int 匹配转谱分支', () => {
    const standard = normalizeOsuBeatmapsetDetail(rawLookup(), 'osu-standard');
    expect(standard.beatmaps.map((beatmap) => beatmap.id)).toEqual([22424, 22427, 22423]);
    expect(standard.beatmaps.map((beatmap) => beatmap.difficultyRating)).toEqual([7.34, 5.5, 3.56]);

    const taiko = normalizeOsuBeatmapsetDetail(rawLookup(), 'osu-taiko');
    expect(taiko.beatmaps.map((beatmap) => beatmap.id)).toEqual([22425]);

    // catch：Fruits 谱面（mode 匹配）+ Convert 转谱（mode 'osu' 不匹配，经 mode_int=2 分支保留），降序
    const fruits = normalizeOsuBeatmapsetDetail(rawLookup(), 'osu-catch');
    expect(fruits.beatmaps.map((beatmap) => beatmap.id)).toEqual([22427, 22426]);
  });

  it('BeatmapExtended 属性映射到 DTO 字段', () => {
    const detail = normalizeOsuBeatmapsetDetail(rawLookup(), 'osu-standard');
    const hard = detail.beatmaps.find((beatmap) => beatmap.id === 22423);
    expect(hard).toMatchObject({
      id: 22423,
      version: 'Hard',
      difficultyRating: 3.56,
      mode: 'osu',
      totalLength: 129,
      bpm: 180.4,
      cs: 4,
      drain: 6,
      accuracy: 8,
      ar: 9,
      countCircles: 520,
      countSliders: 12,
      countSpinners: 3,
      maxCombo: 450,
    });
  });

  it('数值属性缺失或为 null 时归一化为 null', () => {
    const raw = rawLookup();
    raw.beatmaps = [
      { id: 22423, beatmapset_id: 3720, difficulty_rating: 3.56, version: 'Hard', mode: 'osu' },
      {
        id: 22424, beatmapset_id: 3720, difficulty_rating: 7.34, version: 'Insane', mode: 'osu',
        bpm: null, count_circles: null,
      },
    ];
    const detail = normalizeOsuBeatmapsetDetail(raw, 'osu-standard');
    expect(detail.beatmaps[0]).toMatchObject({
      totalLength: null,
      bpm: null,
      cs: null,
      drain: null,
      accuracy: null,
      ar: null,
      countCircles: null,
      countSliders: null,
      countSpinners: null,
      maxCombo: null,
    });
    expect(detail.beatmaps[1].bpm).toBeNull();
    expect(detail.beatmaps[1].countCircles).toBeNull();
  });

  it('unicode 标题优先、封面 card@2x 优先链、genre/language 取 name、rating/favourite_count 容错、tags 空格拆分', () => {
    const detail = normalizeOsuBeatmapsetDetail(rawLookup(), 'osu-standard');
    expect(detail.beatmapSetId).toBe(3720);
    expect(detail.title).toBe('鳥の詩');
    expect(detail.artist).toBe('Lia');
    expect(detail.creator).toBe('James');
    expect(detail.cover).toBe('https://x/card@2x.jpg');
    expect(detail.status).toBe('ranked');
    expect(detail.genreName).toBe('动漫');
    expect(detail.languageName).toBe('日语');
    expect(detail.rating).toBe(4.8);
    expect(detail.favouriteCount).toBe(1234);
    // 谱师标签：上游空格分隔字符串 → 数组（连续空格/首尾空格剔除）
    expect(detail.tags).toEqual(['anime', 'lia', 'vocal', 'aah']);

    // covers 仅含 list 时按优先链回退
    const listOnly = normalizeOsuBeatmapsetDetail(
      rawLookup({ covers: { list: 'https://x/list.jpg' } }),
      'osu-standard',
    );
    expect(listOnly.cover).toBe('https://x/list.jpg');

    // genre/language/rating/favourite_count 缺失或 null 归一化为 null；tags 缺失/null 为空数组
    const sparse = normalizeOsuBeatmapsetDetail(rawLookup({
      genre: null,
      language: undefined,
      rating: null,
      favourite_count: undefined,
      tags: null,
    }), 'osu-standard');
    expect(sparse.genreName).toBeNull();
    expect(sparse.languageName).toBeNull();
    expect(sparse.rating).toBeNull();
    expect(sparse.favouriteCount).toBeNull();
    expect(sparse.tags).toEqual([]);
  });

  it('beatmaps 缺失时为空数组', () => {
    const detail = normalizeOsuBeatmapsetDetail(
      rawLookup({ beatmaps: undefined }),
      'osu-standard',
    );
    expect(detail.beatmaps).toEqual([]);
  });
});

describe('osu! 成绩判定计数与达成时间', () => {
  it('statistics 各键 null 容错、ended_at 优先', () => {
    const snapshot = normalizeOsuSnapshot(rawUser(), [rawScore({
      statistics: { perfect: 520, great: 12, good: 3, ok: 1, meh: null, miss: undefined },
      ended_at: '2026-01-01T00:00:00.000Z',
      created_at: '2025-12-31T00:00:00.000Z',
    })]);
    expect(snapshot.bestScores[0].statistics).toEqual({
      perfect: 520,
      great: 12,
      good: 3,
      ok: 1,
      meh: null,
      miss: null,
    });
    expect(snapshot.bestScores[0].achievedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('旧缓存无 statistics/ended_at/created_at 时归一化为 null', () => {
    const snapshot = normalizeOsuSnapshot(rawUser(), [rawScore({
      statistics: undefined,
      ended_at: undefined,
      created_at: undefined,
    })]);
    expect(snapshot.bestScores[0].statistics).toBeNull();
    expect(snapshot.bestScores[0].achievedAt).toBeNull();
  });

  it('ended_at 缺失时回退 created_at', () => {
    const snapshot = normalizeOsuSnapshot(rawUser(), [rawScore({
      ended_at: undefined,
      created_at: '2025-06-01T00:00:00.000Z',
    })]);
    expect(snapshot.bestScores[0].achievedAt).toBe('2025-06-01T00:00:00.000Z');
  });
});

describe('OsuBeatmapsetLookupSchema', () => {
  it('合法 beatmapset lookup 响应通过校验', () => {
    const parsed = OsuBeatmapsetLookupSchema.parse(rawLookup());
    expect(parsed.id).toBe(3720);
    expect(parsed.beatmaps).toHaveLength(5);
    expect(parsed.beatmaps?.[0].count_circles).toBe(520);
    expect(parsed.genre?.name).toBe('动漫');
  });

  it('beatmaps 为可选字段，缺失时通过', () => {
    const parsed = OsuBeatmapsetLookupSchema.parse(rawLookup({ beatmaps: undefined }));
    expect(parsed.beatmaps).toBeUndefined();
  });
});
