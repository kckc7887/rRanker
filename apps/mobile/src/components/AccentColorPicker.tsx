import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppSheet } from '@/components/AppSheet';
import { ValueSlider } from '@/components/ValueSlider';
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
    <AppSheet visible={visible} onRequestClose={onClose} title="自定义主题色"
      leftAction={{ label: '取消', accessibilityLabel: '取消自定义主题色', onPress: onClose }}
      rightAction={{ label: '应用', accessibilityLabel: '应用自定义主题色', onPress: () => onApply(preview) }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>拖动色相、饱和度与明度，或直接输入十六进制颜色。</Text>
        <View style={[styles.preview, { backgroundColor: preview, borderColor: theme.border }]} />
        <Text style={[styles.label, { color: theme.textSecondary }]}>色相</Text>
        <ValueSlider
          accessibilityLabel="色相"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(hue / 3.6) }}
          colors={HUE_SPECTRUM}
          min={0}
          max={1}
          step={0.001}
          value={hue / 360}
          onChange={(value) => {
            const next = value * 360;
            setHue(next);
            syncHexDraft(next, saturation, lightness);
          }}
        />
        <Text style={[styles.label, { color: theme.textSecondary }]}>饱和度</Text>
        <ValueSlider
          accessibilityLabel="饱和度"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(saturation) }}
          colors={saturationColors}
          min={0}
          max={1}
          step={0.001}
          value={saturation / 100}
          onChange={(value) => {
            const next = value * 100;
            setSaturation(next);
            syncHexDraft(hue, next, lightness);
          }}
        />
        <Text style={[styles.label, { color: theme.textSecondary }]}>明度</Text>
        <ValueSlider
          accessibilityLabel="明度"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(lightness) }}
          colors={lightnessColors}
          min={0}
          max={1}
          step={0.001}
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
      </ScrollView>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  subtitle: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  preview: { height: 72, borderRadius: 16, borderWidth: 1, marginVertical: 4 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  hexInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
