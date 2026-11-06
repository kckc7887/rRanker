import { CollectionArtwork } from '@/components/CollectionImage';

/** LXNS 姓名框素材约为 720×116。 */
export const LXNS_PLATE_ROOT = 'https://assets2.lxns.net/maimai/plate';
const PLATE_ASPECT = 720 / 116;

export function PlateImage({
  plateId,
  height = 36,
  borderRadius = 6,
}: {
  plateId: number;
  height?: number;
  borderRadius?: number;
}) {
  return <CollectionArtwork label="姓名框预览" source={`${LXNS_PLATE_ROOT}/${plateId}.png`}
    height={height} aspect={PLATE_ASPECT} borderRadius={borderRadius} />;
}
