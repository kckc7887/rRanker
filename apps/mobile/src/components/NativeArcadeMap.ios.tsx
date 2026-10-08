import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import type { ArcadeMapAvailability, NativeArcadeMapProps } from './ArcadeMap.types';

export function getArcadeMapAvailability(): ArcadeMapAvailability { return 'available'; }
export function acceptArcadeMapPrivacy(): void {}

export function NativeArcadeMap({ camera, shops, selectedShopId, onSelectShop, onCenterChange, onReady }: NativeArcadeMapProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready || !camera) return;
    const latitudeDelta = camera.radiusKm * 2 / 111;
    map.current?.animateToRegion({ ...camera.center, latitudeDelta,
      longitudeDelta: latitudeDelta / Math.max(0.1, Math.cos(camera.center.latitude * Math.PI / 180)) }, 300);
  }, [camera, ready]);
  return <MapView ref={map} style={StyleSheet.absoluteFill}
    initialRegion={{ latitude: 35, longitude: 105, latitudeDelta: 45, longitudeDelta: 60 }}
    onMapReady={() => { setReady(true); onReady(); }}
    onRegionChangeComplete={onCenterChange} rotateEnabled={false} pitchEnabled={false}>
    {shops.map(shop => <Marker key={shop.id} identifier={String(shop.id)} coordinate={shop}
      title={shop.name} pinColor={shop.id === selectedShopId ? '#F97316' : '#246BFD'}
      onPress={() => onSelectShop(shop)} />)}
  </MapView>;
}
