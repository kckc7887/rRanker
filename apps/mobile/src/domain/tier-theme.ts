/**
 * 档位主题公共解析：dx-rating-theme / chunithm-rating-theme / phigros-challenge-theme
 * 共用的「{min, theme}[] 升序 tier 表 + 遍历找最后一个 min 不超过 value 的档位」算法。
 *
 * 边界语义（与三处既有实现逐值一致）：
 * - tier 表须按 min 升序；恰好等于 min 时命中该档（>= 含等号）；
 * - value 低于最低档时回退首档（调用方负责把 value 归一化到不低于首档 min，如 max(0, ...)）；
 * - value 高于最高档时返回最高档；
 * - value 的归一化（floor、非有限数防御）由调用方负责，本函数只做匹配。
 */
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
