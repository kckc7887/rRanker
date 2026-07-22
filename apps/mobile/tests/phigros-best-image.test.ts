import { describe, expect, it } from 'vitest';
import type { ScoreRecord } from '@/domain/models';
import {
  appendPhigrosOverflowRecords, paginatePhigrosBestImageSections, sortPhigrosBestImageRecords,
} from '@/features/phigros-best-image/phigros-best-image';
import {
  buildCustomPhigrosBestImageSections, DEFAULT_CUSTOM_PHIGROS_BEST_IMAGE_FILTERS,
  parsePhigrosBestImageAccuracyBound, parsePhigrosBestImageScoreBound,
} from '@/features/phigros-best-image/phigros-best-image-custom';
import {
  buildPhigrosBestImageHtml, escapePhigrosBestImageHtml,
} from '@/features/phigros-best-image/build-phigros-best-image-html';
import { parsePhigrosBestImageStylePreferences } from '@/features/phigros-best-image/phigros-best-image-preferences';
import { parsePhigrosUser } from '@/domain/phigros';
import {
  calculatePhigrosXingAcc, isPhigrosXingAcc, phigrosChartNoteKey,
} from '@/domain/phigros-xing';
import { matchesPhigrosScoreRange } from '@/domain/phigros-filters';

function record(id: string, overrides: Partial<ScoreRecord> = {}): ScoreRecord {
  return {
    songId: id, title: `歌曲 ${id}`, type: 'SD', levelIndex: 2, level: 'IN', difficulty: 'expert',
    difficultyConstant: 14, achievements: 98, dxScore: 980000, rating: 13, fc: null, fs: null,
    rate: 'v', version: 'current', ...overrides,
  };
}

