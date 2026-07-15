import { LxnsScoreProvider } from '@/providers/lxns-score-provider';

describe('LXNS player presentation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps verified icon, name plate, frame and trophy fields into the player model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      code: 200,
      data: {
        name: '脱敏玩家', rating: 15001, friend_code: 123456789,
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
});
