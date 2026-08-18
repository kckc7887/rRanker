import {
  formatOsuStar,
  resolveOsuStarTheme,
} from '@/domain/osu-star-theme';

describe('osu! 星数官方十一档配色', () => {
  it.each([
    [0.10, '#4290FB'],
    [1.24, '#4290FB'],
    [1.25, '#4FC0FF'],
    [1.99, '#4FC0FF'],
    [2.00, '#4FFFD5'],
    [2.49, '#4FFFD5'],
    [2.50, '#7CFF4F'],
    [3.29, '#7CFF4F'],
    [3.30, '#F6F05C'],
    [4.19, '#F6F05C'],
    [4.20, '#FF8068'],
    [4.89, '#FF8068'],
    [4.90, '#FF4E6F'],
    [5.79, '#FF4E6F'],
    [5.80, '#C645B8'],
    [6.69, '#C645B8'],
    [6.70, '#6563DE'],
    [7.69, '#6563DE'],
    [7.70, '#18158E'],
    [8.99, '#18158E'],
    [9.00, '#000000'],
    [11.50, '#000000'],
  ])('星数 %s 命中背景色 %s', (star, color) => {
    expect(resolveOsuStarTheme(star).background).toBe(color);
  });

  it('低于 0.10 或负星数回退首档', () => {
    expect(resolveOsuStarTheme(0).background).toBe('#4290FB');
    expect(resolveOsuStarTheme(-1).background).toBe('#4290FB');
  });

  it('浅色档用深色字、深色档用白字', () => {
    expect(resolveOsuStarTheme(1.30).text).toBe('#0B2545');
    expect(resolveOsuStarTheme(2.10).text).toBe('#0B3D1F');
    expect(resolveOsuStarTheme(3.30).text).toBe('#3D3A00');
    expect(resolveOsuStarTheme(0.10).text).toBe('#FFFFFF');
    expect(resolveOsuStarTheme(7.70).text).toBe('#FFFFFF');
    expect(resolveOsuStarTheme(9.00).text).toBe('#FFFFFF');
  });

  it('标签文本仅星数「N★」两位小数', () => {
    expect(formatOsuStar(3.56467)).toBe('3.56★');
    expect(formatOsuStar(7)).toBe('7.00★');
  });
});
