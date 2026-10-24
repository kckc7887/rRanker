import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Mask, Rect } from 'react-native-svg';
import { useAppTheme } from '@/theme/app-theme';
import { ValueSlider } from './ValueSlider';
import { constrainCrop, cropFromTransform, transformFromCrop, type CropTransform, type ImageCrop, type ImageSize } from './image-crop';

export function ImageCropper({ uri, initialCrop, onCancel, onConfirm }: {
  uri: string; initialCrop?: ImageCrop | null; onCancel: () => void; onConfirm: (crop: ImageCrop) => void;
}) {
  const theme = useAppTheme(); const insets = useSafeAreaInsets(); const window = useWindowDimensions();
  const frame = Math.max(120, Math.min(window.width - 48, window.height - insets.top - insets.bottom - 230, 420));
  const [size, setSize] = useState<ImageSize | null>(null);
  const [error, setError] = useState(false); const [attempt, setAttempt] = useState(0);
  const [transform, setTransform] = useState<CropTransform>({ zoom: 1, x: 0, y: 0 });
  const latest = useRef({ size, frame, transform }); latest.current = { size, frame, transform };
  useEffect(() => {
    let active = true; setSize(null); setError(false);
    Image.getSize(uri).then(next => {
      if (!active) return;
      setSize(next); setTransform(transformFromCrop(next, frame, initialCrop));
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [uri, initialCrop, frame, attempt]);
  const gesture = useRef({ count: 0, x: 0, y: 0, distance: 1, value: transform });
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { gesture.current.count = 0; },
    onPanResponderMove: event => {
      const { size, frame, transform } = latest.current;
      const touches = event.nativeEvent.touches;
      if (!size || !touches.length) return;
      const a = touches[0]!; const b = touches[1];
      const x = b ? (a.pageX + b.pageX) / 2 : a.pageX;
      const y = b ? (a.pageY + b.pageY) / 2 : a.pageY;
      const distance = b ? Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)) : 1;
      const count = Math.min(2, touches.length);
      if (gesture.current.count !== count) { gesture.current = { count, x, y, distance, value: transform }; return; }
      const start = gesture.current;
      const zoom = Math.max(1, Math.min(4, start.value.zoom * distance / start.distance));
      const ratio = zoom / start.value.zoom;
      const next = constrainCrop(size, frame, { zoom, x: start.value.x * ratio + x - start.x, y: start.value.y * ratio + y - start.y });
      latest.current.transform = next; setTransform(next);
    },
    onPanResponderRelease: () => { gesture.current.count = 0; },
    onPanResponderTerminate: () => { gesture.current.count = 0; },
  })).current;
  const scale = size ? Math.max(frame / size.width, frame / size.height) * transform.zoom : 1;
  return <Modal visible animationType="slide" onRequestClose={onCancel}>
    <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}><Pressable onPress={onCancel}><Text style={{ color: theme.text }}>取消</Text></Pressable>
        <Text style={[styles.title, { color: theme.text }]}>裁剪头像</Text>
        <Pressable disabled={!size} onPress={() => size && onConfirm(cropFromTransform(size, frame, transform))}><Text style={{ color: size ? theme.accent : theme.textMuted }}>确定</Text></Pressable></View>
      <View style={styles.stage}>
        <View testID="image-crop-frame" style={{ width: frame, height: frame, overflow: 'hidden' }} {...responder.panHandlers}>
          {size ? <Image source={{ uri }} style={{ position: 'absolute', width: size.width * scale, height: size.height * scale,
            left: (frame - size.width * scale) / 2 + transform.x, top: (frame - size.height * scale) / 2 + transform.y }} /> : null}
          <Svg pointerEvents="none" width={frame} height={frame} style={StyleSheet.absoluteFill}>
            <Defs><Mask id="crop"><Rect width={frame} height={frame} fill="white" /><Circle cx={frame / 2} cy={frame / 2} r={frame / 2 - 1} fill="black" /></Mask></Defs>
            <Rect width={frame} height={frame} fill="#000" opacity={0.65} mask="url(#crop)" />
            <Circle cx={frame / 2} cy={frame / 2} r={frame / 2 - 1} stroke="#fff" strokeWidth={2} fill="none" />
          </Svg>
        </View>
        {!size && !error ? <ActivityIndicator style={StyleSheet.absoluteFill} /> : null}
        {error ? <Pressable onPress={() => setAttempt(v => v + 1)}><Text style={{ color: theme.accent }}>图片加载失败，点击重试</Text></Pressable> : null}
      </View>
      <Text style={[styles.hint, { color: theme.textMuted }]}>拖动调整位置，双指缩放</Text>
      <ValueSlider accessibilityLabel="头像缩放" min={1} max={4} step={0.01} value={transform.zoom} onChange={zoom => {
        if (size) setTransform(current => constrainCrop(size, frame, { zoom, x: current.x * zoom / current.zoom, y: current.y * zoom / current.zoom }));
      }} />
      <Pressable style={styles.reset} onPress={() => setTransform({ zoom: 1, x: 0, y: 0 })}><Text style={{ color: theme.accent }}>重置</Text></Pressable>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({ root: { flex: 1, paddingHorizontal: 24 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }, title: { fontSize: 18, fontWeight: '700' }, stage: { flex: 1, alignItems: 'center', justifyContent: 'center' }, hint: { textAlign: 'center', marginBottom: 12 }, reset: { alignItems: 'center', padding: 16 } });
