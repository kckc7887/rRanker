import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { ArcadeMapCamera, NativeArcadeMapProps } from './ArcadeMap.types';

function regionForCamera(camera: NonNullable<ArcadeMapCamera>) {
  const latitudeDelta = camera.radiusKm * 2 / 111;
  return { ...camera.center, latitudeDelta,
    longitudeDelta: latitudeDelta / Math.max(0.1, Math.cos(camera.center.latitude * Math.PI / 180)) };
}

export function NativeArcadeMap({ camera, initialCamera, shops, selectedShopId, onSelectShop, onCenterChange, onReady }: NativeArcadeMapProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready || !camera) return;
    map.current?.animateToRegion(regionForCamera(camera), 300);
  }, [camera, ready]);
  return <MapView ref={map} style={StyleSheet.absoluteFill}
    initialRegion={initialCamera ? regionForCamera(initialCamera) : { latitude: 35, longitude: 105, latitudeDelta: 45, longitudeDelta: 60 }}
    onMapReady={() => { setReady(true); onReady(); }}
    onRegionChangeComplete={onCenterChange} rotateEnabled={false} pitchEnabled={false}>
    {shops.map(shop => <Marker key={shop.id} identifier={String(shop.id)} coordinate={shop}
      title={shop.name} pinColor={shop.id === selectedShopId ? '#F97316' : '#246BFD'}
      onPress={() => onSelectShop(shop)} />)}
  </MapView>;
}
