import { LxnsScoreProvider } from '@/providers/lxns-score-provider';

describe('LXNS player presentation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps verified icon, name plate, frame and trophy fields into the player model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      code: 200,
      data: {
        name: '脱敏玩家', rating: 15001, friend_code: 123456789,
        course_rank: 23, class_rank: 25,
        icon: { id: 200201, name: '头像' },
        name_plate: { id: 300101, name: '姓名框' },
        frame: { id: 350101, name: '背景' },
        trophy: { id: 300022, name: '彩虹称号', color: 'Rainbow' },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const provider = new LxnsScoreProvider({
      mode: 'lxns-oauth',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 120_000,
      persistable: true,
    });

    await expect(provider.getPlayer()).resolves.toMatchObject({
      displayName: '脱敏玩家',
      rating: 15001,
      extension: { kind: 'maimai', courseRank: 23 },
      presentation: {
        iconId: 200201,
        namePlateId: 300101,
        frameId: 350101,
        trophyName: '彩虹称号',
        trophyColor: 'Rainbow',
      },
    });
  });

  it('reads the player actual DXScore from dx_score', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      code: 200,
      data: [{
        id: 1447, song_name: '测试歌曲', level: '13+', level_index: 3,
        achievements: 100, fc: 'fcp', fs: 'fsd', dx_score: 1836,
        dx_rating: 298, rate: 'sss', type: 'dx',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const provider = new LxnsScoreProvider({
      mode: 'lxns-oauth', accessToken: 'access-token', refreshToken: 'refresh-token',
      expiresAt: Date.now() + 120_000, persistable: true,
    });

    await expect(provider.getRecords()).resolves.toMatchObject([{ dxScore: 1836 }]);
  });

  it('does not issue the read when the caller aborted during the token refresh', async () => {
    const controller = new AbortController();
    const requestedUrls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes('/oauth/token')) {
        // 刷新在途时调用方取消：轮换结果仍可提交，但这次读取不应该再发出。
        controller.abort(new Error('已取消'));
        return new Response(JSON.stringify({
          access_token: 'fresh-access', refresh_token: 'rotated-refresh', expires_in: 3600,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true, code: 200, data: { name: '玩家', rating: 1, friend_code: 1 } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }));
    const provider = new LxnsScoreProvider({
      mode: 'lxns-oauth', accessToken: 'expired-access', refreshToken: 'cancel-during-refresh',
      expiresAt: Date.now() - 1_000, persistable: true,
    });

    await expect(provider.getPlayer(controller.signal)).rejects.toThrow('已取消');
    expect(requestedUrls.filter((url) => !url.includes('/oauth/token'))).toEqual([]);
  });

  it('maps utage records without exposing their fixed level_index 0 as BASIC', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      code: 200,
      data: [
        {
          id: 834, song_name: '标准 BASIC', level: '4', level_index: 0,
          achievements: 100, dx_score: 1000, dx_rating: 20, type: 'standard',
        },
        {
          id: 100123, song_name: '宴会场', level: '宴', level_index: 0,
          achievements: 100, dx_score: 3000, dx_rating: 0, type: 'utage',
        },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const provider = new LxnsScoreProvider({
      mode: 'lxns-oauth', accessToken: 'access-token', refreshToken: 'refresh-token',
      expiresAt: Date.now() + 120_000, persistable: true,
    });

    await expect(provider.getRecords()).resolves.toMatchObject([
      { songId: '834', title: '标准 BASIC', difficulty: 'basic', type: 'SD' },
      { songId: '100123', title: '宴会场', difficulty: 'utage', type: 'UTAGE', rating: 0 },
    ]);
  });
});
