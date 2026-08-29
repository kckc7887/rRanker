import { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { AccentColorPicker } from '@/components/AccentColorPicker';
import { ValueSlider } from '@/components/ValueSlider';
import { ScoreRecordCard, type ScoreRecordCardData } from '@/components/ScoreRecordCard';
import { ScoreCardArtworkScope } from '@/components/game-content/GameScoreCard';
import {
  BADGE_LAYER_OVERLAY,
  BADGE_RAINBOW_BORDER_COLORS,
  BADGE_RAINBOW_FILL_COLORS,
  BEST_IMAGE_RAINBOW_TEXT,
} from '@/features/best-image/best-image-badge-theme';
import { useThemeStore } from '@/state/theme-store';
import type { AppAppearance } from '@/storage/theme-preferences-store';
import { APP_ACCENTS, useAppTheme } from '@/theme/app-theme';

const APPEARANCES: { id: AppAppearance; label: string }[] = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
];

/** 曲绘预览固定成绩：舞萌 ID 834「PANDORA PARADOXXX」Re:MASTER；101% 达成率对应 SSS+（rate=sssp）、官方单曲 Rating = floor(15.0 + 22.4) = 37。 */
const SCORE_CARD_ARTWORK_PREVIEW_RECORD = {
  songId: '834',
  title: 'PANDORA PARADOXXX',
  type: 'SD',
  difficulty: 'remaster',
  difficultyConstant: 15,
  levelIndex: 4,
  achievements: 101,
  dxScore: null,
  rating: 37,
  fc: 'ap',
  fs: 'fsdp',
  rate: 'sssp',
} as const satisfies ScoreRecordCardData;

