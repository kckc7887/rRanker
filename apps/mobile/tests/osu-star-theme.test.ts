import {
  formatOsuStar,
  resolveOsuStarTheme,
} from '@/domain/osu-star-theme';

describe('osu! 星数六档配色', () => {
  it.each([
    [0, '#4FC0FF'],
    [1.99, '#4FC0FF'],
    [2.0, '#7CFF4F'],
    [2.69, '#7CFF4F'],
    [2.7, '#f6f05c'],
    [3.99, '#f6f05c'],
    [4.0, '#ff4e6f'],
    [5.29, '#ff4e6f'],
    [5.3, '#c645b8'],
    [6.49, '#c645b8'],
    [6.5, '#6563de'],
    [9.99, '#6563de'],
  ])('星数 %s 命中背景色 %s', (star, color) => {
    expect(resolveOsuStarTheme(star).background).toBe(color);
  });

  it('低于 0 的星数回退首档', () => {
    expect(resolveOsuStarTheme(-1).background).toBe('#4FC0FF');
  });

  it('标签文本仅星数「N★」两位小数', () => {
    expect(formatOsuStar(3.56467)).toBe('3.56★');
    expect(formatOsuStar(7)).toBe('7.00★');
  });
});
