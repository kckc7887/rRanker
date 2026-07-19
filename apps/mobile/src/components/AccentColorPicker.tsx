import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppModal } from '@/components/AppModal';
import { useAppTheme } from '@/theme/app-theme';
import {
  HUE_SPECTRUM,
  hexToHsl,
  hslToHex,
  normalizeAccentHex,
} from '@/theme/accent-color';

interface AccentColorPickerProps {
  visible: boolean;
  initialHex: string;
  onClose: () => void;
  onApply: (hex: string) => void;
}

function ColorSlider({
  colors,
  value,
  onChange,
  accessibilityLabel,
}: {
  colors: readonly string[];
  value: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
}) {
  const [width, setWidth] = useState(1);
  const updateFromEvent = (event: GestureResponderEvent) => {
    const next = Math.max(0, Math.min(1, event.nativeEvent.locationX / Math.max(width, 1)));
    onChange(next);
  };
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={updateFromEvent}
      onResponderMove={updateFromEvent}
      style={styles.sliderTrack}
    >
      <LinearGradient
        colors={colors as [string, string, ...string[]]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.thumb, { left: Math.max(0, Math.min(width - 18, value * width - 9)) }]} />
    </View>
  );
}

export function AccentColorPicker({ visible, initialHex, onClose, onApply }: AccentColorPickerProps) {
  const theme = useAppTheme();
  const seed = normalizeAccentHex(initialHex) ?? '#246BFD';
  const seedHsl = hexToHsl(seed) ?? { h: 221, s: 98, l: 56 };
  const [hue, setHue] = useState(seedHsl.h);
  const [saturation, setSaturation] = useState(seedHsl.s);
  const [lightness, setLightness] = useState(seedHsl.l);
  const [hexDraft, setHexDraft] = useState(seed);

  useEffect(() => {
    if (!visible) return;
    const next = normalizeAccentHex(initialHex) ?? '#246BFD';
    const hsl = hexToHsl(next) ?? { h: 221, s: 98, l: 56 };
    setHue(hsl.h);
    setSaturation(hsl.s);
    setLightness(hsl.l);
    setHexDraft(next);
  }, [initialHex, visible]);

  const preview = useMemo(() => hslToHex(hue, saturation, lightness), [hue, lightness, saturation]);
  const saturationColors = useMemo(
    () => [hslToHex(hue, 0, lightness), hslToHex(hue, 100, lightness)],
    [hue, lightness],
  );
  const lightnessColors = useMemo(
    () => ['#000000', hslToHex(hue, saturation, 50), '#FFFFFF'],
    [hue, saturation],
  );

  const syncFromHex = (value: string) => {
    setHexDraft(value);
    const normalized = normalizeAccentHex(value);
    if (!normalized) return;
    const hsl = hexToHsl(normalized);
    if (!hsl) return;
    setHue(hsl.h);
    setSaturation(hsl.s);
    setLightness(hsl.l);
  };

  const syncHexDraft = (nextHue: number, nextSat: number, nextLight: number) => {
    setHexDraft(hslToHex(nextHue, nextSat, nextLight));
  };

  return (
    <AppModal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <Text style={[styles.title, { color: theme.text }]}>自定义主题色</Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>拖动色相、饱和度与明度，或直接输入十六进制颜色。</Text>
        <View style={[styles.preview, { backgroundColor: preview, borderColor: theme.border }]} />
        <Text style={[styles.label, { color: theme.textSecondary }]}>色相</Text>
        <ColorSlider
          accessibilityLabel="色相"
          colors={HUE_SPECTRUM}
          value={hue / 360}
          onChange={(value) => {
            const next = value * 360;
            setHue(next);
            syncHexDraft(next, saturation, lightness);
          }}
        />
        <Text style={[styles.label, { color: theme.textSecondary }]}>饱和度</Text>
        <ColorSlider
          accessibilityLabel="饱和度"
          colors={saturationColors}
          value={saturation / 100}
          onChange={(value) => {
            const next = value * 100;
            setSaturation(next);
            syncHexDraft(hue, next, lightness);
          }}
        />
        <Text style={[styles.label, { color: theme.textSecondary }]}>明度</Text>
        <ColorSlider
          accessibilityLabel="明度"
          colors={lightnessColors}
          value={lightness / 100}
          onChange={(value) => {
            const next = value * 100;
            setLightness(next);
            syncHexDraft(hue, saturation, next);
          }}
        />
        <Text style={[styles.label, { color: theme.textSecondary }]}>十六进制</Text>
        <TextInput
          accessibilityLabel="主题色十六进制"
          autoCapitalize="characters"
          autoCorrect={false}
          value={hexDraft}
          onChangeText={syncFromHex}
          placeholder="#246BFD"
          placeholderTextColor={theme.textMuted}
          style={[styles.hexInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.input }]}
        />
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="取消自定义主题色" onPress={onClose}
            style={[styles.action, { borderColor: theme.border }]}>
            <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>取消</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="应用自定义主题色"
            onPress={() => onApply(preview)}
            style={[styles.action, { backgroundColor: preview, borderColor: preview }]}
          >
            <Text style={{ color: '#FFF', fontWeight: '700' }}>应用</Text>
          </Pressable>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingHorizontal: 20, paddingTop: 24, gap: 10 },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  preview: { height: 72, borderRadius: 16, borderWidth: 1, marginVertical: 4 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  sliderTrack: {
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  thumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: 'rgba(17,24,39,0.35)',
  },
  hexInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  action: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
