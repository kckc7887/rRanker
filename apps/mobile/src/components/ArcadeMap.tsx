import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { AppModal } from '@/components/AppModal';
import { useAppTheme } from '@/theme/app-theme';
import { NativeArcadeMap } from './NativeArcadeMap';
import { acceptArcadeMapPrivacy, getArcadeMapAvailability } from '@/services/arcade-map-platform';
import type { NativeArcadeMapProps } from './ArcadeMap.types';

class MapBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function ArcadeMap({ onGestureStart, onAvailabilityChange, locating, onLocate, compact, ...props }: Omit<NativeArcadeMapProps, 'onReady' | 'onError' | 'zoomRequest'> & {
  onGestureStart: () => void;
  onAvailabilityChange?: () => void;
  locating: boolean;
  onLocate: () => void;
  compact: boolean;
}) {
  const theme = useAppTheme();
  const [availability, setAvailability] = useState(getArcadeMapAvailability);
  const [consentVisible, setConsentVisible] = useState(availability === 'consent');
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [zoomRequest, setZoomRequest] = useState<NativeArcadeMapProps['zoomRequest']>(null);
  const gesture = useRef(false);
  const onError = useCallback(() => { setFailed(true); gesture.current = false; onAvailabilityChange?.(); }, [onAvailabilityChange]);
  const onReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    if (props.camera) { gesture.current = false; setZoomRequest(null); }
  }, [props.camera]);
  useEffect(() => {
    if (availability !== 'available' || ready || failed) return;
    const timeout = setTimeout(onError, 20_000);
    return () => clearTimeout(timeout);
  }, [attempt, availability, failed, onError, ready]);
  const button = (label: string, onPress: () => void) => <Pressable onPress={onPress}
    style={[styles.button, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <Text style={{ color: theme.accent, fontWeight: '600' }}>{label}</Text>
  </Pressable>;
  const mapFailed = failed || availability === 'failed';
  const showMap = availability === 'available' && !mapFailed;
  const locateButton = <Pressable testID="arcade-map-locate" onPress={onLocate} disabled={locating}
    style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    {locating ? <ActivityIndicator color={theme.accent} size="small" /> : <Svg width={22} height={22} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={7} fill="none" stroke={theme.accent} strokeWidth={2} />
      <Circle cx={12} cy={12} r={2} fill={theme.accent} />
      <Path d="M12 2v3m0 14v3M2 12h3m14 0h3" stroke={theme.accent} strokeWidth={2} strokeLinecap="round" />
    </Svg>}
  </Pressable>;
  return <>
    <View style={showMap ? [styles.map, { flex: compact ? 0.25 : 1 }] : [styles.fallback, { backgroundColor: theme.surface }]}>
      {showMap ? <>
        <View style={StyleSheet.absoluteFill} onTouchMove={() => { if (!gesture.current) { gesture.current = true; onGestureStart(); } }}>
        <MapBoundary key={attempt} onError={onError}>
          <NativeArcadeMap {...props} zoomRequest={zoomRequest} onReady={onReady} onError={onError}
            onSelectShop={shop => { gesture.current = false; props.onSelectShop(shop); }}
            onCenterChange={center => {
              if (!gesture.current) return;
              gesture.current = false;
              props.onCenterChange(center);
            }} />
        </MapBoundary>
        </View>
        <View pointerEvents="none" style={styles.centerPin}><Text style={{ color: theme.accent, fontSize: 24 }}>＋</Text></View>
        <View style={styles.controls}>
          {([1, -1] as const).map(delta => <Pressable key={delta} testID={delta === 1 ? 'arcade-map-zoom-in' : 'arcade-map-zoom-out'}
            disabled={!ready} onPress={() => { gesture.current = false; setZoomRequest({ delta }); }}
            style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border, opacity: ready ? 1 : 0.5 }]}>
            <Svg width={24} height={24} viewBox="0 0 24 24">
              <Path d={delta === 1 ? 'M5 12h14M12 5v14' : 'M5 12h14'} stroke={theme.accent} strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </Pressable>)}
          {locateButton}
        </View>
      </> : <>
        <Text style={{ color: theme.textMuted, flex: 1 }}>
          {mapFailed ? '地图加载失败' : availability === 'consent' ? '地图未启用' : '当前使用机厅列表'}
        </Text>
        {mapFailed ? button('重试地图', () => { setAvailability(getArcadeMapAvailability()); setReady(false); setFailed(false); setAttempt(value => value + 1); onAvailabilityChange?.(); }) : null}
        {availability === 'consent' ? button('启用地图', () => setConsentVisible(true)) : null}
        {locateButton}
      </>}
    </View>
    <AppModal visible={consentVisible} transparent animationType="fade" onRequestClose={() => setConsentVisible(false)}>
      <View style={styles.shade}><View style={[styles.notice, { backgroundColor: theme.surface }]}>
        <Text style={[styles.title, { color: theme.text }]}>高德地图服务</Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>地图和地点搜索由高德提供。使用时，高德 SDK 会处理设备信息、网络信息及查询位置；定位权限由系统单独询问。可查看服务协议与隐私政策后选择是否启用。</Text>
        <View style={styles.links}>
          {button('服务协议', () => { void Linking.openURL('https://lbs.amap.com/pages/terms/').catch(() => {}); })}
          {button('隐私政策', () => { void Linking.openURL('https://lbs.amap.com/pages/privacy/').catch(() => {}); })}
        </View>
        <View style={styles.links}>
          {button('使用列表', () => setConsentVisible(false))}
          {button('同意并启用', () => {
            try { acceptArcadeMapPrivacy(); setAvailability(getArcadeMapAvailability()); onAvailabilityChange?.(); } catch { onError(); }
            setConsentVisible(false);
          })}
        </View>
      </View></View>
    </AppModal>
  </>;
}

const styles = StyleSheet.create({
  map: { minHeight: 100, overflow: 'hidden' },
  fallback: { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  centerPin: { position: 'absolute', left: '50%', top: '50%', marginLeft: -12, marginTop: -16 },
  controls: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', gap: 8 },
  iconButton: { width: 40, height: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  button: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  shade: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#00000066' },
  notice: { borderRadius: 16, padding: 20, gap: 16 },
  title: { fontSize: 18, fontWeight: '700' },
  description: { fontSize: 14, lineHeight: 22 },
  links: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
});
