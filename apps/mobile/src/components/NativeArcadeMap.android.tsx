/* eslint-disable @typescript-eslint/no-require-imports -- 通过架构与配置检查后才能加载 SDK。 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import type { MapViewRef } from 'expo-gaode-map';
import { fromGcj02, toGcj02 } from '@/domain/arcade-coordinates';
import type { NativeArcadeMapProps } from './ArcadeMap.types';

export function NativeArcadeMap({ camera, initialCamera, shops, selectedShopId, onSelectShop, onCenterChange, onReady, onError }: NativeArcadeMapProps) {
  const { MapView, Marker } = require('expo-gaode-map') as typeof import('expo-gaode-map');
  const map = useRef<MapViewRef>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready || !camera) return;
    void map.current?.moveCamera({ target: toGcj02(camera.center), zoom: Math.max(4, 14 - Math.log2(camera.radiusKm)) }, 300).catch(onError);
  }, [camera, onError, ready]);
  return <MapView ref={map} style={StyleSheet.absoluteFill}
    initialCameraPosition={initialCamera ? { target: toGcj02(initialCamera.center), zoom: Math.max(4, 14 - Math.log2(initialCamera.radiusKm)) } : { target: { latitude: 35, longitude: 105 }, zoom: 4 }}
    myLocationEnabled={false} myLocationButtonEnabled={false} zoomControlsEnabled={false}
    rotateGesturesEnabled={false} tiltGesturesEnabled={false}
    onLoad={() => { setReady(true); onReady(); }}
    onCameraIdle={event => { const target = event.nativeEvent.cameraPosition.target; if (target) onCenterChange(fromGcj02(target)); }}>
    {shops.map(shop => <Marker key={shop.id} position={toGcj02(shop)} title={shop.name}
      pinColor={shop.id === selectedShopId ? 'orange' : 'blue'} zIndex={shop.id === selectedShopId ? 2 : 1}
      onMarkerPress={() => onSelectShop(shop)} />)}
  </MapView>;
}