function filters(overrides: Partial<typeof DEFAULT_CUSTOM_PHIGROS_BEST_IMAGE_FILTERS> = {}) {
  return { ...DEFAULT_CUSTOM_PHIGROS_BEST_IMAGE_FILTERS, ...overrides };
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

  it('自定义按单曲 RKS、Acc 稳定降序，并按数量截断', () => {
    const records = [
      record('first', { rating: 12, achievements: 99, rate: 'v', fc: 'ap' }),
      record('second', { rating: 12, achievements: 99, rate: 'v', fc: 'ap' }),
      record('lower', { rating: 11, achievements: 100, rate: 'phi', fc: 'ap' }),
      record('highest', { rating: 15, difficultyConstant: 15.1, achievements: 97.99, fc: null }),
    ];
    const result = sortPhigrosBestImageRecords(records);
    expect(result.map((item) => item.songId)).toEqual(['highest', 'first', 'second', 'lower']);
    const limited = buildCustomPhigrosBestImageSections(records, filters({ quantity: 2 }));
    expect(limited[0]?.title).toBe('Best2');
    expect(limited[0]?.titleNote).toBeUndefined();
    expect(limited[0]?.records.map((item) => item.songId)).toEqual(['highest', 'first']);
  });

  it('自定义分隔线标题按难度、评价与分数 Acc 规则生成', () => {
    const records = [
      record('in-v', { levelIndex: 2, achievements: 99, dxScore: 990_000, fc: null, rate: 'v' }),
      record('at-s', { levelIndex: 3, level: 'AT', difficulty: 'master', achievements: 96, dxScore: 960_000, fc: null, rate: 's' }),
      record('in-phi', { levelIndex: 2, achievements: 100, dxScore: 1_000_000, fc: 'ap', rate: 'phi' }),
      record('at-phi', { levelIndex: 3, level: 'AT', difficulty: 'master', achievements: 100, dxScore: 1_000_000, fc: 'ap', rate: 'phi' }),
    ];
    expect(buildCustomPhigrosBestImageSections(records, filters({ level: 3, quantity: 0 }))[0]?.title).toBe('AT2');
    expect(buildCustomPhigrosBestImageSections(records, filters({ rank: 'phi', quantity: 0 }))[0]?.title).toBe('φ2');
    expect(buildCustomPhigrosBestImageSections(records, filters({ level: 3, rank: 'phi', quantity: 0 }))[0]?.title).toBe('AT φ1');
    const scored = buildCustomPhigrosBestImageSections(records, filters({
      scoreMin: '990000', accuracyMin: '99', quantity: 0,
    }));
    expect(scored[0]?.title).toBe('Best3');
    expect(scored[0]?.titleNote).toBe('分数≥990000 Acc≥99%');
    const html = buildPhigrosBestImageHtml({
      type: 'custom', width: 1080,
      page: { id: 'page', pageIndex: 0, pageCount: 1, sections: scored },
      playerName: '尘言', rks: '16.1053', dataAmount: '1MiB', challenge: '0', challengeModeRank: 0,
      syncedAt: '2026/07/23 01:00:00', progress: { cleared: [0, 0, 0, 0], fullCombo: [0, 0, 0, 0], phi: [0, 0, 0, 0] },
      titles: Object.fromEntries(scored[0]!.records.map((item) => [item.songId, item.title])),
      illustrations: Object.fromEntries(scored[0]!.records.map((item) => [item.songId, null])),
      templateAssets: {
        css: '.song{width:360px}', dataIconUrl: 'file:///data.png', fallbackBackgroundUrl: 'file:///bg.png', fallbackAvatarUrl: 'file:///avatar.png',
        challengeIconUrls: Array.from({ length: 6 }, (_, index) => `file:///${index}.png`),
        ratingIconUrls: { F: 'file:///F.png', V: 'file:///V.png', FC: 'file:///FC.png', phi: 'file:///phi.png' },
        allowingReadAccessToUrl: 'file:///',
      },
    });
    expect(html).toContain('<div class="section-divider"><span>Best3<small class="section-divider-note">（分数≥990000 Acc≥99%）</small></span></div>');
    expect(html).toContain('margin:14px 0 20px');
  });

  it('自定义支持难度、分数、Acc、评价筛选组合', () => {
    const records = [
      record('in-v', { levelIndex: 2, achievements: 99, dxScore: 990_000, fc: null, rate: 'v' }),
      record('at-s', { levelIndex: 3, level: 'AT', difficulty: 'master', achievements: 96, dxScore: 960_000, fc: null, rate: 's' }),
      record('in-phi', { levelIndex: 2, achievements: 100, dxScore: 1_000_000, fc: 'ap', rate: 'phi' }),
      record('hd-low', { levelIndex: 1, level: 'HD', difficulty: 'advanced', achievements: 80, dxScore: 800_000, fc: null, rate: 'a' }),
    ];
    expect(buildCustomPhigrosBestImageSections(records, filters({ level: 2, quantity: 0 }))[0]?.records.map((item) => item.songId))
      .toEqual(['in-phi', 'in-v']);
    expect(buildCustomPhigrosBestImageSections(records, filters({ scoreMin: '990000', quantity: 0 }))[0]?.records.map((item) => item.songId))
      .toEqual(['in-phi', 'in-v']);
    expect(buildCustomPhigrosBestImageSections(records, filters({ accuracyMin: '99', accuracyMax: '99.5', quantity: 0 }))[0]?.records.map((item) => item.songId))
      .toEqual(['in-v']);
    expect(buildCustomPhigrosBestImageSections(records, filters({ rank: 'phi', quantity: 0 }))[0]?.records.map((item) => item.songId))
      .toEqual(['in-phi']);
  });

  it('XING Acc 按物量公式两位小数计算，并用于自定义筛选', () => {
    // N=1000：Good → 99.97；Miss → 99.90
    expect(calculatePhigrosXingAcc(1000, 'good')).toBe(99.97);
    expect(calculatePhigrosXingAcc(1000, 'miss')).toBe(99.9);
    expect(isPhigrosXingAcc(99.97, 1000, 'good')).toBe(true);
    expect(isPhigrosXingAcc(99.9, 1000, 'miss')).toBe(true);
    expect(isPhigrosXingAcc(99.97, 1000, 'miss')).toBe(false);
    expect(isPhigrosXingAcc(100, 1000, 'good')).toBe(false);
    expect(Number.isNaN(calculatePhigrosXingAcc(0, 'good'))).toBe(true);

    const goodAcc = calculatePhigrosXingAcc(500, 'good');
    const missAcc = calculatePhigrosXingAcc(500, 'miss');
    const records = [
      record('xing-good', { achievements: goodAcc, rating: 14 }),
      record('xing-miss', { achievements: missAcc, rating: 13 }),
      record('near', { achievements: Math.round((goodAcc - 0.01) * 100) / 100, rating: 12 }),
      record('no-notes', { achievements: goodAcc, rating: 15, songId: 'missing-notes' }),
    ];
    const noteTotalByKey = {
      [phigrosChartNoteKey('xing-good', 2)]: 500,
      [phigrosChartNoteKey('xing-miss', 2)]: 500,
      [phigrosChartNoteKey('near', 2)]: 500,
    };
    const goodOnly = buildCustomPhigrosBestImageSections(
      records, filters({ xing: 'good', quantity: 0 }), noteTotalByKey,
    );
    expect(goodOnly[0]?.title).toBe('XING-GOOD1');
    expect(goodOnly[0]?.records.map((item) => item.songId)).toEqual(['xing-good']);

    const missOnly = buildCustomPhigrosBestImageSections(
      records, filters({ xing: 'miss', quantity: 0 }), noteTotalByKey,
    );
    expect(missOnly[0]?.title).toBe('XING-MISS1');
    expect(missOnly[0]?.records.map((item) => item.songId)).toEqual(['xing-miss']);

    const withLevel = buildCustomPhigrosBestImageSections(
      records, filters({ xing: 'good', level: 2, quantity: 0 }), noteTotalByKey,
    );
    expect(withLevel[0]?.title).toBe('XING-GOOD IN1');

    expect(buildCustomPhigrosBestImageSections(
      [record('missing-notes', { achievements: goodAcc })],
      filters({ xing: 'good', quantity: 0 }),
      {},
    )[0]?.records).toEqual([]);
  });

  it('分数区间与 Acc/分数解析边界合法', () => {
    expect(matchesPhigrosScoreRange(980_000, '900000', '990000')).toBe(true);
    expect(matchesPhigrosScoreRange(980_000, '990000', '')).toBe(false);
    expect(matchesPhigrosScoreRange(980_000, '990000', '900000')).toBe(false);
    expect(parsePhigrosBestImageScoreBound('')).toBeUndefined();
    expect(parsePhigrosBestImageScoreBound('1000000')).toBe(1_000_000);
    expect(parsePhigrosBestImageScoreBound('1000001')).toBeNull();
    expect(parsePhigrosBestImageAccuracyBound('100')).toBe(100);
    expect(parsePhigrosBestImageAccuracyBound('100.1')).toBeNull();
  });

  it('自定义全部成绩超过 30 张时自动分页', () => {
    const records = Array.from({ length: 61 }, (_, index) => record(String(index), { rating: 100 - index }));
    const selected = buildCustomPhigrosBestImageSections(records, filters({ quantity: 0 }));
    const pages = paginatePhigrosBestImageSections(selected);
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

  it('输出原模板 Avg 条和舞萌式分区分隔线', () => {
    const phi = [record('p1', { rating: 16.2 }), record('p2', { rating: 16.1 }), record('p3', { rating: 16.0 })];
    const best = Array.from({ length: 27 }, (_, index) => record(`b${index + 1}`, {
      rating: 15.9 - index / 100,
      ...(index === 0 ? { achievements: 100, dxScore: 1_000_000, fc: 'ap', rate: 'phi' } : {}),
    }));
    const overflow = [record('o1', { rating: 12.5 }), record('o2', { rating: 12.4 }), record('o3', { rating: 12.3 })];
    const html = buildPhigrosBestImageHtml({
      type: 'best30', width: 1080,
      page: {
        id: 'page', pageIndex: 0, pageCount: 1,
        sections: [
          { id: 'phi3', title: 'Phi3', records: phi },
          { id: 'b27', title: 'Best27', records: best },
          { id: 'overflow', title: 'OVER FLOW', records: overflow },
        ],
      },
      playerName: '尘言', rks: '16.1053', dataAmount: '386MiB 289KiB', challenge: '42', challengeModeRank: 442,
      syncedAt: '2026/03/27 07:19:55', progress: { cleared: [0, 31, 221, 39], fullCombo: [0, 12, 111, 4], phi: [0, 4, 16, 2] },
      titles: Object.fromEntries([...phi, ...best, ...overflow].map((item) => [item.songId, item.title])),
      illustrations: Object.fromEntries([...phi, ...best, ...overflow].map((item) => [item.songId, 'file:///cover.png'])),
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
    expect(html).toContain('<div class="section-divider"><span>Phi3</span></div>');
    expect(html).toContain('<div class="section-divider"><span>Best27</span></div>');
    expect(html).toContain('<div class="section-divider"><span>OVER FLOW</span></div>');
    expect(html).toContain('.section-divider{display:flex');
    expect(html).not.toContain('class="over_flow"');
    expect(html).not.toContain('flow_line');
    expect(html).toContain('<div class="suggest"><div class="suggest-tip"></div><p>无法推分</p>');
    expect(html).not.toContain('suggest-kind-null');
  });
});
