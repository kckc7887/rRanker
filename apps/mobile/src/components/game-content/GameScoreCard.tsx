import type { ReactNode } from 'react';
import { router, type Href } from 'expo-router';
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { ScoreCardPresentation } from '@/features/game-content/presentation';
import { useAppTheme } from '@/theme/app-theme';

export function GameScoreCard({
  presentation,
  children,
  side,
  cardStyle,
  mainStyle,
  titleStyle,
  pressedStyle,
  testID,
}: {
  presentation: ScoreCardPresentation;
  children: ReactNode;
  side?: ReactNode;
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
  const content = (
    <>
      <View style={mainStyle}>
        <Text numberOfLines={1} style={[titleStyle, { color: theme.text }]}>
          {presentation.position ? `${presentation.position}. ` : ''}{presentation.title}
        </Text>
        {children}
      </View>
      {side}
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
