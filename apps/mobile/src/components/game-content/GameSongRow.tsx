import { useState, type ReactNode } from 'react';
import { RemoteImage as Image } from '@/components/RemoteImage';
import { router, type Href } from 'expo-router';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { SongRowPresentation } from '@/features/game-content/presentation';
import { useAppTheme } from '@/theme/app-theme';

/** 封面图两态渲染描述：source 为空或加载失败时回退 ♪ 占位；wrapStyle 提供时额外包一层固定外框。 */
export type SongRowCoverImage = {
  source: string | null;
  accessibilityLabel: string;
  imageStyle: StyleProp<ImageStyle>;
  wrapStyle?: StyleProp<ViewStyle>;
  placeholderStyle: StyleProp<ViewStyle>;
  noteStyle: StyleProp<TextStyle>;
};

/** 固定外框封面行样式组。 */
export const WRAPPED_COVER_ROW_STYLES = StyleSheet.create({
  row: { borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  openSong: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  coverWrap: { width: 58, height: 58 },
  cover: { width: 58, height: 58, borderRadius: 9 },
  placeholder: { width: 58, height: 58, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  placeholderNote: { color: '#6B7280', fontSize: 24 },
  meta: { flex: 1, gap: 3 },
  title: { fontWeight: '700' },
  composer: { fontSize: 11 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
});

type GameSongRowProps = {
  presentation: SongRowPresentation;
  cover: ReactNode;
  badges: ReactNode;
  coverImage?: SongRowCoverImage;
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
  /** false 时整行不可点击（歌曲详情未接入的游戏）；缺省 true，行为不变。 */
  pressable?: boolean;
  testID?: string;
  accessibilityLabel?: string | null;
  matchNote?: ReactNode;
  matchNoteStyle?: StyleProp<TextStyle>;
};

export function GameSongRow({
  presentation,
  cover,
  badges,
  coverImage,
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
  pressable = true,
  testID,
  accessibilityLabel = presentation.accessibilityLabel,
  matchNote,
  matchNoteStyle,
}: GameSongRowProps) {
  const theme = useAppTheme();
  // 封面失败回退状态机：失败后固定 ♪ 占位，直到组件卸载（与各游戏原有行为一致）
  const [coverFailed, setCoverFailed] = useState(false);
  const openDetail = () => router.push(
    `/songs/${encodeURIComponent(presentation.route.songId)}` as Href,
  );
  const title = (
    <Text numberOfLines={2} style={[titleStyle, { color: theme.text }]}>
      {presentation.title}
    </Text>
  );
  const coverImageNode = coverImage && coverImage.source != null && !coverFailed ? (
    <Image
      accessibilityLabel={coverImage.accessibilityLabel}
      cachePolicy="disk"
      cacheProfile="thumbnail"
      gameId={presentation.gameId}
      contentFit="cover"
      onError={() => setCoverFailed(true)}
      source={coverImage.source}
      style={coverImage.imageStyle}
      transition={120}
    />
  ) : null;
  const coverPlaceholderNode = coverImage ? (
    <View style={coverImage.placeholderStyle}>
      <Text style={coverImage.noteStyle}>♪</Text>
    </View>
  ) : null;
  const coverNode = !coverImage
    ? cover
    : coverImage.wrapStyle !== undefined
      ? <View style={coverImage.wrapStyle}>{coverImageNode ?? coverPlaceholderNode}</View>
      : coverImageNode ?? coverPlaceholderNode;
  const content = (
    <>
      {coverNode}
      <View style={mainStyle}>
        {titleWrapperStyle ? <View style={titleWrapperStyle}>{title}</View> : title}
        {matchNote != null && (
          <Text numberOfLines={1} style={[matchNoteStyle ?? subtitleStyle, { color: theme.textMuted }]}>
            {matchNote}
          </Text>
        )}
        <Text numberOfLines={1} style={[subtitleStyle, { color: theme.textMuted }]}>
          {subtitleContent ?? subtitle}
        </Text>
        {badges}
      </View>
    </>
  );

  if (!pressable) {
    return (
      <View style={[rowStyle, { backgroundColor: theme.surface }]} testID={testID}>
        {content}
        {accessory}
      </View>
    );
  }

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
