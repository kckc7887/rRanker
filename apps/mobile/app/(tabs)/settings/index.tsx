import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { AccentColorPicker } from '@/components/AccentColorPicker';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { APP_ACCENTS, useAppTheme } from '@/theme/app-theme';
import { HUE_SPECTRUM } from '@/theme/accent-color';
import { useThemeStore } from '@/state/theme-store';
import type { AppAppearance } from '@/storage/theme-preferences-store';

const APPEARANCES: { id: AppAppearance; label: string }[] = [
  { id: 'system', label: '跟随系统' }, { id: 'light', label: '浅色' }, { id: 'dark', label: '深色' },
];

export default function SettingsScreen() {
  const tabBottomInset = useNativeTabBottomInset();
  const theme = useAppTheme();
  const appearance = useThemeStore((state) => state.appearance);
  const accent = useThemeStore((state) => state.accent);
  const customHex = useThemeStore((state) => state.customHex);
  const setAppearance = useThemeStore((state) => state.setAppearance);
  const setAccent = useThemeStore((state) => state.setAccent);
  const setCustomAccent = useThemeStore((state) => state.setCustomAccent);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={[styles.page, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: tabBottomInset + 16 }]}
      scrollIndicatorInsets={{ bottom: tabBottomInset }}
    >
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>外观</Text>
        <View style={styles.options}>
          {APPEARANCES.map((option) => <Pressable key={option.id} accessibilityRole="button"
            accessibilityLabel={`外观 ${option.label}`} accessibilityState={{ selected: appearance === option.id }}
            onPress={() => void setAppearance(option.id)}
            style={[styles.option, { borderColor: theme.border }, appearance === option.id && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
            <Text style={{ color: appearance === option.id ? '#FFF' : theme.textSecondary, fontWeight: '700' }}>{option.label}</Text>
          </Pressable>)}
        </View>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>主题色</Text>
        <View style={styles.swatches}>
          {APP_ACCENTS.map((option) => <Pressable key={option.id} accessibilityRole="button"
            accessibilityLabel={`主题色 ${option.label}`} accessibilityState={{ selected: accent === option.id }}
            onPress={() => void setAccent(option.id)} style={[styles.swatchFrame, accent === option.id && { borderColor: theme.text }]}>
            <View style={[styles.swatch, { backgroundColor: option.color }]} />
          </Pressable>)}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="主题色 自定义"
            accessibilityState={{ selected: accent === 'custom' }}
            onPress={() => setPickerOpen(true)}
            style={[styles.swatchFrame, accent === 'custom' && { borderColor: theme.text }]}
          >
            {accent === 'custom'
              ? <View style={[styles.swatch, { backgroundColor: customHex }]} />
              : (
                <LinearGradient colors={[...HUE_SPECTRUM] as [string, string, ...string[]]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.swatch}>
                  <Text style={styles.customMark}>+</Text>
                </LinearGradient>
              )}
          </Pressable>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/game-management' as Href)}
        style={[styles.row, { backgroundColor: theme.surface }]}
      >
        <View style={styles.rowText}>
          <Text style={[styles.title, { color: theme.text }]}>游戏管理</Text>
          <Text style={[styles.detail, { color: theme.textMuted }]}>绑定的游戏账号与数据源</Text>
        </View>
        <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
      </Pressable>
      <AccentColorPicker
        visible={pickerOpen}
        initialHex={accent === 'custom' ? customHex : theme.accent}
        onClose={() => setPickerOpen(false)}
        onApply={(hex) => {
          void setCustomAccent(hex);
          setPickerOpen(false);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12 },
  row: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: { flex: 1, gap: 4 },
  title: { color: '#111827', fontSize: 17, fontWeight: '700' },
  detail: { color: '#6B7280', fontSize: 13 },
  chevron: { color: '#9CA3AF', fontSize: 28, lineHeight: 28, fontWeight: '300' },
  section: { borderRadius: 14, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  options: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, minHeight: 38, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatchFrame: { width: 38, height: 38, borderWidth: 2, borderColor: 'transparent', borderRadius: 19, padding: 3 },
  swatch: { flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  customMark: { color: '#FFF', fontSize: 18, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 2 },
});
