/** 按会话缓存拆分曲绘：已缓存直接复用，仅返回尚未加载的 songId。 */
export function partitionPhigrosIllustrationCache(
  songIds: readonly string[],
  cache: Readonly<Record<string, string | null>>,
): { next: Record<string, string | null>; missing: string[] } {
  const next: Record<string, string | null> = {};
  const missing: string[] = [];
  for (const id of [...new Set(songIds)]) {
    if (Object.prototype.hasOwnProperty.call(cache, id)) next[id] = cache[id] ?? null;
    else {
      next[id] = null;
      missing.push(id);
    }
  }
  return { next, missing };
}
