import type { ReactNode } from 'react';
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
import { useAppTheme } from '@/theme/app-theme';

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

/**
 * 紧凑指标侧栏成绩卡样式组。
 * 源自 Phigros 布局，Phigros/Phira 共用；收敛到公共层以消除 Phira 对 Phigros 文件的跨游戏样式依赖。
 */
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
  testID?: string;
}) {
  const theme = useAppTheme();
  const openDetail = () => router.push({
    pathname: '/songs/[songId]',
    params: {
      songId: presentation.route.songId,
      ...(presentation.route.chartType ? { chartType: presentation.route.chartType } : {}),
      ...(presentation.route.levelIndex === undefined
        ? {}
        : { levelIndex: String(presentation.route.levelIndex) }),
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
          cardStyle,
          { backgroundColor: theme.surface },
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
      style={[cardStyle, { backgroundColor: theme.surface }]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}
