import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(base: string | { uri: string }, ...parts: string[]) {
      const root = typeof base === 'string' ? base : base.uri;
      this.uri = [root, ...parts].join('/');
    }
    create() { /* noop */ }
  }
  class File {
    uri: string;
    constructor(base: string | { uri: string }, ...parts: string[]) {
      const root = typeof base === 'string' ? base : base.uri;
      this.uri = [root, ...parts].join('/');
    }
  }
  return { Directory, File, Paths: { document: new Directory('file://', 'document') } };
});

const {
  resolveNeededPhigrosFonts,
  trimPhigrosBestImageCss,
} = await import('@/features/phigros-best-image/phigros-font-coverage');
const { PHIGROS_FONT_MANIFEST } = await import('@/features/phigros-best-image/phigros-font-cache');
const { collectPhigrosBestImageVisibleStrings } = await import('@/features/phigros-best-image/collect-phigros-best-image-visible-strings');

describe('Phigros font coverage selection', () => {
  beforeAll(() => {
    expect(PHIGROS_FONT_MANIFEST.length).toBeGreaterThan(0);
  });

  it('keeps only core fonts for CJK and basic Latin text', () => {
    const needed = resolveNeededPhigrosFonts(['Phi 测试玩家', '光', 'rRanker', '15.4321']);
    expect(needed.map((entry) => entry.name)).toEqual(['phi', 'Aldrich-Regular']);
  });

  it('adds Japanese, Arabic, emoji and math fonts from matching scripts', () => {
    const needed = resolveNeededPhigrosFonts(['テスト', 'مرحبا', 'Hello😀', '∑x']);
    expect(needed.map((entry) => entry.name)).toEqual([
      'phi',
      'Aldrich-Regular',
      'NotoSansArabic',
      'NotoSansJP',
      'NotoColorEmoji-Regular',
      'NotoSansMath-Regular',
    ]);
  });

  it('adds Symbols2 for BMP symbol characters without pulling color emoji', () => {
    const needed = resolveNeededPhigrosFonts(['★♪']);
    expect(needed.map((entry) => entry.name)).toEqual([
      'phi',
      'Aldrich-Regular',
      'NotoSansSymbols2',
    ]);
  });

  it('trims unused @font-face blocks and shortens the body stack', () => {
    const css = `@font-face {
  font-family: "PHI";
  src: url("./font/phi.ttf") format("truetype");
}
@font-face {
  font-family: "NotoSansJP";
  src: url("./font/NotoSansJP.ttf") format("truetype");
}
@font-face {
  font-family: "Aldrich";
  src: url("./font/Aldrich-Regular.ttf") format("truetype");
}
body {
  font-family:
    "PHI", "NotoSansArabic", "NotoSansJP";
  margin: 0;
}`;
    const needed = PHIGROS_FONT_MANIFEST.filter((entry) => entry.core);
    const trimmed = trimPhigrosBestImageCss(css, needed);
    expect(trimmed).toContain('font-family: "PHI"');
    expect(trimmed).toContain('font-family: "Aldrich"');
    expect(trimmed).not.toContain('NotoSansJP');
    expect(trimmed).toMatch(/body \{\s*font-family:\s*"PHI";/u);
  });

  it('collects player name and song titles from best-image pages', () => {
    const strings = collectPhigrosBestImageVisibleStrings({
      type: 'best30',
      playerName: 'プレイヤー',
      rks: '15.0',
      dataAmount: '1MiB',
      challenge: '23',
      syncedAt: '2026/07/22 00:00:00',
      titles: { 'song-1': 'テスト曲' },
      pages: [{
        id: 'page-0',
        pageIndex: 0,
        pageCount: 1,
        sections: [{
          id: 'best',
          title: 'Best',
          records: [{
            songId: 'song-1',
            title: 'fallback',
            type: 'SD',
            levelIndex: 2,
            level: 'IN',
            difficulty: 'expert',
            difficultyConstant: 14,
            achievements: 99.5,
            dxScore: 995000,
            rating: 13.2,
            fc: 'fc',
            fs: null,
            rate: 'v',
            version: 'current',
          }],
        }],
      }],
    });
    expect(strings).toEqual(expect.arrayContaining(['プレイヤー', 'テスト曲', 'rRanker']));
  });
});
