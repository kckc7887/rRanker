import {
  buildBestImageHtml,
  minimumBestImageHeight,
  parseBestImageHeightMessage,
  parseBestImageReadyMessage,
  ratingFrameIndex,
} from '@/features/best-image/build-best-image-html';
import type { ScoreRecord } from '@/domain/models';

const score: ScoreRecord = {
  songId: '11447',
  title: '示例歌曲',
  type: 'DX',
  levelIndex: 3,
  level: '13+',
  difficulty: 'master',
  difficultyConstant: 13.8,
  notes: { tap: 300, hold: 80, slide: 200, touch: 20, break: 90, total: 690 },
  achievements: 100,
  dxScore: 1836,
  rating: 298,
  fc: 'fcp',
  fs: 'fsd',
  rate: 'sss',
  version: '示例版本',
};

describe('best image html', () => {
  it('keeps 3:4 as the minimum ratio and accepts measured content height messages', () => {
    expect(minimumBestImageHeight(1080)).toBe(1440);
    expect(parseBestImageHeightMessage(JSON.stringify({
      type: 'best-image-height', width: 1080, height: 2160,
    }), 1080)).toBe(2160);
    expect(parseBestImageHeightMessage(JSON.stringify({
      type: 'best-image-height', width: 1440, height: 2160,
    }), 1080)).toBeNull();
    expect(parseBestImageReadyMessage(JSON.stringify({
      type: 'best-image-ready', width: 1080, height: 2160,
    }), 1080)).toBe(2160);
  });

  it('renders page markers, rank offsets and an asset-stable export signal', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0,
      pageIndex: 1, pageCount: 3,
      scoreSections: [{ id: 'custom-page-2', title: 'AP251', records: [score], rankOffset: 250 }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家' },
    });
    expect(html).toContain('<div class="page-marker">第 2 / 3 页</div>');
    expect(html).toContain('<span class="rank">#251</span>');
    expect(html).toContain("type: 'best-image-ready'");
    expect(html).toContain('Promise.all([document.fonts?.ready ?? Promise.resolve(), ...imageReady])');
  });

  it('selects all eleven rating frame tiers at their boundaries', () => {
    expect([0, 1000, 2000, 4000, 7000, 10000, 12000, 13000, 14000, 15000, 16000]
      .map(ratingFrameIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('renders escaped player data and verified LXNS asset paths', () => {
    const html = buildBestImageHtml({
      type: 'best50', width: 1080, rating: 15001,
      scoreSections: [
        { id: 'b35', title: '过往版本 Best35', records: [score] },
        { id: 'b15', title: '当前版本 Best15', records: [{ ...score, songId: '11448', title: '<另一首歌>', type: 'SD' }] },
      ],
      coverUrls: { '11447': 'data:image/png;base64,Y2FjaGVkLWphY2tldA==' },
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: {
        displayName: '<测试玩家>',
        presentation: {
          iconId: 200201,
          namePlateId: 300101,
          frameId: 350101,
          trophyName: '彩虹称号',
          trophyColor: 'Rainbow',
        },
      },
    });
    expect(html).toContain('width=1080');
    expect(html).toContain('min-height:1440px');
    expect(html).toContain('width:540px;height:87px');
    expect(html).toContain('Math.min(window.innerWidth / OUTPUT_WIDTH, window.innerHeight / logicalHeight)');
    expect(html).toContain("type: 'best-image-height'");
    expect(html).toContain('&lt;测试玩家&gt;');
    expect(html).toContain('https://assets2.lxns.net/maimai/icon/200201.png');
    expect(html).toContain('https://assets2.lxns.net/maimai/plate/300101.png');
    expect(html).toContain('https://assets2.lxns.net/maimai/frame/350101.png');
    expect(html).toContain('class="canvas-background"');
    expect(html).toContain('background-size:cover;filter:blur(22px)');
    expect(html).toContain('data-layout-content');
    expect(html).toContain("filter((child) => child.hasAttribute('data-layout-content'))");
    expect(html).not.toContain('const children = Array.from(canvas.children)');
    expect(html).toContain('class="nameplate-image"');
    expect(html).toContain('object-fit:contain');
    expect(html).toContain('data:font/ttf;base64,Zm9udA==');
    expect(html).toContain('data:image/png;base64,aW1hZ2U=');
    expect(html).toContain('.rating{position:relative;width:113px;height:26px');
    expect(html).toContain('font-weight:900;line-height:1;color:#FFD83D');
    expect(html).toContain('-webkit-text-stroke:1px #090909');
    expect(html).toContain('.player-name{display:inline-flex;width:fit-content;max-width:100%');
    expect(html).toContain('align-items:center;overflow:hidden;padding:0');
    expect(html).toContain('.trophy{display:flex;width:fit-content;max-width:100%');
    expect(html).toContain('border-radius:999px');
    expect(html).toContain('font:400 9px/normal system-ui');
    expect(html).not.toContain('backdrop-filter');
    expect(html).toContain('class="trophy rainbow"');
    expect(html).toContain('background:linear-gradient(90deg,#FF8A96,#78E8A0,#78C8FF,#A89CF8,#F08ADE);color:#4B5563');
    expect(html).not.toContain('#ffc888');
    expect(html).toContain('<span>1</span><span>5</span><span>0</span><span>0</span><span>1</span>');
    expect(html).toContain('grid-template-columns:repeat(5,minmax(0,1fr))');
    expect(html).toContain('过往版本 Best35');
    expect(html).toContain('当前版本 Best15');
    expect(html).toContain('data:image/png;base64,Y2FjaGVkLWphY2tldA==');
    expect(html).toContain('https://assets2.lxns.net/maimai/jacket/11448.png');
    expect(html).toContain('ID11447');
    expect(html).toContain('100.0000%');
    expect(html).toContain('<span>13.8</span><span class="rating-arrow">→</span><strong>298</strong>');
    expect(html).toContain('class="chart-type type-dx"><span>DX</span></span>');
    expect(html).toContain('class="chart-type type-sd"><span>SD</span></span>');
    expect(html).toContain('.chart-type{position:absolute;z-index:2;right:0;top:0;');
    expect(html).toContain('.chart-type.type-sd{border-color:#3286E6;background:#3286E6;color:#FFFFFF}');
    expect(html).toContain('.chart-type.type-dx>span{color:#FF8A00;background:linear-gradient(90deg,#FF8A00,#FFD84A)');
    expect(html).toContain('background:linear-gradient(90deg,#FF8A00,#FFD84A);background-clip:text');
    expect(html).not.toContain('align-self:flex-end;align-items:center;justify-content:center;margin-top:auto');
    expect(html).toContain('<span class="dx-score-label">DXScore</span>');
    expect(html).toContain('aria-label="DXScore 实际 1836，理论 2070"');
    expect(html).toContain('<span class="dx-score-actual">1836</span><span class="dx-score-slash">/</span><span class="dx-score-maximum">2070</span>');
    expect(html).toContain('score-badge rate tone-rainbow">SSS');
    expect(html).toContain('score-badge fc tone-green">FC+');
    expect(html).toContain('score-badge fs tone-gold">FDX');
    expect(html).toContain('.score-card{--card-foreground:#FFFFFF;--card-muted:rgba(255,255,255,.78);--separator-color:rgba(255,255,255,.72);display:flex;');
    expect(html).toContain('justify-content:flex-end;margin-top:auto;padding-top:');
    expect(html).toContain('border-color:#78D29B;background:#78D29B;color:#174C2E');
    expect(html).toContain('border-color:#78B4DC;background:#78B4DC;color:#173F5F');
    expect(html).toContain('class="score-card difficulty-solid" style="--difficulty-color:#7137C8;--card-background:#7137C8"');
    expect(html).toContain('.jacket-shell{position:relative;');
    expect(html).toContain('solid #FFFFFF');
    expect(html).toContain('.score-card-head{display:flex;min-width:0;height:63px;align-items:stretch');
    expect(html).toContain('.song-copy{position:relative;display:flex;min-width:0;height:100%;min-height:0;');
    expect(html).toContain('-webkit-box-orient:vertical;-webkit-line-clamp:3;white-space:normal');
    expect(html).toContain('aria-label="第 1 名 示例歌曲"');
    expect(html).toContain('&lt;另一首歌&gt;');
    expect(html).not.toContain('<测试玩家>');
    expect(html).not.toContain('<另一首歌>');
  });

  it('renders custom scores with their generated BestN divider', () => {
    const html = buildBestImageHtml({
      type: 'custom',
      width: 1080,
      rating: 0,
      scoreSections: [{ id: 'custom', title: '自定义成绩', records: [score] }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==',
      ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家' },
    });
    expect(html).toContain('ID11447');
    expect(html).toContain('<div class="section-divider"><span>自定义成绩</span></div>');
  });

  it('orders evaluation, near miss, FC and FS badges using the app status colors', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0,
      scoreSections: [{
        id: 'custom', title: '自定义成绩',
        records: [{ ...score, achievements: 99.9999, rate: 'ss', fc: 'ap', fs: 'fs' }],
      }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家' },
    });
    const rateIndex = html.indexOf('score-badge rate tone-gold">SS');
    const nearIndex = html.indexOf('score-badge near tone-neutral">寸');
    const fcIndex = html.indexOf('score-badge fc tone-gold">AP');
    const fsIndex = html.indexOf('score-badge fs tone-blue">FS');
    expect(rateIndex).toBeGreaterThan(-1);
    expect(nearIndex).toBeGreaterThan(rateIndex);
    expect(fcIndex).toBeGreaterThan(nearIndex);
    expect(fsIndex).toBeGreaterThan(fcIndex);
    expect(html).toContain('border-color:#9CA3AF;background:#9CA3AF;color:#FFFFFF');
  });

  it('keeps actual and theoretical DXScore in separate slots when either value is missing', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0,
      scoreSections: [{
        id: 'custom', title: '自定义成绩', records: [
          { ...score, songId: '1', dxScore: null },
          { ...score, songId: '2', notes: undefined },
        ],
      }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家' },
    });
    expect(html).toContain('aria-label="DXScore 实际 —，理论 2070"');
    expect(html).toContain('<span class="dx-score-actual">—</span><span class="dx-score-slash">/</span><span class="dx-score-maximum">2070</span>');
    expect(html).toContain('aria-label="DXScore 实际 1836，理论 —"');
    expect(html).toContain('<span class="dx-score-actual">1836</span><span class="dx-score-slash">/</span><span class="dx-score-maximum">—</span>');
  });

  it('keeps one-line and three-line song titles inside the fixed jacket-height header', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0,
      scoreSections: [{ id: 'custom', title: '自定义成绩', records: [
        score,
        { ...score, songId: '2', title: '这是一个需要完整使用三行空间但不能把下方分隔线挤出去的超长歌曲标题' },
      ] }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家' },
    });
    expect(html).toContain('height:63px;align-items:stretch');
    expect(html).toContain('height:100%;min-height:0;flex:1;flex-direction:column');
    expect(html).toContain('-webkit-line-clamp:3');
    expect(html).toContain('不能把下方分隔线挤出去');
    expect(html).not.toContain('.chart-type{display:inline-flex;align-self:flex-end');
  });

  it('uses a light purple card and purple jacket frame for Re:MASTER', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0,
      scoreSections: [{
        id: 'custom', title: '自定义成绩',
        records: [{ ...score, difficulty: 'remaster', levelIndex: 4 }],
      }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家' },
    });
    expect(html).toContain('class="score-card difficulty-remaster" style="--difficulty-color:#A65DB9;--card-background:#F3E8FE"');
    expect(html).toContain('.score-card.difficulty-remaster .jacket-shell{border-color:var(--difficulty-color)');
    expect(html).toContain('--card-foreground:#5F2C78');
  });

  it('can disable player presentation parts without falling back to account assets', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0, scoreSections: [],
      hiddenStyles: ['icon', 'plate', 'trophy', 'frame'],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: {
        displayName: '玩家',
        presentation: { iconId: 1, namePlateId: 2, frameId: 3, trophyName: '称号' },
      },
    });
    expect(html).toContain('class="profile-banner no-plate"');
    expect(html).not.toContain('/icon/1.png');
    expect(html).not.toContain('/plate/2.png');
    expect(html).not.toContain('/frame/3.png');
    expect(html).not.toContain('>称号</div>');
  });

  it('does not let WebView retry a jacket that failed during native preloading', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0,
      scoreSections: [{ id: 'custom', title: '自定义成绩', records: [score] }],
      coverUrls: { '11447': null },
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家' },
    });
    expect(html).not.toContain('https://assets2.lxns.net/maimai/jacket/11447.png');
    expect(html).toContain('<span class="jacket-fallback">♪</span>');
  });
});
