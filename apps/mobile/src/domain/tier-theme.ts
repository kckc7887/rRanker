/** tier 表按 min 升序；低于首档时返回首档。 */
export type ThemeTier<T> = {
  min: number;
  theme: T;
};

export function resolveTier<T>(tiers: readonly ThemeTier<T>[], value: number): T {
  let matched = tiers[0]!;
  for (const tier of tiers) {
    if (value >= tier.min) matched = tier;
  }
  return matched.theme;
}
