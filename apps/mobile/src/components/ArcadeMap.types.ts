import type { ArcadeCoordinate } from '@/domain/arcade-coordinates';
import type { ArcadeShop } from '@/domain/arcade-shops';

export type ArcadeMapCamera = { center: ArcadeCoordinate; radiusKm?: number } | null;
export type NativeArcadeMapProps = {
  camera: ArcadeMapCamera;
  initialCamera?: ArcadeMapCamera;
  zoomRequest?: { delta: 1 | -1 } | null;
  shops: readonly ArcadeShop[];
  selectedShopId: number | null;
  onSelectShop: (shop: ArcadeShop) => void;
  onCenterChange: (center: ArcadeCoordinate) => void;
  onReady: () => void;
  onError: () => void;
};
