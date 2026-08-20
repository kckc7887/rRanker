/**
 * osu! 难度星数主题：osu-web 官方连续色阶完整移植
 * （refer/osu-web-master/resources/js/utils/beatmap-helper.ts 的
 * difficultyColourSpectrum / difficultyTextColourSpectrum / getDiffColour / getDiffTextColour）。
 *
 * - 背景色：星数 <0.1 灰 #AAAAAA；>=9 黑 #000000；其间按 11 个停靠点连续插值；
 * - 文字色：<6.5 白 #FFFFFF（用户指定，偏离官方黑字）；6.5<=星数<9 黄 #F6F05C；>=9 按文字谱段插值（>=12.4 钳制 #6563DE）；
 * - 插值逐句复刻 d3（d3-interpolate exponential + d3-color formatRgb + d3-scale polymap）：
 *   逐通道 (a^2.2 + t·(b^2.2−a^2.2))^(1/2.2) 后 round；段定位按 bisectRight（恰好等于停靠点时
 *   命中该停靠点 t=0）；文字谱段 range 第 6 个色 #18158E 按 polymap j=min(domain,range)−1
 *   规则不参与插值，保留与上游源一致；
 * - 非有限星数归一为 0（→灰底白字）。
 */
export type OsuStarTheme = {
  background: string;
  border: string;
  text: string;
};

const GAMMA = 2.2;

const STAR_STOPS = {
  domain: [0.1, 1.25, 2, 2.5, 3.3, 4.2, 4.9, 5.8, 6.7, 7.7, 9],
  range: ['#4290FB', '#4FC0FF', '#4FFFD5', '#7CFF4F', '#F6F05C', '#FF8068', '#FF4E6F', '#C645B8', '#6563DE', '#18158E', '#000000'],
} as const;

const STAR_TEXT_STOPS = {
  domain: [9, 9.9, 10.6, 11.5, 12.4],
  // 第 6 个色值按 d3 polymap min(domain,range) 规则不参与插值，保留与 osu-web 源一致。
  range: ['#F6F05C', '#FF8068', '#FF4E6F', '#C645B8', '#6563DE', '#18158E'],
} as const;

function parseHexChannels(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function formatHexChannels(rgb: readonly [number, number, number]): string {
  const channel = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
}

/** d3-interpolate exponential：通道相等恒等，否则 (a^γ+t·(b^γ−a^γ))^(1/γ)。 */
function gammaChannel(a: number, b: number, t: number): number {
  if (b - a === 0) return a;
  return Math.pow(Math.pow(a, GAMMA) + t * (Math.pow(b, GAMMA) - Math.pow(a, GAMMA)), 1 / GAMMA);
}

function interpolateHex(start: string, end: string, t: number): string {
  const a = parseHexChannels(start);
  const b = parseHexChannels(end);
  return formatHexChannels([
    gammaChannel(a[0], b[0], t),
    gammaChannel(a[1], b[1], t),
    gammaChannel(a[2], b[2], t),
  ]);
}

/** d3-scale polymap + clamp：j=min(domain,range)−1 分段，bisectRight 定位段，段内线性 t。 */
function spectrumColour(
  stops: { domain: readonly number[]; range: readonly string[] },
  value: number,
): string {
  const { domain, range } = stops;
  const j = Math.min(domain.length, range.length) - 1;
  const clamped = Math.max(domain[0]!, Math.min(domain[j]!, value));
  let i = 1;
  while (i < j && domain[i]! <= clamped) i += 1;
  const segment = i - 1;
  const t = (clamped - domain[segment]!) / (domain[segment + 1]! - domain[segment]!);
  return interpolateHex(range[segment]!, range[segment + 1]!, t);
}

/** osu-web getDiffColour。 */
function osuDiffColour(rating: number): string {
  if (rating < 0.1) return '#AAAAAA';
  if (rating >= 9) return '#000000';
  return spectrumColour(STAR_STOPS, rating);
}

/** osu-web getDiffTextColour（<6.5 分支按用户指定改白字）。 */
function osuDiffTextColour(rating: number): string {
  if (rating < 6.5) return '#FFFFFF';
  if (rating < 9) return '#F6F05C';
  return spectrumColour(STAR_TEXT_STOPS, rating);
}

export function resolveOsuStarTheme(star: number): OsuStarTheme {
  const rating = Number.isFinite(star) ? star : 0;
  const background = osuDiffColour(rating);
  return { background, border: background, text: osuDiffTextColour(rating) };
}

/** 难度标签文本：仅星数「N★」（两位小数）。 */
export function formatOsuStar(star: number): string {
  return `${star.toFixed(2)}★`;
}
