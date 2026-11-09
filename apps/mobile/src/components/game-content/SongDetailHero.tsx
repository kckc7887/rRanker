import type { ReactNode } from 'react';
import { LinearGradient, type LinearGradientProps } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';
import { AutoScrollText } from './AutoScrollText';
import { VERTICAL_SONG_DETAIL_STYLES as vertical } from './SongDetailChromeStyles';

const full = StyleSheet.create({
  hero: { position: 'relative', overflow: 'hidden' },
  heroCopy: { position: 'absolute', left: 20, right: 20, bottom: 18, gap: 3 },
  songId: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  title: { color: '#FFFFFF', fontSize: 28, lineHeight: 34, fontWeight: '900' },
  artist: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  placeholderNote: { color: '#6B7280', fontSize: 60 },
});

export function SongDetailHero({ size, cover, id, title, artist, fullShade, shadeColors, shadeLocations = [0, 1],
  scroll = 'title', titleTestID, artistTestID, testID, style, idStyle, titleStyle, artistStyle, scrollStyle, scrollContentStyle }: {
  size: number; cover?: ReactNode; id: string; title: string; artist: string;
  fullShade?: boolean; shadeColors?: LinearGradientProps['colors']; shadeLocations?: LinearGradientProps['locations'];
  scroll?: 'title' | 'title-artist' | 'all'; titleTestID?: string; artistTestID?: string; testID?: string;
  style?: StyleProp<ViewStyle>; idStyle?: StyleProp<TextStyle>; titleStyle?: StyleProp<TextStyle>; artistStyle?: StyleProp<TextStyle>;
  scrollStyle?: StyleProp<ViewStyle>; scrollContentStyle?: StyleProp<ViewStyle>;
}) {
  const theme = useAppTheme();
  const styles = fullShade ? full : vertical;
  const scrollingLine = (text: string, textStyle: StyleProp<TextStyle>, lineTestID?: string) =>
    <AutoScrollText text={text} textStyle={textStyle} style={scrollStyle ?? vertical.singleLine}
      contentContainerStyle={scrollContentStyle ?? vertical.singleLineContent} testID={lineTestID} />;
  return <View testID={testID} style={[styles.hero, style, { width: size, height: size }]}>
    {cover ?? <View style={[vertical.heroPlaceholder, { backgroundColor: fullShade ? '#D1D5DB' : theme.input }]}>
      <Text style={fullShade ? full.placeholderNote : vertical.heroPlaceholderNote}>♪</Text>
    </View>}
    <LinearGradient colors={shadeColors ?? ['rgba(0,0,0,0)', fullShade ? 'rgba(0,0,0,0.48)' : 'rgba(0,0,0,0.40)']}
      locations={shadeLocations} pointerEvents="none" style={fullShade ? StyleSheet.absoluteFill : vertical.heroShade} />
    <View style={styles.heroCopy}>
      {scroll === 'all' ? scrollingLine(id, idStyle ?? styles.songId) : <Text numberOfLines={1} style={idStyle ?? styles.songId}>{id}</Text>}
      {scrollingLine(title, titleStyle ?? styles.title, titleTestID)}
      {scroll === 'title' ? <Text numberOfLines={1} style={artistStyle ?? styles.artist}>{artist}</Text>
        : scrollingLine(artist, artistStyle ?? styles.artist, artistTestID)}
    </View>
  </View>;
}
