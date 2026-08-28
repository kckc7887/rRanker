import { createContext, useContext, useState, type ReactNode } from 'react';
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
import { RemoteImage } from '@/components/RemoteImage';
import { useThemeStore } from '@/state/theme-store';
import { useAppTheme } from '@/theme/app-theme';

const ScoreCardArtworkScopeContext = createContext(false);

export function ScoreCardArtworkScope({ children }: { children: ReactNode }) {
  return <ScoreCardArtworkScopeContext.Provider value>{children}</ScoreCardArtworkScopeContext.Provider>;
}

export function useScoreCardArtworkActive(): boolean {
  const inScope = useContext(ScoreCardArtworkScopeContext);
  const enabled = useThemeStore((state) => state.scoreCardArtworkEnabled);
  return inScope && enabled;
}

export type ScoreCardArtwork = {
  source: string | null | undefined;
  scale?: number;
};

/** 右侧大数字指标块（Rating/RKS 等）：块容器样式 + 若干「文本行」（样式与颜色由调用方给定）。 */
export type ScoreCardMetricSide = {
  blockStyle: StyleProp<ViewStyle>;
  lines: readonly {
    text?: string;
    style: StyleProp<TextStyle>;
    color: string;
  }[];
};

/** 标签行组：容器 + 每行样式与内容（内容为各游戏徽章组合）。 */
export type ScoreCardTagRows = {
  containerStyle: StyleProp<ViewStyle>;
  rowStyle: StyleProp<ViewStyle>;
  rows: readonly { content: ReactNode; testID?: string }[];
  testID?: string;
};

/** 紧凑指标侧栏成绩卡样式组。 */
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
  artwork?: ScoreCardArtwork;
  testID?: string;
}) {
  const theme = useAppTheme();
  const artworkActive = useScoreCardArtworkActive();
  const artworkBlur = useThemeStore((state) => state.scoreCardArtworkBlur);
  const artworkTransparency = useThemeStore((state) => state.scoreCardArtworkTransparency);
  const [failedArtworkSource, setFailedArtworkSource] = useState<string | null>(null);
  const artworkSource = artwork?.source?.trim() || null;
  const showArtwork = artworkActive && artworkSource !== null && failedArtworkSource !== artworkSource;
  const overlayColor = theme.dark ? '0,0,0' : '255,255,255';
  const cardBackground = { backgroundColor: theme.surface };
  const resolvedCardStyle = showArtwork
    ? [cardStyle, cardBackground, styles.artworkClip]
    : [cardStyle, cardBackground];
  const openDetail = () => router.push({
    pathname: '/songs/[songId]',
    params: {
      songId: presentation.route.songId,
      ...(presentation.route.chartType ? { chartType: presentation.route.chartType } : {}),
      ...(presentation.route.levelIndex === undefined
        ? {}
        : { levelIndex: String(presentation.route.levelIndex) }),
      ...presentation.route.params,
    },
  } as Href);
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
