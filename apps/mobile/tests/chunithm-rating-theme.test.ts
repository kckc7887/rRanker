import {
  normalizeChunithmPossession,
  resolveChunithmPossessionTheme,
  resolveChunithmRatingCardTheme,
  resolveChunithmRatingTier,
  resolveChunithmRatingTierBorder,
} from '@/domain/chunithm-rating-theme';
import { resolveDxRatingTheme } from '@/domain/dx-rating-theme';

describe('中二节奏 Rating 霓虹电路主题', () => {
  it.each([
    [3.99, 'green', '#00E676'],
    [4, 'orange', '#FF8A00'],
    [6.99, 'orange', '#FF8A00'],
    [7, 'red', '#FF2D55'],
    [9.99, 'red', '#FF2D55'],
    [10, 'purple', '#B845FF'],
    [11.99, 'purple', '#B845FF'],
    [12, 'bronze', '#D67A31'],
    [13.24, 'bronze', '#D67A31'],
    [13.25, 'silver', '#B8D7E8'],
    [14.49, 'silver', '#B8D7E8'],
    [14.5, 'gold', '#FFD84D'],
    [15.24, 'gold', '#FFD84D'],
    [15.25, 'platinum', '#8DEBFF'],
    [15.99, 'platinum', '#8DEBFF'],
    [16, 'rainbow', '#FF2D95'],
  ])('Rating %s 使用 %s 档', (rating, id, firstColor) => {
    const theme = resolveChunithmRatingTier(rating);
    expect(theme.id).toBe(id);
    expect(theme.colors[0]).toBe(firstColor);
  });

  it('虹档使用完整六色渐变', () => {
    expect(resolveChunithmRatingTier(17).colors).toEqual([
      '#FF2D95', '#FF6B00', '#FFF200', '#00F5A0', '#00C2FF', '#7A5CFF',
    ]);
  });

  it.each([
    ['silver', 'silver'],
    [' GOLD ', 'gold'],
    ['Platinum', 'platinum'],
    ['RAINBOW', 'rainbow'],
    [undefined, 'none'],
    ['', 'none'],
    ['unknown', 'none'],
  ])('领域 %s 归一化为 %s', (value, expected) => {
    expect(normalizeChunithmPossession(value)).toBe(expected);
  });

  it.each([
    ['none', 0],
    ['silver', 13_000],
    ['gold', 14_000],
    ['platinum', 14_500],
    ['rainbow', 15_000],
  ] as const)('%s 领域复用舞萌 %i 档背景且不显示星级', (possession, dxRating) => {
    const theme = resolveChunithmPossessionTheme(possession);
    const dxTheme = resolveDxRatingTheme(dxRating);
    expect(theme).toMatchObject({
      id: `chunithm-possession-${possession}`,
      fillColors: dxTheme.fillColors,
      fillLocations: dxTheme.fillLocations,
      overlayColor: dxTheme.overlayColor,
      textColor: dxTheme.textColor,
      starCount: 0,
    });
  });

  it('空值和未知领域回退舞萌白档背景', () => {
    const white = resolveDxRatingTheme(0);
    expect(resolveChunithmPossessionTheme('unknown')).toMatchObject({
      id: 'chunithm-possession-none',
      fillColors: white.fillColors,
      fillLocations: white.fillLocations,
      textColor: white.textColor,
    });
  });

  it.each([
    [14.5, ['#FFD84D', '#FFD84D'], [0, 1]],
    [16, ['#FF2D95', '#FF6B00', '#FFF200', '#00F5A0', '#00C2FF', '#7A5CFF'], [0, 0.2, 0.4, 0.6, 0.8, 1]],
  ] as const)('档位 %s 描边规范化为 %j', (rating, borderColors, borderLocations) => {
    const border = resolveChunithmRatingTierBorder(rating);
    expect(border.borderColors).toEqual(borderColors);
    expect(border.borderLocations).toEqual(borderLocations);
  });

  it('卡片主题保留领域背景并以档位色描边', () => {
    const theme = resolveChunithmRatingCardTheme(14.5, 'gold');
    const possession = resolveChunithmPossessionTheme('gold');
    expect(theme).toMatchObject({
      id: possession.id,
      fillColors: possession.fillColors,
      fillLocations: possession.fillLocations,
      overlayColor: possession.overlayColor,
      textColor: possession.textColor,
    });
    expect(theme.borderColors).toEqual(['#FFD84D', '#FFD84D']);
    expect(theme.borderLocations).toEqual([0, 1]);
  });

  it('无成绩时卡片主题原样回退领域主题', () => {
    const possession = resolveChunithmPossessionTheme('silver');
    expect(resolveChunithmRatingCardTheme(null, 'silver')).toEqual(possession);
  });
});
