import { describe, expect, it } from 'vitest';
import type { ScoreRecord } from '@/domain/models';
import {
  buildPhigrosCustomRecords, DEFAULT_PHIGROS_BEST_IMAGE_FILTERS,
  paginatePhigrosBestImageSections,
} from '@/features/phigros-best-image/phigros-best-image';
import {
  buildPhigrosBestImageHtml, escapePhigrosBestImageHtml,
} from '@/features/phigros-best-image/build-phigros-best-image-html';
import { parsePhigrosUser } from '@/domain/phigros';

function record(id: string, overrides: Partial<ScoreRecord> = {}): ScoreRecord {
  return {
    songId: id, title: `歌曲 ${id}`, type: 'SD', levelIndex: 2, level: 'IN', difficulty: 'expert',
    difficultyConstant: 14, achievements: 98, dxScore: 980000, rating: 13, fc: null, fs: null,
    rate: 'v', version: 'current', ...overrides,
  };
}

describe('Phigros 成绩图', () => {
  it('从用户存档读取当前头像与背景曲目', () => {
    const encoder = new TextEncoder();
    const strings = ['hello', 'avatar.Cipher1', 'Song.Background.0'].map((value) => encoder.encode(value));
    const bytes = new Uint8Array(1 + strings.reduce((sum, value) => sum + 1 + value.length, 0));
    let offset = 1;
    for (const value of strings) { bytes[offset] = value.length; offset += 1; bytes.set(value, offset); offset += value.length; }
    expect(parsePhigrosUser(bytes)).toEqual({ selfIntro: 'hello', avatar: 'avatar.Cipher1', backgroundSongId: 'Song.Background' });
  });

  it('自定义按单曲 RKS、Acc 稳定降序，并正确处理筛选边界、评价与 FC', () => {
    const records = [
      record('first', { rating: 12, achievements: 99, rate: 'v', fc: 'ap' }),
      record('second', { rating: 12, achievements: 99, rate: 'v', fc: 'ap' }),
      record('lower', { rating: 11, achievements: 100, rate: 'phi', fc: 'ap' }),
      record('outside', { rating: 15, difficultyConstant: 15.1, achievements: 97.99, fc: null }),
    ];
    const result = buildPhigrosCustomRecords(records, {
      ...DEFAULT_PHIGROS_BEST_IMAGE_FILTERS, quantity: 0, difficulties: [2], minConstant: 14,
      maxConstant: 15, minAcc: 98, maxAcc: 100, rates: ['v'], fcOnly: true,
    });
    expect(result.map((item) => item.songId)).toEqual(['first', 'second']);
  });

  it('数量 0 不限，并在超过 30 张时自动分页', () => {
    const records = Array.from({ length: 61 }, (_, index) => record(String(index), { rating: 100 - index }));
    const selected = buildPhigrosCustomRecords(records, { ...DEFAULT_PHIGROS_BEST_IMAGE_FILTERS, quantity: 0 });
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

  it('转义长文本、缺失素材回退，并输出三档分辨率', () => {
    expect(escapePhigrosBestImageHtml('<玩家 & "测试">')).toBe('&lt;玩家 &amp; &quot;测试&quot;&gt;');
    for (const width of [1080, 1440, 2160] as const) {
      const page = paginatePhigrosBestImageSections([{ id: 'phi3', title: 'Phi3', records: [record('x', { title: '<script>alert(1)</script>' })] }])[0]!;
      const html = buildPhigrosBestImageHtml({
        type: 'best30', width, page, playerName: '<玩家>', rks: '15.4321', challenge: '23', challengeModeRank: 223, syncedAt: '2026-07-22',
        progress: { cleared: [1, 2, 3, 4], fullCombo: [1, 1, 1, 1], phi: [0, 0, 1, 1] },
        titles: { x: '<script>alert(1)</script>' }, illustrations: { x: null }, avatarDataUri: null, backgroundDataUri: null,
      });
      expect(html).toContain(`width:${width}px`);
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('cover-fallback');
      expect(html).toContain('linear-gradient(135deg,#121B2B');
      expect(html).toContain('15.4321');
      expect(html).toContain('class="playerInfo"');
      expect(html).toContain('class="recordInfo"');
      expect(html).toContain('class="song phi_song"');
      expect(html).toContain('class="b19"');
      expect(html).toContain('--challenge:#5c9ce6');
      expect(html).toContain(`zoom:${width / 1200}`);
    }
  });
});
