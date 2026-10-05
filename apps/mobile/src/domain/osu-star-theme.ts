/** 来源：osu-web resources/js/utils/beatmap-helper.ts 的 difficultyColourSpectrum / difficultyTextColourSpectrum。
 * 采用 d3 的 γ=2.2 通道插值；低于 6.5★ 的文字改为白色。 */
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
  /** d3 polymap 使用 min(domain,range)，第六个色值不参与插值。 */
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

/** 通道插值为 (a^γ+t·(b^γ−a^γ))^(1/γ)。 */
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

/** 按 bisectRight 定位插值段，恰好命中停靠点时 t=0。 */
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

function osuDiffColour(rating: number): string {
  if (rating < 0.1) return '#AAAAAA';
  if (rating >= 9) return '#000000';
  return spectrumColour(STAR_STOPS, rating);
}

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

export function formatOsuStar(star: number): string {
  return `${star.toFixed(2)}★`;
}
