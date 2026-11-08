import { StyleSheet, Text, View } from 'react-native';
import { LayeredGradientBadge } from '@rranker/sdk/components/LayeredGradientBadge';
import { normalizeTrophyTone, TROPHY_BADGE_THEMES } from '@rranker/sdk/domain/badge-theme';

export function TrophyBadge({ item, fallback }: { item?: { name?: string; color?: string | null }; fallback?: string }) {
  const tone = normalizeTrophyTone(item?.color);
  const label = item?.name ?? fallback ?? '未设置';
  if (tone === 'rainbow') return (
    <LayeredGradientBadge
      contentStyle={styles.rainbowTrophyPreviewContent}
      label={label}
      numberOfLines={1}
      style={styles.trophyPreview}
      textStyle={styles.trophyPreviewText}
      tone="rainbow"
    />
  );
  const theme = TROPHY_BADGE_THEMES[tone];
  return (
    <View style={[styles.trophyPreview, styles.solidTrophyPreview, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <Text numberOfLines={1} style={[styles.trophyPreviewText, { color: theme.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  trophyPreview: { maxWidth: 150, minWidth: 96, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  solidTrophyPreview: { paddingHorizontal: 12, borderWidth: 1 },
  rainbowTrophyPreviewContent: { paddingHorizontal: 10 },
  trophyPreviewText: { fontSize: 12, lineHeight: 16, fontWeight: '400', textAlign: 'center', includeFontPadding: false },
});
