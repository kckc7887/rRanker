import { TrophyBadge } from '../TrophyBadge';
import { Text, View } from 'react-native';
import type { ChunithmCollectionKind } from '@/domain/chunithm-collections';
import { CollectionArtwork } from '@/components/CollectionImage';

export const CHUNITHM_ASSET_ROOT = 'https://assets2.lxns.net/chunithm';

/** LXNS 前端名牌比例为 576/228。 */
const PLATE_ASPECT = 576 / 228;
/** LXNS 前端称号比例为 608/74。 */
const TROPHY_IMAGE_ASPECT = 608 / 74;

export function ChunithmCollectionImage({
  kind,
  collectionId,
  height = 40,
  borderRadius = 8,
}: {
  kind: 'character' | 'plate' | 'icon' | 'trophy-image';
  collectionId: number;
  height?: number;
  borderRadius?: number;
}) {
  const aspect = kind === 'plate'
    ? PLATE_ASPECT
    : kind === 'trophy-image'
      ? TROPHY_IMAGE_ASPECT
      : 1;
  return <CollectionArtwork label={`${kind === 'trophy-image' ? '称号' : kind} 预览`}
    source={`${CHUNITHM_ASSET_ROOT}/${kind === 'trophy-image' ? 'trophy' : kind}/${collectionId}.png`}
    height={height} aspect={aspect} borderRadius={borderRadius} />;
}

export function ChunithmCollectionPreview({ kind, collection, height = 40, trophyHeight = 34, borderRadius = 8 }: {
  kind: ChunithmCollectionKind;
  collection?: { id: number; name?: string; color?: string | null } | null;
  height?: number;
  trophyHeight?: number;
  borderRadius?: number;
}) {
  if (collection && kind !== 'trophy') return <ChunithmCollectionImage kind={kind} collectionId={collection.id}
    height={height} borderRadius={borderRadius} />;
  if (collection?.color === 'image') return <ChunithmCollectionImage kind="trophy-image" collectionId={collection.id}
    height={trophyHeight} borderRadius={borderRadius} />;
  const label = collection?.name || (collection ? `#${collection.id}` : '未设置');
  if (collection?.color === 'platina' || collection?.color === 'platinum' || collection?.color === 'ultima') {
    const ultima = collection.color === 'ultima';
    return <View style={{ maxWidth: 128, minWidth: 96, height: 28, borderRadius: 999, paddingHorizontal: 10,
      borderWidth: 1, alignItems: 'center', justifyContent: 'center',
      backgroundColor: ultima ? '#512D67' : '#FFFDDD', borderColor: ultima ? '#A071B9' : '#DEC27B' }}>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, color: ultima ? '#FFF' : '#29333A' }}>{label}</Text>
    </View>;
  }
  return <TrophyBadge item={{ name: label, color: collection?.color }} />;
}
