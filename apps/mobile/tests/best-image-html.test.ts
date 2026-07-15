import {
  buildBestImageHtml,
  minimumBestImageHeight,
  parseBestImageHeightMessage,
  ratingFrameIndex,
} from '@/features/best-image/build-best-image-html';

describe('best image html', () => {
  it('keeps 3:4 as the minimum ratio and accepts measured content height messages', () => {
    expect(minimumBestImageHeight(1080)).toBe(1440);
    expect(parseBestImageHeightMessage(JSON.stringify({
      type: 'best-image-height', width: 1080, height: 2160,
    }), 1080)).toBe(2160);
    expect(parseBestImageHeightMessage(JSON.stringify({
      type: 'best-image-height', width: 1440, height: 2160,
    }), 1080)).toBeNull();
  });

  it('selects all eleven rating frame tiers at their boundaries', () => {
    expect([0, 1000, 2000, 4000, 7000, 10000, 12000, 13000, 14000, 15000, 16000]
      .map(ratingFrameIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('renders escaped player data and verified LXNS asset paths', () => {
    const html = buildBestImageHtml({
      type: 'best50', width: 1080, rating: 15001,
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
    expect(html).toContain('font-weight:900;line-height:1;color:#FFD83D');
    expect(html).toContain('-webkit-text-stroke:1px #090909');
    expect(html).toContain('.player-name{display:block;width:fit-content;max-width:100%');
    expect(html).toContain('.trophy{display:flex;width:fit-content;max-width:100%');
    expect(html).toContain('border-radius:999px');
    expect(html).toContain('font:400 11px/1 system-ui');
    expect(html).not.toContain('backdrop-filter');
    expect(html).toContain('class="trophy rainbow"');
    expect(html).toContain('<span>1</span><span>5</span><span>0</span><span>0</span><span>1</span>');
    expect(html).not.toContain('<测试玩家>');
  });
});
