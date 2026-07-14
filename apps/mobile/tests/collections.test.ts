import { collectionsForSong, isSongExclusiveCollection } from '@/domain/collections';
import type { CollectionItem } from '@/domain/models';

function item(
  partial: Partial<CollectionItem> & Pick<CollectionItem, 'id' | 'kind' | 'name' | 'requirements'>,
): CollectionItem {
  return partial;
}

describe('collectionsForSong', () => {
  const exclusive = item({
    id: 1, kind: 'icon', name: '单曲头像',
    requirements: [{ difficulties: [0, 1, 2, 3], songs: ['1424'] }],
  });
  const multi = item({
    id: 2, kind: 'plate', name: '版本牌',
    requirements: [{ difficulties: [3], fc: 'fc', songs: ['1', '2', '3'] }],
  });
  const empty = item({
    id: 3, kind: 'trophy', name: '无条件',
    requirements: [],
  });
  const dxOffset = item({
    id: 4, kind: 'frame', name: 'DX ID',
    requirements: [{ difficulties: [], songs: ['11424'] }],
  });

  it('keeps items whose required songs are exactly this song', () => {
    expect(isSongExclusiveCollection(exclusive, '1424')).toBe(true);
    expect(collectionsForSong([exclusive, multi, empty], '1424').map((entry) => entry.id)).toEqual([1]);
  });

  it('rejects multi-song plates and empty requirements', () => {
    expect(isSongExclusiveCollection(multi, '1')).toBe(false);
    expect(isSongExclusiveCollection(empty, '1')).toBe(false);
  });

  it('normalizes diving-fish style DX ids before matching', () => {
    expect(isSongExclusiveCollection(dxOffset, '1424')).toBe(true);
    expect(collectionsForSong([dxOffset], 1424)[0]?.id).toBe(4);
  });

  it('orders icon, plate, frame, then trophy', () => {
    const sorted = collectionsForSong([
      item({ id: 10, kind: 'trophy', name: 't', requirements: [{ difficulties: [], songs: ['9'] }] }),
      item({ id: 11, kind: 'frame', name: 'f', requirements: [{ difficulties: [], songs: ['9'] }] }),
      item({ id: 12, kind: 'icon', name: 'i', requirements: [{ difficulties: [], songs: ['9'] }] }),
      item({ id: 13, kind: 'plate', name: 'p', requirements: [{ difficulties: [], songs: ['9'] }] }),
    ], '9');
    expect(sorted.map((entry) => entry.kind)).toEqual(['icon', 'plate', 'frame', 'trophy']);
  });
});
