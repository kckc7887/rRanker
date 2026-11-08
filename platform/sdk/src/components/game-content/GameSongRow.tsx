import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { SongRowPresentation } from '@rranker/sdk/features/game-content/presentation';
import { detailHref } from '@rranker/sdk/navigation';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';
import { GameSongCover } from '@rranker/sdk/components/game-content/GameSongCover';

type GameSongRowProps = {
  presentation: SongRowPresentation;
  cover?: ReactNode;
  coverSource?: string | null;
  coverLabel?: string;
  coverRadius?: number;
  placeholderColor?: string;
  badges?: ReactNode;
  subtitleContent?: ReactNode;
  matchedAlias?: string;
  wholeRowPressable?: boolean;
  favorite?: boolean;
  favoritePending?: boolean;
  onFavoriteChange?: (favorite: boolean) => void;
  testID?: string;
  accessibilityLabel?: string | null;
};

export function GameSongRow({
  presentation, cover, coverSource, coverLabel, coverRadius, placeholderColor,
  badges, matchedAlias, subtitleContent, wholeRowPressable = false,
  favorite = false, favoritePending, onFavoriteChange, testID, accessibilityLabel = presentation.accessibilityLabel,
}: GameSongRowProps) {
  const theme = useAppTheme();
  const open = () => router.push(detailHref(presentation.route));
  const content = <>
    {cover !== undefined ? cover : <GameSongCover source={coverSource ?? null} gameId={presentation.gameId}
      size={wholeRowPressable ? 62 : 58} borderRadius={coverRadius} accessibilityLabel={coverLabel}
      placeholderColor={placeholderColor} />}
    <View style={[styles.main, wholeRowPressable && styles.spacious]}>
      <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>{presentation.title}</Text>
      {matchedAlias ? <Text numberOfLines={1} style={[styles.meta, { color: theme.textMuted }]}>别名：{matchedAlias}</Text> : null}
      <Text numberOfLines={1} style={[styles.meta, { color: theme.textMuted }]}>{subtitleContent ?? presentation.subtitle}</Text>
      {badges}
    </View>
  </>;
  if (wholeRowPressable) return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? undefined}
    testID={testID} onPress={open} style={({ pressed }) => [
      styles.row, styles.whole, { backgroundColor: theme.surface }, pressed && styles.pressed,
    ]}>{content}</Pressable>;
  return <View style={[styles.row, { backgroundColor: theme.surface }]} testID={testID}>
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? undefined}
      onPress={open} style={styles.open}>{content}</Pressable>
    {onFavoriteChange ? <Pressable accessibilityRole="button" disabled={favoritePending}
      accessibilityLabel={`${favorite ? '取消收藏' : '收藏'} ${presentation.title}`}
      onPress={() => onFavoriteChange(!favorite)} style={styles.favorite}>
      <Ionicons name={favorite ? 'heart' : 'heart-outline'} color={theme.accent} size={24} />
    </Pressable> : null}
  </View>;
}

export function SongRowBadges({ children, accessibilityLabel }: { children: ReactNode; accessibilityLabel?: string }) {
  return <View accessibilityLabel={accessibilityLabel} style={styles.badges}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  whole: { gap: 11 },
  main: { flex: 1, gap: 3 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
  spacious: { gap: 4 },
  title: { fontWeight: '700', flexShrink: 1 },
  meta: { fontSize: 11 },
  favorite: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
});
