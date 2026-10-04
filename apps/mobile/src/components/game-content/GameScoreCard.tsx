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
  cachePolicy?: 'none';
};

export type ScoreCardMetricSide = {
  blockStyle: StyleProp<ViewStyle>;
  lines: readonly {
    text?: string;
    style: StyleProp<TextStyle>;
    color: string;
  }[];
};

export type ScoreCardTagRows = {
  containerStyle: StyleProp<ViewStyle>;
  rowStyle: StyleProp<ViewStyle>;
  rows: readonly { content: ReactNode; testID?: string }[];
  testID?: string;
};

export const COMPACT_METRIC_CARD_STYLES = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  main: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 15, fontWeight: '700' },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  stats: { minWidth: 56, alignItems: 'flex-end', gap: 4 },
  acc: { fontSize: 12, fontWeight: '700' },
  rks: { fontSize: 20, fontWeight: '900' },
});

export function GameScoreCard({
  presentation,
  children,
  side,
  metricSide,
  tagRows,
  cardStyle,
  mainStyle,
  titleStyle,
  pressedStyle,
  pressable = true,
  artwork,
  testID,
}: {
  presentation: ScoreCardPresentation;
  children: ReactNode;
  side?: ReactNode;
  metricSide?: ScoreCardMetricSide;
  tagRows?: ScoreCardTagRows;
  cardStyle: StyleProp<ViewStyle>;
  mainStyle: StyleProp<ViewStyle>;
  titleStyle: StyleProp<TextStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  pressable?: boolean;
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
  const [failedArtworkSource, setFailedArtworkSource] = useState<string | null>(null);
  const artworkSource = artwork?.source?.trim() || null;
  const showArtwork = artworkActive && artworkSource !== null && failedArtworkSource !== artworkSource;
  const overlayColor = theme.dark ? '0,0,0' : '255,255,255';
  const cardBackground = { backgroundColor: theme.surface };
  const resolvedCardStyle = showArtwork
    ? [cardStyle, cardBackground, styles.artworkClip]
    : [cardStyle, cardBackground];
  const openDetail = () => router.push(detailTargetHref(presentation.route) as Href);
  const sideNode = side !== undefined
    ? side
    : metricSide
      ? (
          <View style={metricSide.blockStyle}>
            {metricSide.lines.map((line, index) => (
              <Text key={index} style={[line.style, { color: line.color }]}>{line.text}</Text>
            ))}
          </View>
        )
      : null;
  const content = (
    <>
      {showArtwork ? (
        <>
          <RemoteImage
            accessibilityIgnoresInvertColors
            blurRadius={artworkBlur}
            {...(artwork?.cachePolicy === 'none'
              ? { cacheProfile: 'none' as const }
              : { cacheProfile: 'thumbnail' as const, gameId: presentation.gameId })}
            contentFit="cover"
            onError={() => setFailedArtworkSource(artworkSource)}
            pointerEvents="none"
            source={artworkSource}
            style={[StyleSheet.absoluteFillObject, artwork?.scale ? { transform: [{ scale: artwork.scale }] } : null]}
            testID="score-card-artwork"
          />
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: `rgba(${overlayColor},${1 - artworkTransparency / 100})` },
            ]}
            testID="score-card-artwork-overlay"
          />
        </>
      ) : null}
      <View style={mainStyle}>
        <Text numberOfLines={1} style={[titleStyle, { color: theme.text }]}>
          {presentation.position ? `${presentation.position}. ` : ''}{presentation.title}
        </Text>
        {children}
        {tagRows && (
          <View style={tagRows.containerStyle} testID={tagRows.testID}>
            {tagRows.rows.map((row, index) => (
              <View key={index} style={tagRows.rowStyle} testID={row.testID}>{row.content}</View>
            ))}
          </View>
        )}
      </View>
      {sideNode}
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
  artworkClip: { overflow: 'hidden' },
});
