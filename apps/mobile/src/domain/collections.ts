import { normalizeSongId } from './catalog';
import type { CollectionItem, CollectionKind, PlateRequirement } from './models';

export const COLLECTION_KIND_ORDER: readonly CollectionKind[] = ['icon', 'plate', 'frame', 'trophy'];

export const COLLECTION_KIND_LABEL: Record<CollectionKind, string> = {
  icon: '头像',
  plate: '姓名框',
  frame: '背景',
  trophy: '称号',
};

function requiredSongIds(requirements: readonly PlateRequirement[]): Set<string> {
  const ids = new Set<string>();
  for (const requirement of requirements) {
    for (const songId of requirement.songs) ids.add(normalizeSongId(songId));
  }
  return ids;
}

export function isSongExclusiveCollection(
  item: CollectionItem,
  songId: string | number,
): boolean {
  const target = normalizeSongId(songId);
  const ids = requiredSongIds(item.requirements);
  return ids.size === 1 && ids.has(target);
}

export function collectionsForSong(
  items: readonly CollectionItem[],
  songId: string | number,
): CollectionItem[] {
  const matched = items.filter((item) => isSongExclusiveCollection(item, songId));
  const order = new Map(COLLECTION_KIND_ORDER.map((kind, index) => [kind, index]));
  return matched.sort((left, right) => {
    const kindDelta = (order.get(left.kind) ?? 99) - (order.get(right.kind) ?? 99);
    if (kindDelta !== 0) return kindDelta;
    return left.id - right.id;
  });
}
