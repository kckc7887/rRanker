import { describe, expect, it } from 'vitest';
import type { ScoreRecord } from '@/domain/models';
import {
  appendPhigrosOverflowRecords, paginatePhigrosBestImageSections, sortPhigrosBestImageRecords,
} from '@/features/phigros-best-image/phigros-best-image';
import {
  buildPhigrosBestImageHtml, escapePhigrosBestImageHtml,
} from '@/features/phigros-best-image/build-phigros-best-image-html';
import { parsePhigrosBestImageStylePreferences } from '@/features/phigros-best-image/phigros-best-image-preferences';
import { parsePhigrosUser } from '@/domain/phigros';

function record(id: string, overrides: Partial<ScoreRecord> = {}): ScoreRecord {
  return {
    songId: id, title: `歌曲 ${id}`, type: 'SD', levelIndex: 2, level: 'IN', difficulty: 'expert',
    difficultyConstant: 14, achievements: 98, dxScore: 980000, rating: 13, fc: null, fs: null,
    rate: 'v', version: 'current', ...overrides,
  };
}

describe('Phigros 成绩图', () => {
  it('兼容旧样式偏好，并保存合法的 OVER FLOW 数量', () => {
    expect(parsePhigrosBestImageStylePreferences({
      version: 1, avatar: { mode: 'current' }, background: { mode: 'off' },
    }).overflowCount).toBe(0);
    expect(parsePhigrosBestImageStylePreferences({
      version: 1, avatar: { mode: 'current' }, background: { mode: 'off' }, overflowCount: 9,
    }).overflowCount).toBe(9);
    expect(parsePhigrosBestImageStylePreferences({
      version: 1, avatar: { mode: 'current' }, background: { mode: 'off' }, overflowCount: 4,
    }).overflowCount).toBe(0);
  });

  it('从用户存档读取当前头像与背景曲目', () => {
    const encoder = new TextEncoder();
    const strings = ['hello', 'avatar.Cipher1', 'Song.Background.0'].map((value) => encoder.encode(value));
    const bytes = new Uint8Array(1 + strings.reduce((sum, value) => sum + 1 + value.length, 0));
    let offset = 1;
    for (const value of strings) { bytes[offset] = value.length; offset += 1; bytes.set(value, offset); offset += value.length; }
    expect(parsePhigrosUser(bytes)).toEqual({ showPlayerId: false, selfIntro: 'hello', avatar: 'avatar.Cipher1', backgroundSongId: 'Song.Background' });
  });

  it('自定义不提供筛选，并按单曲 RKS、Acc 稳定降序展示全部成绩', () => {
    const records = [
      record('first', { rating: 12, achievements: 99, rate: 'v', fc: 'ap' }),
      record('second', { rating: 12, achievements: 99, rate: 'v', fc: 'ap' }),
      record('lower', { rating: 11, achievements: 100, rate: 'phi', fc: 'ap' }),
      record('highest', { rating: 15, difficultyConstant: 15.1, achievements: 97.99, fc: null }),
    ];
    const result = sortPhigrosBestImageRecords(records);
    expect(result.map((item) => item.songId)).toEqual(['highest', 'first', 'second', 'lower']);
  });

  it('自定义全部成绩超过 30 张时自动分页', () => {
    const records = Array.from({ length: 61 }, (_, index) => record(String(index), { rating: 100 - index }));
    const selected = sortPhigrosBestImageRecords(records);
    const pages = paginatePhigrosBestImageSections([{ id: 'custom', title: '自定义', records: selected }]);
    expect(pages.map((page) => page.sections.flatMap((section) => section.records).length)).toEqual([30, 30, 1]);
  });

  it('Best30 保留 Phi3 / Best27 顺序', () => {
    const pages = paginatePhigrosBestImageSections([
      { id: 'phi3', title: 'Phi3', records: [record('p1'), record('p2'), record('p3')] },
      { id: 'b27', title: 'Best27', records: [record('b1'), record('b2')] },
    ]);
    expect(pages[0]?.sections.map((section) => section.id)).toEqual(['phi3', 'b27']);
    expect(pages[0]?.sections.flatMap((section) => section.records.map((item) => item.songId))).toEqual(['p1', 'p2', 'p3', 'b1', 'b2']);
  });

  it('Best30 可追加 0、3、6、9 个 OVER FLOW 成绩并保持在同页', () => {
    const phi = [record('p1'), record('p2'), record('p3')];
    const best = Array.from({ length: 27 }, (_, index) => record(`b${index + 1}`, { rating: 20 - index / 10 }));
    const overflow = Array.from({ length: 9 }, (_, index) => record(`o${index + 1}`, { rating: 10 - index / 10 }));
    const sections = appendPhigrosOverflowRecords([
      { id: 'phi3', title: 'Phi3', records: phi },
      { id: 'b27', title: 'Best27', records: best },
    ], [...best, ...overflow], 9);
    const pages = paginatePhigrosBestImageSections(sections, 39);
    expect(sections.at(-1)?.id).toBe('overflow');
    expect(sections.at(-1)?.records.map((item) => item.songId)).toEqual(overflow.map((item) => item.songId));
    expect(pages).toHaveLength(1);
    expect(pages[0]?.sections.flatMap((section) => section.records)).toHaveLength(39);
    expect(appendPhigrosOverflowRecords(sections.slice(0, 2), [...best, ...overflow], 0)).toHaveLength(2);
  });

  it('转义长文本、缺失素材回退，并输出三档分辨率', () => {
    expect(escapePhigrosBestImageHtml('<玩家 & "测试">')).toBe('&lt;玩家 &amp; &quot;测试&quot;&gt;');
    for (const width of [1080, 1440, 2160] as const) {
      const page = paginatePhigrosBestImageSections([{ id: 'phi3', title: 'Phi3', records: [record('x', { title: '<script>alert(1)</script>' })] }])[0]!;
      const html = buildPhigrosBestImageHtml({
        type: 'best30', width, page, playerName: '<玩家>', rks: '15.4321', dataAmount: '386MiB 289KiB', challenge: '23', challengeModeRank: 223, syncedAt: '2026/07/22 12:34:56',
        progress: { cleared: [1, 2, 3, 4], fullCombo: [1, 1, 1, 1], phi: [0, 0, 1, 1] },
        titles: { x: '<script>alert(1)</script>' }, illustrations: { x: null }, accAverages: { 'x:2': { value: 99.1234, kind: 'Higher' } }, avatarDataUri: null, backgroundDataUri: null,
        templateAssets: {
          css: '.song{width:360px}.Rating img{width:100%}',
          dataIconUrl: 'file:///reference/data.png', fallbackBackgroundUrl: 'file:///reference/phigros.png', fallbackAvatarUrl: 'file:///reference/Introduction.png',
          challengeIconUrls: Array.from({ length: 6 }, (_, index) => `file:///reference/${index}.png`),
          ratingIconUrls: { F: 'file:///reference/F.png', FC: 'file:///reference/FC.png', V: 'file:///reference/V.png', phi: 'file:///reference/phi.png' },
          allowingReadAccessToUrl: 'file:///reference/',
        },
      });
      expect(html).toContain('width:1200px');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('<img src="file:///reference/phigros.png" alt="ill">');
      expect(html).toContain('file:///reference/phigros.png');
      expect(html).toContain('15.4321');
      expect(html).toContain('386MiB 289KiB');
      expect(html).toContain('file:///reference/Introduction.png');
      expect(html).toContain('class="playerInfo"');
      expect(html).toContain('class="recordInfo clip-box"');
      expect(html.indexOf('<p>EZ</p>')).toBeLessThan(html.indexOf('<p>HD</p>'));
      expect(html.indexOf('<p>HD</p>')).toBeLessThan(html.indexOf('<p>IN</p>'));
      expect(html.indexOf('<p>IN</p>')).toBeLessThan(html.indexOf('<p>AT</p>'));
      expect(html).toContain('class="song phi_song"');
      expect(html).toContain('class="b19"');
      expect(html).toContain('file:///reference/2.png');
      expect(html).toContain('file:///reference/V.png');
      expect(html).toContain('.song{width:360px}');
      expect(html).toContain(`const W=${width},S=${width / 1200}`);
      expect(html).not.toContain('body{min-height:');
      expect(html).toContain(`name="viewport" content="width=${width}, initial-scale=1`);
      expect(html).toContain('<body><main id="canvas"');
      expect(html).toContain('data-layout-content');
      expect(html).toContain("[...canvas.children].filter(node=>node.hasAttribute('data-layout-content'))");
      expect(html).not.toContain("canvas.querySelectorAll('*')");
      expect(html).toContain("renderScale=S*viewScale");
      expect(html).toContain("Math.abs(vh-last)<3");
      expect(html).toContain('<p>rRanker</p>');
      expect(html).not.toContain('<p>Phi-Plugin</p>');
      expect(html).not.toContain('<div class="ver">');
    }
  });

  it('输出原模板 Avg 条和 OVER FLOW 分隔结构', () => {
    const best = Array.from({ length: 28 }, (_, index) => record(`b${index + 1}`, {
      rating: 16 - index / 100,
      ...(index === 0 ? { achievements: 100, dxScore: 1_000_000, fc: 'ap', rate: 'phi' } : {}),
    }));
    const html = buildPhigrosBestImageHtml({
      type: 'best30', width: 1080,
      page: { id: 'page', pageIndex: 0, pageCount: 1, sections: [{ id: 'b27', title: 'Best27', records: best }] },
      playerName: '尘言', rks: '16.1053', dataAmount: '386MiB 289KiB', challenge: '42', challengeModeRank: 442,
      syncedAt: '2026/03/27 07:19:55', progress: { cleared: [0, 31, 221, 39], fullCombo: [0, 12, 111, 4], phi: [0, 4, 16, 2] },
      titles: Object.fromEntries(best.map((item) => [item.songId, item.title])),
      illustrations: Object.fromEntries(best.map((item) => [item.songId, 'file:///cover.png'])),
      accAverages: { 'b1:2': { value: 98.5004, kind: 'Higher' } },
      templateAssets: {
        css: '.song{width:360px}', dataIconUrl: 'file:///data.png', fallbackBackgroundUrl: 'file:///bg.png', fallbackAvatarUrl: 'file:///avatar.png',
        challengeIconUrls: Array.from({ length: 6 }, (_, index) => `file:///${index}.png`),
        ratingIconUrls: { F: 'file:///F.png', V: 'file:///V.png', FC: 'file:///FC.png', phi: 'file:///phi.png' },
        allowingReadAccessToUrl: 'file:///',
      },
    });
    expect(html).toContain('class="accAvg accHigher clip-box"');
    expect(html).toContain('Avg: 98.5004%');
    expect(html).toContain('class="over_flow"');
    expect(html).toContain('<i>OVER FLOW</i>');
    expect(html).toContain('<div class="suggest"><div class="suggest-tip"></div><p>无法推分</p>');
    expect(html).not.toContain('suggest-kind-null');
  });
});
