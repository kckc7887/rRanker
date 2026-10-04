import {
  buildBestImageHtml,
  ratingFrameIndex,
} from '@/features/maimai-best-image/build-maimai-best-image-html';
import {
  bestImageWebViewVersion,
  minimumBestImageHeight,
  parseBestImageHeightMessage,
  parseBestImageReadyMessage,
  parseBestImageRuntimeMessage,
} from '@/features/best-image/build-best-image-html';
import type { ScoreRecord } from '@/domain/models';
import { JSDOM } from 'jsdom';

function renderedText(html: string): string {
  const dom = new JSDOM(html);
  dom.window.document.querySelectorAll('script, style').forEach((node) => node.remove());
  const text = dom.window.document.body.textContent ?? '';
  dom.window.close();
  return text;
}

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

  it('renders page markers and rank offsets', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0,
      pageIndex: 1, pageCount: 3,
      scoreSections: [{ id: 'custom-page-2', title: 'AP251', records: [score], rankOffset: 250 }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家' },
    });
    expect(html).toContain('第 2 / 3 页');
    expect(html).toContain('aria-label="第 251 名 示例歌曲"');
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
      ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家', presentation: { iconId: 1, namePlateId: 2 } },
    });
    expect(html).toContain('src="ui/DXRating_01.png"');
    expect(html).toContain('src="ui/Drating_0.png"');
    expect(html).toContain('src="ui/Drating_5.png"');
    expect(html).toContain('src="ui/Name.png"');
    expect(html).toContain('src="ui/DaniPlate_00.png"');
    expect(html).not.toContain('ui/b50.png');
  });

  it('renders the app profile with the player rating and course rank', () => {
    const app = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 14500, ratingStyle: 'app',
      scoreSections: [], fontUrl: 'data:font/ttf;base64,Zm9udA==',
      ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: {
        displayName: '完整玩家姓名',
        extension: { kind: 'maimai', courseRank: 23 },
        presentation: { iconId: 10, namePlateId: 11, trophyName: '称号', trophyColor: 'Gold' },
      },
    });
    expect(app).toContain('完整玩家姓名');
    expect(renderedText(app)).toContain('Rating14500');
    expect(renderedText(app)).toContain('段位认定里皆传');


  });

  it('uses normalized course-rank assets in the existing game-style slot', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 15000,
      scoreSections: [], fontUrl: 'data:font/ttf;base64,Zm9udA==',
      ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家', extension: { kind: 'maimai', courseRank: 23 } },
    });
    expect(html).toContain('src="ui/DaniPlate_23.png"');
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
    expect(html).toContain('&lt;测试玩家&gt;');
    expect(html).toContain('https://assets2.lxns.net/maimai/icon/200201.png');
    expect(html).toContain('https://assets2.lxns.net/maimai/plate/300101.png');
    expect(html).toContain('https://assets2.lxns.net/maimai/frame/350101.png');
        expect(html).toContain('src="ui/DXRating_11.png"');
    expect(html).toContain('src="ui/Drating_1.png"');
    expect(html).toContain('src="ui/Drating_5.png"');
    expect(html).toContain('src="ui/Shougou_Rainbow.png"');
    expect(html).toContain('data:font/ttf;base64,Zm9udA==');
    expect(html).toContain('过往版本 Best35');
    expect(html).toContain('当前版本 Best15');
    expect(html).toContain('data:image/png;base64,Y2FjaGVkLWphY2tldA==');
    expect(html).toContain('https://assets2.lxns.net/maimai/jacket/11448.png');
    expect(html).toContain('11447');
    expect(html).toContain('100.0000%');
    expect(html).toContain('1836/2070');
    expect(html).toContain('src="ui/DX.png"');
    expect(html).toContain('src="ui/SD.png"');
    expect(html).toContain('src="ui/Rank_SSS.png"');
    expect(html).toContain('src="ui/Icon_FCp.png"');
    expect(html).toContain('src="ui/Icon_FSD.png"');
    expect(html).toContain('src="ui/Star_03.png"');
    expect(html).toContain('src="ui/b50_score_master.png"');
    expect(html).toContain('aria-label="第 1 名 示例歌曲"');
    expect(html).toContain('&lt;另一首歌&gt;');
    expect(html).not.toContain('<测试玩家>');
    expect(html).not.toContain('<另一首歌>');
    expect(html).not.toContain('ID11447');
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
    expect(html).toContain('自定义成绩');
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
    expect(html).toContain('自定义2');
    expect(html).toContain('MASTER · 寸');
  });

  it('renders evaluation, near miss, FC and FS badges in their displayed order', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0, ratingStyle: 'app',
      scoreSections: [{
        id: 'custom', title: '自定义成绩',
        records: [{ ...score, achievements: 99.9999, rate: 'ss', fc: 'ap', fs: 'fs' }],
      }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家' },
    });
    const dom = new JSDOM(html);
    expect([...dom.window.document.querySelectorAll('.score-badge')].map(node => node.textContent)).toEqual(['SS', '寸', 'AP', 'FS']);
    dom.window.close();
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
    expect(html).toContain('不能把下方分隔线挤出去');
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
    expect(html).not.toContain('/icon/1.png');
    expect(html).not.toContain('/plate/2.png');
    expect(html).not.toContain('/frame/3.png');
    expect(html).not.toContain('Shougou_');
    expect(html).not.toContain('称号');
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
    expect(html).not.toContain('/icon/1.png');
    expect(html).not.toContain('/plate/2.png');
    expect(html).not.toContain('称号');
    expect(html).toContain('第 2 / 3 页');
    expect(html).toContain('这是一个用于验证不会省略的非常长玩家姓名');
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
  });

  it('renders the credits for the selected style', () => {
    const game = buildBestImageHtml({
      type: 'best50', width: 1080, rating: 15001,
      scoreSections: [{ id: 'b35', title: '过往版本 Best35', records: [score] }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      cnFontUrl: 'maimai-noto.ttf', dataSource: '水鱼查分器',
      player: { displayName: '玩家' },
    });
    expect(game).toContain('Designed by Yuri-YuzuChaN &amp; BlueDeer233. Data from 水鱼查分器.');
    expect(game).toContain('Generated by rRanker');

    const app = buildBestImageHtml({
      type: 'best50', width: 1080, rating: 15001, ratingStyle: 'app',
      scoreSections: [{ id: 'b35', title: '过往版本 Best35', records: [score] }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      cnFontUrl: 'maimai-noto.ttf', dataSource: '水鱼查分器',
      player: { displayName: '玩家' },
    });
    expect(app).toContain('Designed by EgawaHokori. Data from 水鱼查分器.');
    expect(app).toContain('Generated by rRanker');
    expect(app).not.toContain('Designed by Yuri-YuzuChaN');
  });


});
