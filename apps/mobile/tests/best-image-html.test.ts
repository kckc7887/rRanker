import { vi } from 'vitest';
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

function viewportWidth(html: string): number {
  const dom = new JSDOM(html);
  const content = dom.window.document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '';
  dom.window.close();
  return Number(/(?:^|,)\s*width\s*=\s*(\d+)/u.exec(content)?.[1]);
}

function renderedImages(html: string): string[] {
  const dom = new JSDOM(html);
  const images = [...dom.window.document.querySelectorAll('img, image')].map(node => node.getAttribute('src') ?? node.getAttribute('href') ?? '');
  for (const node of dom.window.document.querySelectorAll<HTMLElement>('[style]')) {
    for (const match of node.style.backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/gu)) images.push(match[1]);
  }
  dom.window.close();
  return images;
}

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

  it('renders page markers', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0,
      pageIndex: 1, pageCount: 3,
      scoreSections: [{ id: 'custom-page-2', title: 'AP251', records: [score], rankOffset: 250 }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家' },
    });
    expect(renderedText(html)).toContain('第 2 / 3 页');

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
    expect(renderedImages(html)).toContain('ui/DXRating_01.png');
    expect(renderedImages(html)).toContain('ui/Drating_0.png');
    expect(renderedImages(html)).toContain('ui/Drating_5.png');
    expect(renderedImages(html)).toContain('ui/Name.png');
    expect(renderedImages(html)).toContain('ui/DaniPlate_00.png');
    expect(renderedImages(html)).not.toContain('ui/b50.png');
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
    expect(renderedText(app)).toContain('完整玩家姓名');
    expect(renderedText(app)).toContain('14500');
    expect(renderedImages(app)).toContain('ui/header/DaniPlate_23.svg');

  });

  it('uses normalized course-rank assets in the existing game-style slot', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 15000,
      scoreSections: [], fontUrl: 'data:font/ttf;base64,Zm9udA==',
      ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家', extension: { kind: 'maimai', courseRank: 23 } },
    });
    expect(renderedImages(html)).toContain('ui/DaniPlate_23.png');
  });

  it('preserves long titles and waits for font loading before export readiness', async () => {
    let loadFont!: () => void;
    const fontReady = new Promise<void>(resolve => { loadFont = resolve; });
    const messages: { type: string }[] = [];
    const titles = ['春嵐', 'ピポピポ -People People- feat. ななひら', '偉大なる悪魔は実は大天使パトラちゃん様なのだ！'];
    vi.useFakeTimers();
    let dom: JSDOM | undefined;
    try {
      dom = new JSDOM(buildBestImageHtml({
        type: 'best50', width: 1080, rating: 14685, ratingStyle: 'app',
        scoreSections: [{ id: 'b35', title: 'Best35', records: titles.map((title, i) => ({ ...score, songId: String(i), title })) }],
        fontUrl: '', ratingFrameUrl: '', player: { displayName: '玩家' },
        hiddenStyles: ['icon', 'plate', 'trophy', 'frame'],
      }), {
        runScripts: 'dangerously', pretendToBeVisual: true,
        beforeParse(window) {
          Object.defineProperty(window.document, 'fonts', { value: { ready: fontReady } });
          Object.assign(window, { ReactNativeWebView: { postMessage: (value: string) => messages.push(JSON.parse(value)) } });
          Object.defineProperty(window, 'Image', { value: class { complete = true; src = ''; } });
          Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', { value: () => ({
            font: '', measureText(value: string) {
              const size = Number(/ ([\d.]+)px/u.exec(this.font)?.[1] ?? 52);
              return { width: Array.from(value).reduce((n, c) => n + (c.charCodeAt(0) < 128 ? .6 : 1), 0) * size };
            },
          }) });
          Object.defineProperty(window.SVGElement.prototype, 'getBBox', { value: () => ({ x: 0, y: -17, width: 40, height: 20 }) });
        },
      });
      await vi.runAllTimersAsync();
      expect(messages.some(message => message.type === 'best-image-ready')).toBe(false);
      loadFont();
      await vi.runAllTimersAsync();
      expect(messages.some(message => message.type === 'best-image-ready')).toBe(true);
      const text = dom.window.document.body.textContent?.replace(/\s/gu, '') ?? '';
      for (const title of titles) expect(text).toContain(title.replace(/\s/gu, ''));
    } finally {
      dom?.window.close();
      vi.useRealTimers();
    }
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
    expect(viewportWidth(html)).toBe(1080);
    expect(renderedText(html)).toContain('<测试玩家>');
    expect(renderedImages(html)).toContain('https://assets2.lxns.net/maimai/icon/200201.png');
    expect(renderedImages(html)).toContain('https://assets2.lxns.net/maimai/plate/300101.png');
    expect(renderedImages(html)).toContain('https://assets2.lxns.net/maimai/frame/350101.png');
    expect(renderedImages(html)).toContain('ui/DXRating_11.png');
    expect(renderedImages(html)).toContain('ui/Drating_1.png');
    expect(renderedImages(html)).toContain('ui/Drating_5.png');
    expect(renderedImages(html)).toContain('ui/Shougou_Rainbow.png');

    expect(renderedText(html)).toContain('过往版本 Best35');
    expect(renderedText(html)).toContain('当前版本 Best15');
    expect(renderedImages(html)).toContain('data:image/png;base64,Y2FjaGVkLWphY2tldA==');
    expect(renderedImages(html)).toContain('https://assets2.lxns.net/maimai/jacket/11448.png');
    expect(renderedText(html)).toContain('11447');
    expect(renderedText(html)).toContain('100.0000%');
    expect(renderedText(html)).toContain('1836/2070');
    expect(renderedImages(html)).toContain('ui/DX.png');
    expect(renderedImages(html)).toContain('ui/SD.png');
    expect(renderedImages(html)).toContain('ui/Rank_SSS.png');
    expect(renderedImages(html)).toContain('ui/Icon_FCp.png');
    expect(renderedImages(html)).toContain('ui/Icon_FSD.png');
    expect(renderedImages(html)).toContain('ui/Star_01.png');
    expect(renderedImages(html)).toContain('ui/b50_score_master.png');

    expect(renderedText(html)).toContain('<另一首歌>');

  });

  describe.each(['app', 'game'] as const)('%s DX stars', (ratingStyle) => {
    it('renders stars at the exact score thresholds', () => {
      const cases = [
        { dxScore: 0, total: 1000, stars: 0 },
        { dxScore: 2549, total: 1000, stars: 0 },
        { dxScore: 2550, total: 1000, stars: 1 },
        { dxScore: 2699, total: 1000, stars: 1 },
        { dxScore: 2700, total: 1000, stars: 2 },
        { dxScore: 2789, total: 1000, stars: 2 },
        { dxScore: 2790, total: 1000, stars: 3 },
        { dxScore: 2849, total: 1000, stars: 3 },
        { dxScore: 2850, total: 1000, stars: 4 },
        { dxScore: 2909, total: 1000, stars: 4 },
        { dxScore: 2910, total: 1000, stars: 5 },
        { dxScore: 3000, total: 1000, stars: 5 },
        { dxScore: 2007, total: 690, stars: 4 },
        { dxScore: 2008, total: 690, stars: 5 },
      ];
      for (const { dxScore, total, stars } of cases) {
        const html = buildBestImageHtml({
          type: 'best50', width: 1080, rating: 0, ratingStyle,
          scoreSections: [{
            id: 'scores', title: '成绩', records: [{
              ...score, dxScore,
              notes: { tap: total, hold: 0, slide: 0, touch: 0, break: 0, total },
            }],
          }],
          fontUrl: '', ratingFrameUrl: '', player: { displayName: '玩家' },
        });
        expect(renderedImages(html).filter(url => url.includes('/Star_'))).toEqual(stars === 0 ? [] : [
          ratingStyle === 'app' ? `ui/card/Star_0${stars}.svg` : `ui/Star_0${stars}.png`,
        ]);
      }
    });
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
    expect(renderedText(html)).toContain('自定义成绩');
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
    expect(renderedText(html)).toContain('自定义2');
    expect(renderedText(html)).toContain('MASTER · 寸');
  });

  it('renders the selected grade and independent FC and FS badges', () => {
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
    const images = [...dom.window.document.querySelectorAll('img, image')].map(node => node.getAttribute('src') ?? node.getAttribute('href'));
    expect(images).toContain('ui/card/Rank_SS.svg');
    expect(images).toContain('ui/card/Icon_AP.svg');
    expect(images).toContain('ui/card/Icon_FS.svg');
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
    expect(renderedText(html)).toContain('—/2070');
    expect(renderedText(html)).toContain('1836/—');

  });

  it('preserves the full title for font-aware layout', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0, ratingStyle: 'app',
      scoreSections: [{ id: 'custom', title: '自定义成绩', records: [
        score,
        { ...score, songId: '2', title: '这是一个需要完整使用三行空间但不能把下方分隔线挤出去的超长歌曲标题' },
      ] }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家' },
    });
    expect(renderedText(html)).toContain('不能把下方分隔线挤出去');
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
    expect(renderedImages(html)).toContain('ui/b50_score_remaster.png');
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
    expect(renderedText(html)).not.toContain('称号');
  });

  it('hides disabled app presentation parts and preserves page markers', () => {
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
    expect(renderedText(html)).not.toContain('称号');
    expect(renderedText(html)).toContain('第 2 / 3 页');
    expect(renderedText(html)).toContain('这是一个用于验证不会省略的非常长玩家姓名');
  });

  it('does not let WebView retry a jacket that failed during native preloading', () => {
    const html = buildBestImageHtml({
      type: 'custom', width: 1080, rating: 0,
      scoreSections: [{ id: 'custom', title: '自定义成绩', records: [score] }],
      coverUrls: { '11447': null },
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      player: { displayName: '玩家' },
    });
    expect(renderedImages(html)).not.toContain('https://assets2.lxns.net/maimai/jacket/11447.png');
  });

  it('renders the credits for the selected style', () => {
    const game = buildBestImageHtml({
      type: 'best50', width: 1080, rating: 15001,
      scoreSections: [{ id: 'b35', title: '过往版本 Best35', records: [score] }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      cnFontUrl: 'maimai-noto.ttf', dataSource: '水鱼查分器',
      player: { displayName: '玩家' },
    });
    expect(renderedText(game)).toContain('Designed by Yuri-YuzuChaN & BlueDeer233. Data from 水鱼查分器.');
    expect(renderedText(game)).toContain('Generated by rRanker');

    const app = buildBestImageHtml({
      type: 'best50', width: 1080, rating: 15001, ratingStyle: 'app',
      scoreSections: [{ id: 'b35', title: '过往版本 Best35', records: [score] }],
      fontUrl: 'data:font/ttf;base64,Zm9udA==', ratingFrameUrl: 'data:image/png;base64,aW1hZ2U=',
      cnFontUrl: 'maimai-noto.ttf', dataSource: '水鱼查分器',
      player: { displayName: '玩家' },
    });
    expect(renderedText(app)).toContain('Designed by 颍川埃. Data from 水鱼查分器.');
    expect(renderedText(app)).toContain('Generated by rRanker');
    expect(renderedText(app)).not.toContain('Designed by Yuri-YuzuChaN');
  });

});
