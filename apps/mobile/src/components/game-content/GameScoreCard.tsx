import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { router, type Href } from 'expo-router';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { ScoreCardPresentation } from '@/features/game-content/presentation';
import { detailTargetHref } from '@/domain/detail-target';
import { RemoteImage } from '@/components/RemoteImage';
import { useThemeStore } from '@/state/theme-store';
import { useAppTheme } from '@/theme/app-theme';

type ScoreCardArtworkScopeValue = {
  artworkBlur?: number;
  artworkTransparency?: number;
};

const ScoreCardArtworkScopeContext = createContext<ScoreCardArtworkScopeValue | null>(null);

export function ScoreCardArtworkScope({
  artworkBlur,
  artworkTransparency,
  children,
}: ScoreCardArtworkScopeValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ artworkBlur, artworkTransparency }),
    [artworkBlur, artworkTransparency],
  );
  return (
    <ScoreCardArtworkScopeContext.Provider value={value}>
      {children}
    </ScoreCardArtworkScopeContext.Provider>
  );
}

export function useScoreCardArtworkActive(): boolean {
  const inScope = useContext(ScoreCardArtworkScopeContext);
  const enabled = useThemeStore((state) => state.scoreCardArtworkEnabled);
  return inScope !== null && enabled;
}

export type ScoreCardArtwork = {
  source: string | null | undefined;
  scale?: number;
};

type ScoreCardTagRows = {
  rows: readonly { content: ReactNode; testID?: string }[];
  testID?: string;
};

export function ScoreCardMetric({ label, value, numericLabel, labelColor, valueColor, style, labelStyle, valueStyle }: {
  label?: string; value?: string | number; numericLabel?: boolean; labelColor?: string; valueColor?: string;
  style?: StyleProp<ViewStyle>; labelStyle?: StyleProp<TextStyle>; valueStyle?: StyleProp<TextStyle>;
}) {
  const theme = useAppTheme();
  return <View style={[styles.metric, numericLabel && styles.numericMetric, style]}>
    <Text style={[styles.metricLabel, numericLabel && styles.accuracy, labelStyle,
      { color: labelColor ?? theme.textMuted }]}>{label}</Text>
    <Text style={[styles.metricValue, numericLabel && styles.numericValue, valueStyle,
      { color: valueColor ?? theme.accent }]}>{value}</Text>
  </View>;
}

export function ScoreCardBadges({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return <View style={[styles.badges, style]} testID={testID}>{children}</View>;
}

function ArtworkLayer({ source, gameId, scale, blur, overlay, radius }: {
  source: string; gameId: ScoreCardPresentation['gameId']; scale?: number; blur: number; overlay: string;
  radius: ViewStyle['borderRadius'];
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.artworkClip, { borderRadius: radius }]}>
    <RemoteImage accessibilityIgnoresInvertColors blurRadius={blur} cacheProfile="thumbnail" contentFit="cover"
      gameId={gameId} onError={() => setFailed(true)} source={source}
      style={[StyleSheet.absoluteFill, scale ? { transform: [{ scale }] } : null]} testID="score-card-artwork" />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: overlay }]} testID="score-card-artwork-overlay" />
  </View>;
}

export function GameScoreCard({
  presentation,
  children,
  side,
  tagRows,
  cardStyle = styles.card,
  mainStyle = styles.main,
  titleStyle = styles.title,
  pressedStyle,
  pressable = true,
  onPress,
  artwork,
  testID,
}: {
  presentation: ScoreCardPresentation;
  children: ReactNode;
  side?: ReactNode;
  tagRows?: ScoreCardTagRows;
  cardStyle?: StyleProp<ViewStyle>;
  mainStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  pressable?: boolean;
  onPress?: () => void;
  artwork?: ScoreCardArtwork;
  testID?: string;
}) {
  const theme = useAppTheme();
  const artworkScope = useContext(ScoreCardArtworkScopeContext);
  const artworkActive = useScoreCardArtworkActive();
  const storedArtworkBlur = useThemeStore((state) => state.scoreCardArtworkBlur);
  const storedArtworkTransparency = useThemeStore((state) => state.scoreCardArtworkTransparency);
  const artworkBlur = artworkScope?.artworkBlur ?? storedArtworkBlur;
  const artworkTransparency = artworkScope?.artworkTransparency ?? storedArtworkTransparency;
  const artworkSource = artwork?.source?.trim() || null;
  const overlayColor = theme.dark ? '0,0,0' : '255,255,255';
  const resolvedCardStyle = [cardStyle, { backgroundColor: theme.surface }];
  const openDetail = onPress ?? (() => router.push(detailTargetHref(presentation.route) as Href));
  const content = (
    <>
      {artworkActive && artworkSource ? <ArtworkLayer key={`${presentation.gameId}|${artworkSource}`}
        source={artworkSource} gameId={presentation.gameId} scale={artwork?.scale} blur={artworkBlur}
        overlay={`rgba(${overlayColor},${1 - artworkTransparency / 100})`} radius={StyleSheet.flatten(cardStyle)?.borderRadius} /> : null}
      <View style={mainStyle}>
        <Text numberOfLines={1} style={[titleStyle, { color: theme.text }]}>
          {presentation.position ? `${presentation.position}. ` : ''}{presentation.title}
        </Text>
        {children}
        {tagRows && (
          <View style={styles.tagRows} testID={tagRows.testID}>
            {tagRows.rows.map((row, index) => (
              <ScoreCardBadges key={index} testID={row.testID}>{row.content}</ScoreCardBadges>
            ))}
          </View>
        )}
      </View>
      {side}
    </>
  );

  if (pressable === false) {
    return (
      <View style={resolvedCardStyle} testID={testID}>
        {content}
      </View>
    );
  }

  if (pressedStyle) {
    return (
      <Pressable
        accessibilityLabel={presentation.accessibilityLabel}
        accessibilityRole="button"
        onPress={openDetail}
        style={({ pressed }) => [
          ...resolvedCardStyle,
          pressed && pressedStyle,
        ]}
        testID={testID}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityLabel={presentation.accessibilityLabel}
      accessibilityRole="button"
      onPress={openDetail}
      style={resolvedCardStyle}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 15, fontWeight: '700' },
  tagRows: { gap: 5, marginTop: 4 },
  badges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  metric: { minWidth: 58, alignItems: 'flex-end', gap: 2 },
  numericMetric: { minWidth: 56, gap: 4 },
  metricLabel: { fontSize: 10, fontWeight: '700' },
  accuracy: { fontSize: 12 },
  metricValue: { fontSize: 19, fontWeight: '900' },
  numericValue: { fontSize: 20 },
  artworkClip: { overflow: 'hidden' },
});
