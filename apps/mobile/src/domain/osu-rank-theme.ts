/**
 * osu! 评价标签主题（lazer 评价码，用户指定色值）：
 * - X = SS #de31ae、XH = 银 SS（同底色、字色 #def3fa）；
 * - S = S #02b5c3、SH = 银 S（同底色、字色 #def3fa）；
 * - A #88da20、B #ebbd48、C #ff8e5d、D #ff5a5a；
 * - F 底色 #393939、字色 #cc3333；其余白字。
 * 骨架复用公共 GameDifficultyBadge（同 osu-star-theme 模式），
 * 本文件只承载评价色表与展示口径，不做档位匹配。
 */
export type OsuRankTheme = {
  /** 胶囊文案（X/XH → SS、S/SH → S，其余原样）。 */
  label: string;
  background: string;
  border: string;
  text: string;
};

const OSU_RANK_THEMES: Record<string, OsuRankTheme> = {
  X: { label: 'SS', background: '#de31ae', border: '#de31ae', text: '#FFFFFF' },
  XH: { label: 'SS', background: '#de31ae', border: '#de31ae', text: '#def3fa' },
  S: { label: 'S', background: '#02b5c3', border: '#02b5c3', text: '#FFFFFF' },
  SH: { label: 'S', background: '#02b5c3', border: '#02b5c3', text: '#def3fa' },
  A: { label: 'A', background: '#88da20', border: '#88da20', text: '#FFFFFF' },
  B: { label: 'B', background: '#ebbd48', border: '#ebbd48', text: '#FFFFFF' },
  C: { label: 'C', background: '#ff8e5d', border: '#ff8e5d', text: '#FFFFFF' },
  D: { label: 'D', background: '#ff5a5a', border: '#ff5a5a', text: '#FFFFFF' },
  F: { label: 'F', background: '#393939', border: '#393939', text: '#cc3333' },
};

/** 上游评价码 → 标签主题；未知评价返回 null（调用方不渲染标签）。 */
export function resolveOsuRankTheme(rank: string | null | undefined): OsuRankTheme | null {
  if (!rank) return null;
  return OSU_RANK_THEMES[rank] ?? null;
}
