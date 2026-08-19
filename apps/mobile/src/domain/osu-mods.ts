/**
 * osu! 模组元数据：acronym → 模组类型 → 徽章配色。
 * 数据来源 refer/osu-web-master/database/mods.json（osu/taiko/fruits/mania 四规则集
 * UserPlayable 模组 + SV2 成绩可携带的系统模组；同 acronym 跨规则集类型一致，统一映射）。
 * 配色来源 refer/osu-web-master resources/css/bem/mod.less + colors.less：
 * 背景 = 六类 osu 官方模组色（hsl(hue,100%,70%) 档 / System 黄），
 * 前景 = color-mix(in srgb-linear, black, 背景 10%)，与 osu-web 徽章文字/图标同色。
 */

/** osu! 模组类型（与 osu-web ModType 一致，决定徽章底色）。 */
export type OsuModType =
  | 'DifficultyReduction'
  | 'DifficultyIncrease'
  | 'Conversion'
  | 'Automation'
  | 'Fun'
  | 'System';

/** 模组徽章配色（背景/前景十六进制）。 */
export type OsuModTheme = {
  background: string;
  foreground: string;
};

/** 六类模组配色（精确值按 osu-web color-mix 语义预先计算硬编码）。 */
export const OSU_MOD_THEME_BY_TYPE: Record<OsuModType, OsuModTheme> = {
  // lime hsl(90,100%,70%)
  DifficultyReduction: { background: '#B3FF66', foreground: '#3C591E' },
  // red hsl(360,100%,70%)
  DifficultyIncrease: { background: '#FF6666', foreground: '#591E1E' },
  // purple hsl(255,100%,70%)
  Conversion: { background: '#8C66FF', foreground: '#2D1E59' },
  // blue hsl(200,100%,70%)
  Automation: { background: '#66CCFF', foreground: '#1E4659' },
  // pink hsl(333,100%,70%)
  Fun: { background: '#FF66AB', foreground: '#591E39' },
  // yellow #ffcc22
  System: { background: '#FFCC22', foreground: '#594605' },
};

/** acronym → 模组类型（67 项：66 个 UserPlayable + SV2）。 */
export const OSU_MOD_TYPE_BY_ACRONYM: Record<string, OsuModType> = {
  // DifficultyReduction（降难）
  EZ: 'DifficultyReduction',
  NF: 'DifficultyReduction',
  HT: 'DifficultyReduction',
  DC: 'DifficultyReduction',
  NR: 'DifficultyReduction',
  SR: 'DifficultyReduction',
  // DifficultyIncrease（增难）
  AC: 'DifficultyIncrease',
  BL: 'DifficultyIncrease',
  CO: 'DifficultyIncrease',
  DT: 'DifficultyIncrease',
  FI: 'DifficultyIncrease',
  FL: 'DifficultyIncrease',
  HD: 'DifficultyIncrease',
  HR: 'DifficultyIncrease',
  NC: 'DifficultyIncrease',
  PF: 'DifficultyIncrease',
  SD: 'DifficultyIncrease',
  ST: 'DifficultyIncrease',
  TC: 'DifficultyIncrease',
  // Conversion（转换）
  '1K': 'Conversion',
  '2K': 'Conversion',
  '3K': 'Conversion',
  '4K': 'Conversion',
  '5K': 'Conversion',
  '6K': 'Conversion',
  '7K': 'Conversion',
  '8K': 'Conversion',
  '9K': 'Conversion',
  '10K': 'Conversion',
  AL: 'Conversion',
  CL: 'Conversion',
  CS: 'Conversion',
  DA: 'Conversion',
  DS: 'Conversion',
  HO: 'Conversion',
  IN: 'Conversion',
  MR: 'Conversion',
  RD: 'Conversion',
  SG: 'Conversion',
  SW: 'Conversion',
  TP: 'Conversion',
  // Automation（自动化）
  AP: 'Automation',
  RX: 'Automation',
  SO: 'Automation',
  // Fun（趣味）
  AD: 'Fun',
  AS: 'Fun',
  BM: 'Fun',
  BR: 'Fun',
  BU: 'Fun',
  DF: 'Fun',
  DP: 'Fun',
  FF: 'Fun',
  FR: 'Fun',
  GR: 'Fun',
  MG: 'Fun',
  MF: 'Fun',
  MU: 'Fun',
  NS: 'Fun',
  RP: 'Fun',
  SI: 'Fun',
  SY: 'Fun',
  TR: 'Fun',
  WD: 'Fun',
  WG: 'Fun',
  WU: 'Fun',
  // System（系统）
  TD: 'System',
  SV2: 'System',
};

/** 模组图标文件名（远程图标包按 acronym 小写命名，如 DT → dt.svg）。 */
export function osuModIconFileName(acronym: string): string {
  return `${acronym.toLowerCase()}.svg`;
}

/** 查询模组配色：未知 acronym 返回 null（展示层静默跳过该模组）。 */
export function resolveOsuModTheme(acronym: string): OsuModTheme | null {
  const type = OSU_MOD_TYPE_BY_ACRONYM[acronym];
  return type ? OSU_MOD_THEME_BY_TYPE[type] : null;
}
