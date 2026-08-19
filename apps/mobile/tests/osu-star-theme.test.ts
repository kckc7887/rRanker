import { formatOsuStar, resolveOsuStarTheme } from '@/domain/osu-star-theme';

describe('osu! 星数 osu-web 官方连续色阶', () => {
  it.each([
    [0.10, '#4290FB'],
    [1.25, '#4FC0FF'],
    [2.00, '#4FFFD5'],
    [2.50, '#7CFF4F'],
    [3.30, '#F6F05C'],
    [4.20, '#FF8068'],
    [4.90, '#FF4E6F'],
    [5.80, '#C645B8'],
    [6.70, '#6563DE'],
    [7.70, '#18158E'],
  ])('停靠点星数 %s 背景色精确命中 %s', (star, color) => {
    expect(resolveOsuStarTheme(star).background).toBe(color);
  });

  it.each([
    [0.675, '#49AAFD'],
    [0.9, '#4BB3FE'],
    [1.625, '#4FE2EB'],
    [2.25, '#68FFA3'],
    [2.9, '#C5F856'],
    [3.56, '#F9D760'],
    [3.75, '#FBC262'],
    [4.55, '#FF6B6C'],
    [5.35, '#E54A99'],
    [6.25, '#9F56CC'],
    [6.5, '#825DD6'],
    [7.2, '#4B49BB'],
    [7.34, '#4240B0'],
    [8.35, '#120F68'],
    [8.99, '#030210'],
  ])('段内星数 %s 按伽马2.2插值为背景色 %s', (star, color) => {
    expect(resolveOsuStarTheme(star).background).toBe(color);
  });

  it('低于 0.10、负数与非有限星数回退灰底', () => {
    expect(resolveOsuStarTheme(0).background).toBe('#AAAAAA');
    expect(resolveOsuStarTheme(-1).background).toBe('#AAAAAA');
    expect(resolveOsuStarTheme(0.05).background).toBe('#AAAAAA');
    expect(resolveOsuStarTheme(Number.NaN).background).toBe('#AAAAAA');
  });

  it('星数 >=9 恒为黑底', () => {
    expect(resolveOsuStarTheme(9).background).toBe('#000000');
    expect(resolveOsuStarTheme(11.5).background).toBe('#000000');
    expect(resolveOsuStarTheme(100).background).toBe('#000000');
  });

  it('文字色官方规则：<6.5 黑字、6.5–9 黄字、>=9 黄→紫谱段（>=12.4 钳制）', () => {
    expect(resolveOsuStarTheme(0.1).text).toBe('#000000');
    expect(resolveOsuStarTheme(3.56).text).toBe('#000000');
    expect(resolveOsuStarTheme(5.8).text).toBe('#000000');
    expect(resolveOsuStarTheme(6.49).text).toBe('#000000');
    expect(resolveOsuStarTheme(6.5).text).toBe('#F6F05C');
    expect(resolveOsuStarTheme(7.34).text).toBe('#F6F05C');
    expect(resolveOsuStarTheme(8.99).text).toBe('#F6F05C');
    expect(resolveOsuStarTheme(9).text).toBe('#F6F05C');
    expect(resolveOsuStarTheme(9.45).text).toBe('#FBC262');
    expect(resolveOsuStarTheme(9.5).text).toBe('#FBBC63');
    expect(resolveOsuStarTheme(9.9).text).toBe('#FF8068');
    expect(resolveOsuStarTheme(10.6).text).toBe('#FF4E6F');
    expect(resolveOsuStarTheme(11.5).text).toBe('#C645B8');
    expect(resolveOsuStarTheme(12.4).text).toBe('#6563DE');
    expect(resolveOsuStarTheme(13).text).toBe('#6563DE');
  });

  it('描边色恒等于背景色', () => {
    const theme = resolveOsuStarTheme(3.56);
    expect(theme.border).toBe(theme.background);
  });

  it('标签文本仅星数「N★」两位小数', () => {
    expect(formatOsuStar(3.56467)).toBe('3.56★');
    expect(formatOsuStar(7)).toBe('7.00★');
  });
});
