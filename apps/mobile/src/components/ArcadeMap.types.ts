import type { ArcadeCoordinate } from '@/domain/arcade-coordinates';
import type { ArcadeShop } from '@/domain/arcade-shops';

export type ArcadeMapAvailability = 'available' | 'consent' | 'unsupported' | 'unconfigured';
export type ArcadeMapCamera = { center: ArcadeCoordinate; radiusKm: number } | null;
export type NativeArcadeMapProps = {
  camera: ArcadeMapCamera;
  shops: readonly ArcadeShop[];
  selectedShopId: number | null;
  onSelectShop: (shop: ArcadeShop) => void;
  onCenterChange: (center: ArcadeCoordinate) => void;
  onReady: () => void;
  onError: () => void;
};
