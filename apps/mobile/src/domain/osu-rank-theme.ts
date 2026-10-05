export type OsuRankTheme = {
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

export function resolveOsuRankTheme(rank: string | null | undefined): OsuRankTheme | null {
  if (!rank) return null;
  return OSU_RANK_THEMES[rank] ?? null;
}
