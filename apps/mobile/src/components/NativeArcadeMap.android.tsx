import { useEffect, useMemo, useRef, useState, type ComponentType, type RefAttributes } from 'react';
import { StyleSheet, type NativeSyntheticEvent, type ViewProps } from 'react-native';
import { requireNativeViewManager } from 'expo-modules-core';
import { fromGcj02, toGcj02, type ArcadeCoordinate } from '@/domain/arcade-coordinates';
import type { NativeArcadeMapProps } from './ArcadeMap.types';

type MapMethods = {
  setCamera: (target: ArcadeCoordinate, zoom: number | null) => Promise<void>;
  zoomBy: (delta: number) => Promise<void>;
};
type MapProps = ViewProps & {
  initialCamera: { target: ArcadeCoordinate; zoom: number };
  shops: readonly { id: number; name: string; position: ArcadeCoordinate }[];
  selectedShopId: number | null;
  onReady: () => void;
  onError: () => void;
  onCenterChange: (event: NativeSyntheticEvent<ArcadeCoordinate>) => void;
  onMarkerPress: (event: NativeSyntheticEvent<{ id: number }>) => void;
};

export function NativeArcadeMap({ camera, initialCamera, zoomRequest, shops, selectedShopId, onSelectShop, onCenterChange, onReady, onError }: NativeArcadeMapProps) {
  const [MapView] = useState(() => requireNativeViewManager('ArcadeMapSupport') as ComponentType<MapProps & RefAttributes<MapMethods>>);
  const map = useRef<MapMethods>(null);
  const [ready, setReady] = useState(false);
  const markers = useMemo(() => shops.map(shop => ({ id: shop.id, name: shop.name, position: toGcj02(shop) })), [shops]);
  useEffect(() => {
    if (!ready || !camera) return;
    let cancelled = false;
    void map.current?.setCamera(toGcj02(camera.center), camera.radiusKm === undefined ? null : Math.max(4, 14 - Math.log2(camera.radiusKm)))
      .catch(() => { if (!cancelled) onError(); });
    return () => { cancelled = true; };
  }, [camera, onError, ready]);
  useEffect(() => {
    if (!ready || !zoomRequest) return;
    let cancelled = false;
    void map.current?.zoomBy(zoomRequest.delta).catch(() => { if (!cancelled) onError(); });
    return () => { cancelled = true; };
  }, [onError, ready, zoomRequest]);
  return <MapView ref={map} style={StyleSheet.absoluteFill}
    initialCamera={initialCamera ? { target: toGcj02(initialCamera.center), zoom: Math.max(4, 14 - Math.log2(initialCamera.radiusKm ?? 2)) } : { target: { latitude: 35, longitude: 105 }, zoom: 4 }}
    shops={markers} selectedShopId={selectedShopId}
    onReady={() => { setReady(true); onReady(); }} onError={onError}
    onCenterChange={event => onCenterChange(fromGcj02(event.nativeEvent))}
    onMarkerPress={event => { const shop = shops.find(shop => shop.id === event.nativeEvent.id); if (shop) onSelectShop(shop); }} />;
}
