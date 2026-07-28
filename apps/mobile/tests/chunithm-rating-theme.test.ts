import {
  normalizeChunithmPossession,
  resolveChunithmPossessionTheme,
  resolveChunithmRatingTier,
} from '@/domain/chunithm-rating-theme';

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

  it('空值和未知领域使用中性背景', () => {
    expect(resolveChunithmPossessionTheme('unknown')).toMatchObject({
      id: 'chunithm-possession-none',
      fillColors: ['#070B16', '#111C34', '#1B2C4D'],
    });
  });
});
