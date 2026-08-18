import { resolveOsuRankTheme } from '@/domain/osu-rank-theme';

describe('osu! 评价标签主题', () => {
  it.each([
    ['X', 'SS', '#de31ae', '#FFFFFF'],
    ['XH', 'SS', '#de31ae', '#def3fa'],
    ['S', 'S', '#02b5c3', '#FFFFFF'],
    ['SH', 'S', '#02b5c3', '#def3fa'],
    ['A', 'A', '#88da20', '#FFFFFF'],
    ['B', 'B', '#ebbd48', '#FFFFFF'],
    ['C', 'C', '#ff8e5d', '#FFFFFF'],
    ['D', 'D', '#ff5a5a', '#FFFFFF'],
    ['F', 'F', '#393939', '#cc3333'],
  ] as const)('评价 %s → 标签 %s 底色 %s 字色 %s', (rank, label, background, text) => {
    const theme = resolveOsuRankTheme(rank);
    expect(theme).not.toBeNull();
    expect(theme!.label).toBe(label);
    expect(theme!.background).toBe(background);
    expect(theme!.border).toBe(background);
    expect(theme!.text).toBe(text);
  });

  it('未知评价与空值返回 null（不渲染标签）', () => {
    expect(resolveOsuRankTheme('G')).toBeNull();
    expect(resolveOsuRankTheme('')).toBeNull();
    expect(resolveOsuRankTheme(null)).toBeNull();
    expect(resolveOsuRankTheme(undefined)).toBeNull();
  });
});
