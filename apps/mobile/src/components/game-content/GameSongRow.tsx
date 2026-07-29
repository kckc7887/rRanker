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
import type { SongRowPresentation } from '@/features/game-content/presentation';
import { useAppTheme } from '@/theme/app-theme';

type GameSongRowProps = {
  presentation: SongRowPresentation;
  cover: ReactNode;
  badges: ReactNode;
  accessory?: ReactNode;
  rowStyle: StyleProp<ViewStyle>;
  mainStyle: StyleProp<ViewStyle>;
  titleStyle: StyleProp<TextStyle>;
  subtitleStyle: StyleProp<TextStyle>;
  openStyle?: StyleProp<ViewStyle>;
  titleWrapperStyle?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  subtitle?: string;
  subtitleContent?: ReactNode;
  wholeRowPressable?: boolean;
  testID?: string;
  accessibilityLabel?: string | null;
};

export function GameSongRow({
  presentation,
  cover,
  badges,
  accessory,
  rowStyle,
  mainStyle,
  titleStyle,
  subtitleStyle,
  openStyle,
  titleWrapperStyle,
  pressedStyle,
  subtitle = presentation.subtitle,
  subtitleContent,
  wholeRowPressable = false,
  testID,
  accessibilityLabel = presentation.accessibilityLabel,
}: GameSongRowProps) {
  const theme = useAppTheme();
  const openDetail = () => router.push(
    `/songs/${encodeURIComponent(presentation.route.songId)}` as Href,
  );
  const title = (
    <Text numberOfLines={2} style={[titleStyle, { color: theme.text }]}>
      {presentation.title}
    </Text>
  );
  const content = (
    <>
      {cover}
      <View style={mainStyle}>
        {titleWrapperStyle ? <View style={titleWrapperStyle}>{title}</View> : title}
        <Text numberOfLines={1} style={[subtitleStyle, { color: theme.textMuted }]}>
          {subtitleContent ?? subtitle}
        </Text>
        {badges}
      </View>
    </>
  );

  if (wholeRowPressable) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel ?? undefined}
        accessibilityRole="button"
        onPress={openDetail}
        testID={testID}
        style={({ pressed }) => [
          rowStyle,
          { backgroundColor: theme.surface },
          pressed && pressedStyle,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[rowStyle, { backgroundColor: theme.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? undefined}
        onPress={openDetail}
        style={openStyle}
      >
        {content}
      </Pressable>
      {accessory}
    </View>
  );
}
