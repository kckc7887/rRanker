import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { fromGcj02, toGcj02 } from '@/domain/arcade-coordinates';
import type { ArcadeMapCamera, NativeArcadeMapProps } from './ArcadeMap.types';

function regionForCamera(camera: NonNullable<ArcadeMapCamera>) {
  const latitudeDelta = (camera.radiusKm ?? 2) * 2 / 111;
  return { ...toGcj02(camera.center), latitudeDelta,
    longitudeDelta: latitudeDelta / Math.max(0.1, Math.cos(camera.center.latitude * Math.PI / 180)) };
}

export function NativeArcadeMap({ camera, initialCamera, zoomRequest, shops, selectedShopId, onSelectShop, onCenterChange, onReady, onError }: NativeArcadeMapProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready || !camera) return;
    if (camera.radiusKm === undefined) map.current?.animateCamera({ center: toGcj02(camera.center) }, { duration: 300 });
    else map.current?.animateToRegion(regionForCamera(camera), 300);
  }, [camera, ready]);
  useEffect(() => {
    if (!ready || !zoomRequest) return;
    let cancelled = false;
    void map.current?.getCamera().then(position => {
      if (!cancelled && position.altitude !== undefined) {
        map.current?.animateCamera({ altitude: position.altitude / 2 ** zoomRequest.delta }, { duration: 300 });
      }
    }).catch(() => { if (!cancelled) onError(); });
    return () => { cancelled = true; };
  }, [onError, ready, zoomRequest]);
  return <MapView ref={map} style={StyleSheet.absoluteFill}
    initialRegion={initialCamera ? regionForCamera(initialCamera) : { latitude: 35, longitude: 105, latitudeDelta: 45, longitudeDelta: 60 }}
    onMapReady={() => { setReady(true); onReady(); }}
    onRegionChangeComplete={region => onCenterChange(fromGcj02(region))} rotateEnabled={false} pitchEnabled={false}>
    {shops.map(shop => <Marker key={shop.id} identifier={String(shop.id)} coordinate={toGcj02(shop)}
      title={shop.name} pinColor={shop.id === selectedShopId ? '#F97316' : '#246BFD'}
      onPress={() => onSelectShop(shop)} />)}
  </MapView>;
}