export default function PersonalizationScreen() {
  const theme = useAppTheme();
  const appearance = useThemeStore((state) => state.appearance);
  const accent = useThemeStore((state) => state.accent);
  const customHex = useThemeStore((state) => state.customHex);
  const artworkEnabled = useThemeStore((state) => state.scoreCardArtworkEnabled);
  const artworkTransparency = useThemeStore((state) => state.scoreCardArtworkTransparency);
  const artworkBlur = useThemeStore((state) => state.scoreCardArtworkBlur);
  const setAppearance = useThemeStore((state) => state.setAppearance);
  const setAccent = useThemeStore((state) => state.setAccent);
  const setCustomAccent = useThemeStore((state) => state.setCustomAccent);
  const setArtworkEnabled = useThemeStore((state) => state.setScoreCardArtworkEnabled);
  const setArtworkTransparency = useThemeStore((state) => state.setScoreCardArtworkTransparency);
  const setArtworkBlur = useThemeStore((state) => state.setScoreCardArtworkBlur);
  const [artworkTransparencyDraft, setArtworkTransparencyDraft] = useState(artworkTransparency);
  const [artworkBlurDraft, setArtworkBlurDraft] = useState(artworkBlur);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => setArtworkTransparencyDraft(artworkTransparency), [artworkTransparency]);
  useEffect(() => setArtworkBlurDraft(artworkBlur), [artworkBlur]);

  return (
    <>
      <Stack.Screen options={{ title: '个性化' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        style={[styles.page, { backgroundColor: theme.background }]}
      >
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>外观</Text>
          <View style={styles.options}>
            {APPEARANCES.map((option) => (
              <Pressable
                key={option.id}
                accessibilityLabel={`外观 ${option.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: appearance === option.id }}
                onPress={() => void setAppearance(option.id)}
                style={[
                  styles.option,
                  { borderColor: theme.border },
                  appearance === option.id && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
              >
                <Text style={{ color: appearance === option.id ? '#FFF' : theme.textSecondary, fontWeight: '700' }}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>主题色</Text>
          <View style={styles.swatches}>
            {APP_ACCENTS.map((option) => (
              <Pressable
                key={option.id}
                accessibilityLabel={`主题色 ${option.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: accent === option.id }}
                onPress={() => void setAccent(option.id)}
                style={[styles.swatchFrame, accent === option.id && { borderColor: theme.text }]}
              >
                <View style={[styles.swatch, { backgroundColor: option.color }]} />
              </Pressable>
            ))}
            <Pressable
              accessibilityLabel="主题色 自定义"
              accessibilityRole="button"
              accessibilityState={{ selected: accent === 'custom' }}
              onPress={() => setPickerOpen(true)}
              style={[styles.swatchFrame, accent === 'custom' && { borderColor: theme.text }]}
            >
              {accent === 'custom' ? (
                <View style={[styles.swatch, { backgroundColor: customHex }]} />
              ) : (
                <LinearGradient colors={BADGE_RAINBOW_BORDER_COLORS} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.customRainbowBorder}>
                  <LinearGradient colors={BADGE_RAINBOW_FILL_COLORS} end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={styles.customRainbowFill}>
                    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.customRainbowOverlay]} />
                    <Text style={styles.customMark}>+</Text>
                  </LinearGradient>
                </LinearGradient>
              )}
            </Pressable>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>启用成绩卡片显示曲绘（实验性）</Text>
              <Text style={[styles.detail, { color: theme.textMuted }]}>在最佳和成绩页面用歌曲封面帮助辨认歌曲</Text>
            </View>
            <Switch
              accessibilityLabel="启用成绩卡片显示曲绘"
              onValueChange={(value) => void setArtworkEnabled(value)}
              trackColor={{ false: theme.border, true: theme.accentSoft }}
              thumbColor={artworkEnabled ? theme.accent : theme.surface}
              value={artworkEnabled}
            />
          </View>
          {artworkEnabled ? (
            <View style={styles.sliderGroup}>
              <View style={styles.sliderLabelRow}>
                <Text style={[styles.sliderLabel, { color: theme.textSecondary }]}>曲绘透明度</Text>
                <Text style={[styles.sliderValue, { color: theme.text }]}>{artworkTransparencyDraft}%</Text>
              </View>
              <ValueSlider
                accessibilityLabel="成绩卡片曲绘透明度"
                inverted
                max={100}
                min={0}
                onChange={setArtworkTransparencyDraft}
                onChangeComplete={(value) => void setArtworkTransparency(value)}
                step={1}
                value={artworkTransparencyDraft}
              />
              <View style={styles.sliderLabelRow}>
                <Text style={[styles.sliderLabel, { color: theme.textSecondary }]}>曲绘模糊度</Text>
                <Text style={[styles.sliderValue, { color: theme.text }]}>{artworkBlurDraft}px</Text>
              </View>
              <ValueSlider
                accessibilityLabel="成绩卡片曲绘模糊度"
                max={30}
                min={0}
                onChange={setArtworkBlurDraft}
                onChangeComplete={(value) => void setArtworkBlur(value)}
                step={1}
                value={artworkBlurDraft}
              />
              <View style={styles.previewGroup}>
                <Text style={[styles.sliderLabel, { color: theme.textSecondary }]}>曲绘预览</Text>
                <ScoreCardArtworkScope
                  artworkBlur={artworkBlurDraft}
                  artworkTransparency={artworkTransparencyDraft}
                >
                  <ScoreRecordCard
                    artworkCachePolicy="none"
                    interactive={false}
                    record={SCORE_CARD_ARTWORK_PREVIEW_RECORD}
                  />
                </ScoreCardArtworkScope>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <AccentColorPicker
        initialHex={accent === 'custom' ? customHex : theme.accent}
        onApply={(hex) => {
          void setCustomAccent(hex);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
        visible={pickerOpen}
      />
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  section: { borderRadius: 14, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  detail: { fontSize: 13, lineHeight: 18 },
  options: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, minHeight: 38, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatchFrame: { width: 38, height: 38, borderWidth: 2, borderColor: 'transparent', borderRadius: 19, padding: 3 },
  swatch: { flex: 1, borderRadius: 16 },
  customRainbowBorder: { flex: 1, borderRadius: 16, padding: 2, overflow: 'hidden' },
  customRainbowFill: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  customRainbowOverlay: { backgroundColor: BADGE_LAYER_OVERLAY },
  customMark: { color: BEST_IMAGE_RAINBOW_TEXT, fontSize: 16, fontWeight: '800' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1, gap: 4 },
  sliderGroup: { gap: 10, paddingTop: 4 },
  previewGroup: { gap: 8, paddingTop: 2 },
  sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderLabel: { fontSize: 13, fontWeight: '700' },
  sliderValue: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
