import {
  buildBestImageHtml,
  bestImageWebViewVersion,
  minimumBestImageHeight,
  parseBestImageHeightMessage,
  parseBestImageReadyMessage,
  parseBestImageRuntimeMessage,
  ratingFrameIndex,
} from '@/features/best-image/build-best-image-html';
import type { ScoreRecord } from '@/domain/models';
import { JSDOM } from 'jsdom';

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
    expect(parseBestImageHeightMessage(JSON.stringify({
      type: 'best-image-height', width: 1080, height: 1215,
    }), 1080, 1)).toBe(1215);
  });

  it('reports the Android WebView version from its runtime user agent', () => {
    const userAgent = 'Mozilla/5.0 (Linux; Android 15; wv) AppleWebKit/537.36 Version/4.0 Chrome/132.0.6834.79 Mobile Safari/537.36';
    expect(bestImageWebViewVersion(userAgent)).toBe('132.0.6834.79');
    expect(parseBestImageRuntimeMessage(JSON.stringify({
      type: 'best-image-runtime', width: 1080, userAgent,
    }), 1080)).toEqual({ userAgent, version: '132.0.6834.79' });
    expect(parseBestImageRuntimeMessage(JSON.stringify({
      type: 'best-image-runtime', width: 1440, userAgent,
    }), 1080)).toBeNull();
  });

  it('renders page markers, rank offsets and an asset-stable export signal', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0,
      pageIndex: 1, pageCount: 3,
      scoreSections: [{ id: 'custom-page-2', title: 'AP251', records: [score], rankOffset: 250 }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家' },
    });
    expect(html).toContain('<div class="page-marker page-marker-game">第 2 / 3 页</div>');
    expect(html).toContain('aria-label="第 251 名 示例歌曲"');
    expect(html).toContain("type: 'best-image-ready'");
    expect(html).toContain("type: 'best-image-runtime'");
    expect(html).toContain('window.navigator.userAgent');
    expect(html).toContain('Promise.race([assetReady, assetTimeout])');
    expect(html).toContain('window.setTimeout(resolve, 5000)');
    expect(html).toContain("typeof window.ResizeObserver === 'function'");
    expect(html).not.toContain('window.ReactNativeWebView?.postMessage');
  });

  it('selects all eleven rating frame tiers at their boundaries', () => {
    const boundaries = [0, 1000, 2000, 4000, 7000, 10000, 12000, 13000, 14000, 14500, 15000];
    expect(boundaries.map(ratingFrameIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    boundaries.slice(1).forEach((boundary, index) => {
      expect(ratingFrameIndex(boundary - 1)).toBe(index);
    });
    expect(ratingFrameIndex(14499)).toBe(8);
    expect(ratingFrameIndex(14999)).toBe(9);
    expect(ratingFrameIndex(15000)).toBe(10);
    expect(ratingFrameIndex(16000)).toBe(10);
  });

  it('renders the game head with the ui asset atlas as the default style', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 500,
      scoreSections: [], fontUrl: 'data:font/ttf;base64,Zm9udA==',
      ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=', player: { displayName: '玩家' },
    });
    expect(html).toContain('data-rating-style="game"');
    expect(html).toContain('class="game-head"');
    expect(html).toContain('src="ui/logo.png"');
    expect(html).toContain('src="ui/DXRating_01.png"');
    expect(html).toContain('src="ui/Drating_0.png"');
    expect(html).toContain('src="ui/Drating_5.png"');
    expect(html).toContain('src="ui/Name.png"');
    expect(html).toContain('src="ui/DaniPlate_00.png"');
    expect(html).toContain('class="game-player-name"');
    expect(html).toContain('background-image:url(&quot;ui/b50.png&quot;)');
    expect(html).not.toContain('class="profile-app"');
    expect(html).not.toContain('class="rating rating-game"');
  });

  it('renders the full-width app profile with adaptive identity, stars and fixed glass settings', () => {
    const app = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 14500, ratingStyle: 'app',
      scoreSections: [], fontUrl: 'data:font/ttf;base64,Zm9udA==',
      ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '完整玩家姓名', presentation: { iconId: 10, namePlateId: 11, trophyName: '称号', trophyColor: 'Gold' } },
    });
    expect(app).toContain('class="profile-app"');
    expect(app).toContain('class="profile-banner-app" id="profile-banner"');
    expect(app).toContain('class="identity-card theme-platinum"');
    expect(app).toContain('data-star-count="1"');
    expect(app).toContain('<div class="app-player-name" id="player-name">完整玩家姓名</div>');
    expect(app).toContain('<div class="identity-rating"><span>Rating</span><strong>14500</strong></div>');
    expect(app).toContain('#FFF9EC 0%,#F1DDB1 45%,#FFF8E9 72%,#F5E9CC 100%');
    expect(app).not.toContain('class="rating-frame"');
    expect(app).toContain('.profile-app{position:absolute;z-index:1;left:43px;top:43px;width:994px;');
    expect(app).toContain('.profile-banner-app{--glass-opacity:0;--glass-blur-strong:6px;--glass-blur-medium:4px;--glass-blur-soft:2.3px;');
    expect(app).toContain('height:160px');
    expect(app).toContain('.profile-banner-app .nameplate-image{object-fit:contain;filter:saturate(1.08)}');
    expect(app).not.toContain('transform:scale(1.03)');
    expect(app).toContain('backdrop-filter:blur(var(--glass-blur-strong)) saturate(110%)');
    expect(app).not.toContain('glass-plate-source');
    expect(app).not.toContain('export-capture');
    expect(app).toContain('.profile-glass{position:absolute;z-index:0;left:0;top:0;bottom:0;width:var(--glass-physical-width,60%);overflow:hidden');
    expect(app).toContain("banner.style.setProperty('--glass-physical-width'");
    expect(app).toContain("canvas.style.transform = 'scale(1)'");
    expect(app).toContain('.profile-banner-app .avatar{position:relative;z-index:1;width:130px;height:130px;');
    expect(app).toContain('overflow:visible;border:0;background:transparent');
    expect(app).toContain('object-fit:contain;filter:drop-shadow');
    expect(app).toContain('.profile-app .trophy{display:flex;width:100%;max-width:none;');
    expect(app).toContain('font:800 17px/1.2 system-ui');
    expect(app).toContain('fitAppPlayerName();');
    expect(app).toContain("playerName.style.transform = 'scaleX('");

    const fourStars = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 15750, ratingStyle: 'app',
      scoreSections: [], fontUrl: 'data:font/ttf;base64,Zm9udA==',
      ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=', player: { displayName: '玩家' },
    });
    expect(fourStars).toContain('class="identity-card theme-rainbow"');
    expect(fourStars).toContain('data-star-count="4"');

    const extreme = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 16000, ratingStyle: 'app',
      scoreSections: [], fontUrl: 'data:font/ttf;base64,Zm9udA==',
      ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=', player: { displayName: '玩家' },
    });
    expect(extreme).toContain('#67D9FF 0%,#7FA9FF 24%,#B995FF 52%,#EC8DCF 78%,#FFB0BF 100%');
    expect(extreme).toContain('class="identity-card theme-extreme"');
    expect(extreme).toContain('data-star-count="1"');
  });

  it('measures the adaptive app profile before export readiness', async () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 15750, ratingStyle: 'app', scoreSections: [],
      hiddenStyles: ['icon', 'plate', 'trophy', 'frame'],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '这是一个需要动态缩放但不能被省略的超长玩家姓名' },
    });
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse(window) {
        Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get() {
          if (this.id === 'profile-banner') return 994;
          if (this.id === 'rating-box') return 360;
          return 1080;
        } });
        Object.defineProperty(window.HTMLElement.prototype, 'offsetLeft', { get() {
          return this.id === 'rating-box' ? 22 : 0;
        } });
        Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { get() {
          return this.id === 'rating-box' ? 360 : 1080;
        } });
        Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { get() {
          return this.id === 'rating-box' ? 124 : 0;
        } });
        Object.defineProperty(window.HTMLElement.prototype, 'scrollWidth', { get() {
          return this.id === 'player-name' ? 900 : 0;
        } });
        Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', { get() { return 1440; } });
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const document = dom.window.document;
    const banner = document.getElementById('profile-banner')!;
    const playerName = document.getElementById('player-name')!;
    const geometry = [
      '--glass-local-start', '--glass-local-step-1', '--glass-local-step-2',
    ].map((name) => Number.parseFloat(banner.style.getPropertyValue(name)));
    expect(document.querySelectorAll('#rating-stars polygon')).toHaveLength(4);
    expect(playerName.style.fontSize).toBe('22px');
    expect(playerName.style.transform).toMatch(/^scaleX\(/u);
    expect(banner.style.getPropertyValue('--glass-physical-width')).toMatch(/%$/u);
    expect(geometry[0]).toBeLessThan(geometry[1]!);
    expect(geometry[1]).toBeLessThan(geometry[2]!);
    dom.window.close();
  });

  it('renders escaped player data, the ui asset atlas and verified LXNS asset paths', () => {
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
    expect(html).toContain('Math.min(viewportWidth / OUTPUT_WIDTH, viewportHeight / logicalHeight)');
    expect(html).toContain("type: 'best-image-height'");
    expect(html).toContain('&lt;测试玩家&gt;');
    expect(html).toContain('https://assets2.lxns.net/maimai/icon/200201.png');
    expect(html).toContain('https://assets2.lxns.net/maimai/plate/300101.png');
    expect(html).toContain('class="canvas-background"');
    expect(html).toContain('background-image:url(&quot;ui/b50.png&quot;)');
    expect(html).toContain('background-size:cover;filter:blur(22px)');
    expect(html).toContain('data-layout-content');
    expect(html).toContain("filter((child) => child.hasAttribute('data-layout-content'))");
    expect(html).not.toContain('const children = Array.from(canvas.children)');
    expect(html).toContain('src="ui/logo.png"');
    expect(html).toContain('src="ui/DXRating_11.png"');
    expect(html).toContain('src="ui/Drating_1.png"');
    expect(html).toContain('src="ui/Drating_5.png"');
    expect(html).toContain('src="ui/Shougou_Rainbow.png"');
    expect(html).toContain('data:font/ttf;base64,Zm9udA==');
    expect(html).toContain('过往版本 Best35');
    expect(html).toContain('当前版本 Best15');
    expect(html).toContain('data:image/png;base64,Y2FjaGVkLWphY2tldA==');
    expect(html).toContain('https://assets2.lxns.net/maimai/jacket/11448.png');
    expect(html).toContain('class="game-id"');
    expect(html).toContain('11447');
    expect(html).toContain('100.0000%');
    expect(html).toContain('class="game-ds-rating"');
    expect(html).toContain('13.8 -> 298');    expect(html).toContain('class="game-dxscore"');
    expect(html).toContain('1836/2070');
    expect(html).toContain('src="ui/DX.png"');
    expect(html).toContain('src="ui/SD.png"');
    expect(html).toContain('src="ui/Rank_SSS.png"');
    expect(html).toContain('src="ui/Icon_FCp.png"');
    expect(html).toContain('src="ui/Icon_FSD.png"');
    expect(html).toContain('src="ui/Star_03.png"');
    expect(html).toContain('src="ui/b50_score_master.png"');
    expect(html).toContain('class="game-card"');
    expect(html).toContain('aria-label="第 1 名 示例歌曲"');
    expect(html).toContain('&lt;另一首歌&gt;');
    expect(html).not.toContain('<测试玩家>');
    expect(html).not.toContain('<另一首歌>');
    expect(html).not.toContain('ID11447');
    expect(html).not.toContain('class="rating rating-game"');
    expect(html).not.toContain('class="profile-glass"');
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
    expect(html).toContain('<div class="section-divider"><span>自定义成绩</span></div>');
    expect(html).toContain('class="game-card"');
  });

  it('renders the filter condition subtitle under multi-condition custom titles', () => {
    const html = buildBestImageHtml({
      type: 'custom',
      width: 1080,
      rating: 0,
      scoreSections: [{
        id: 'custom',
        title: '自定义2',
        subtitle: 'MASTER · 寸',
        records: [score],
      }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==',
      ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家' },
    });
    expect(html).toContain('<div class="section-divider"><span>自定义2</span></div>');
    expect(html).toContain('<div class="section-subtitle">MASTER · 寸</div>');
    expect(html).toContain('.section-subtitle{margin:-');
  });

  it('orders evaluation, near miss, FC and FS badges using the app status colors', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0, ratingStyle: 'app',
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
    expect(html).toContain('.score-badge.rate.tone-gold{border:2px solid transparent;background:linear-gradient(rgba(75,78,85,0.16),rgba(75,78,85,0.16)) padding-box');
    expect(html).toContain('linear-gradient(90deg,#FFF3B0,#F6DC7D,#E8BF54,#F6DC7D,#FFF3B0) padding-box');
    expect(html).toContain('linear-gradient(90deg,#84530A,#A46E12,#765006,#A46E12,#84530A) border-box;color:#303136');
    expect(html).toContain('.score-badge.tone-gold{border-color:#D4B45A;background:#D4B45A;color:#4B3A05}');
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
    expect(html).toContain('class="game-dxscore"');
    expect(html).toContain('—/2070');
    expect(html).toContain('1836/—');
    expect(html).not.toContain('aria-label="DXScore');
  });

  it('keeps one-line and three-line song titles inside the fixed jacket-height header', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0, ratingStyle: 'app',
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

  it('uses the ui difficulty card background for Re:MASTER in the game style', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0,
      scoreSections: [{
        id: 'custom', title: '自定义成绩',
        records: [{ ...score, difficulty: 'remaster', levelIndex: 4 }],
      }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家' },
    });
    expect(html).toContain('src="ui/b50_score_remaster.png"');
    expect(html).toContain('class="game-card"');
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
    expect(html).toContain('class="game-head"');
    expect(html).not.toContain('class="game-plate');
    expect(html).not.toContain('/icon/1.png');
    expect(html).not.toContain('/plate/2.png');
    expect(html).not.toContain('/frame/3.png');
    expect(html).not.toContain('Shougou_');
    expect(html).not.toContain('>称号</div>');
    expect(html).toContain('canvas-background-fallback');
  });

  it('collapses disabled app presentation parts and keeps page markers below the profile', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 14000, ratingStyle: 'app', scoreSections: [],
      hiddenStyles: ['icon', 'plate', 'trophy'], pageIndex: 1, pageCount: 3,
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: {
        displayName: '这是一个用于验证不会省略的非常长玩家姓名',
        presentation: { iconId: 1, namePlateId: 2, trophyName: '称号' },
      },
    });
    expect(html).toContain('class="profile-banner-app no-plate"');
    expect(html).not.toContain('class="avatar"');
    expect(html).not.toContain('class="trophy-row"');
    expect(html).not.toContain('/icon/1.png');
    expect(html).not.toContain('/plate/2.png');
    expect(html).not.toContain('>称号</div>');
    expect(html).toContain('<div class="app-page-marker-row"><div class="page-marker app-page-marker">第 2 / 3 页</div></div>');
    expect(html).toContain('height:202px');
    expect(html).toContain('这是一个用于验证不会省略的非常长玩家姓名');
    expect(html).not.toContain('.app-player-name{width:max-content;max-width:100%;overflow:hidden');
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
    expect(html).not.toContain('class="game-cover"');
  });

  it('injects the Noto Sans font, single-line squeezed titles and the footer only for the game style', () => {
    const game = buildBestImageHtml({
      type: 'best50', width: 1080, rating: 15001,
      scoreSections: [{ id: 'b35', title: '过往版本 Best35', records: [score] }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      cnFontUrl: 'maimai-noto.ttf', dataSource: '水鱼查分器',
      player: { displayName: '玩家' },
    });
    expect(game).toContain('data-rating-style="game"');
    expect(game).toContain('@font-face{font-family:MaiCN;src:url("maimai-noto.ttf") format("truetype");font-weight:100 900;font-display:block}');
    expect(game).toContain('font-family:MaiCN,"Noto Sans CJK SC",system-ui,sans-serif');
    expect(game).toContain("const fitTitleSizes = () => {");
    expect(game).toContain("if (RATING_STYLE !== 'game') return;");
    expect(game).toContain("node.style.transform = 'scaleX('");
    expect(game).toContain('const RATING_STYLE = "game";');
    expect(game).toContain('class="image-footer"');
    expect(game).toContain('Designed by Yuri-YuzuChaN &amp; BlueDeer233. Data from 水鱼查分器.');
    expect(game).toContain('<div>Generated by rRanker</div>');
    expect(game).toContain('rgba(60,70,90,.85)');

    const app = buildBestImageHtml({
      type: 'best50', width: 1080, rating: 15001, ratingStyle: 'app',
      scoreSections: [{ id: 'b35', title: '过往版本 Best35', records: [score] }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      cnFontUrl: 'maimai-noto.ttf', dataSource: '水鱼查分器',
      player: { displayName: '玩家' },
    });
    expect(app).not.toContain('MaiCN');
    expect(app).not.toContain('class="image-footer"');
    expect(app).not.toContain('data-rating-style="game"');
    expect(app).not.toContain('fitTitleSizes');
    expect(app).not.toContain('Generated by rRanker');
  });

  it('keeps the existing behavior when no cn font is provided', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0,
      scoreSections: [], fontUrl: 'data:font/ttf;base64,Zm9udA==',
      ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=', player: { displayName: '玩家' },
    });
    expect(html).not.toContain('MaiCN');
    expect(html).not.toContain('image-footer');
    expect(html).toContain('data-rating-style="game"');
    expect(html).not.toContain('RATING_STYLE');
    expect(html).not.toContain('fitTitleSizes');
  });
});
