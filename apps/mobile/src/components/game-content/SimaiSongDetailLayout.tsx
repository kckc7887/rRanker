import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/app-theme';
import type { NoteGroupPresentation } from '@/features/game-content/presentation';
import { AutoScrollText } from './AutoScrollText';
import { DetailPressable } from './DetailPressable';
import { GameNoteTable } from './GameNoteTable';
import { SongDetailChrome, type SongDetailFavoriteOptions } from './SongDetailChrome';
import { SongDetailHero } from './SongDetailHero';
import { SongMetadataTable, type SongMetadataItem } from './SongMetadataTable';
import { simaiSongDetailStyles as styles } from './SimaiSongDetailStyles';

export type SimaiChartVisual = {
  color: string; tint: string; badgeBackground: string; badgeBorder: string; badgeText: string;
};

export function simaiChartActionStyle(dark: boolean, visual: SimaiChartVisual, filled: boolean, inverted = false) {
  if (dark) return inverted
    ? { backgroundColor: visual.badgeBackground, borderColor: visual.badgeBorder }
    : { backgroundColor: visual.color, borderColor: visual.color };
  return filled ? { backgroundColor: visual.color, borderColor: visual.color } : { borderColor: visual.color };
}

export function simaiChartActionTextStyle(dark: boolean, visual: SimaiChartVisual, filled: boolean, inverted = false) {
  return { color: dark ? (inverted ? visual.badgeText : '#FFFFFF') : filled ? '#FFFFFF' : visual.color };
}

export function SimaiSongHero({ size, cover, id, title, artist }: {
  size: number; cover: ReactNode; id: string; title: string; artist?: string;
}) {
  return <SongDetailHero size={size} style={styles.hero} cover={cover}
    placeholderStyle={styles.hero} placeholderNoteStyle={styles.title}
    shadeColors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.40)']} shadeStyle={styles.heroShade} copyStyle={styles.heroCopy}>
    <AutoScrollText text={`#${id}`} textStyle={styles.songId} style={styles.singleLine} contentContainerStyle={styles.singleLineContent} />
    <AutoScrollText text={title} textStyle={styles.title} style={styles.singleLine} contentContainerStyle={styles.singleLineContent} />
    <AutoScrollText text={artist ?? '曲师未知'} textStyle={styles.artist} style={styles.singleLine} contentContainerStyle={styles.singleLineContent} />
  </SongDetailHero>;
}

export function SimaiSongChrome({ favorite }: { favorite?: SongDetailFavoriteOptions }) {
  const insets = useSafeAreaInsets();
  return <SongDetailChrome topInset={insets.top}
    backStyle={pressed => [styles.headerButton, styles.headerFloatingButton, { top: insets.top, left: 8 }, pressed && { opacity: 0.7 }]}
    favorite={favorite}
    favoriteStyle={pressed => [styles.headerButton, styles.headerFloatingButton, { top: insets.top, right: 8 },
      favorite?.active && styles.headerFavoriteActive, pressed && { opacity: 0.7 }]} />;
}

export function SimaiSongMetadata({ items, testIDPrefix = 'metadata' }: {
  items: readonly SongMetadataItem[]; testIDPrefix?: string;
}) {
  return <SongMetadataTable accessibilityLabel="歌曲详情数据" items={items} interaction="platform-detail"
    cellRootStyle={styles.metadataCellRoot} cellStyle={styles.metadataCell} labelStyle={styles.metadataLabel}
    measureStyle={styles.metadataValueMeasure} style={styles.metadataTable} testIDPrefix={testIDPrefix}
    valueBlockStyle={styles.metadataValueBlock} valueStyle={styles.metadataValue} />;
}

export function SimaiChartResultLayout({ identity, level, secondaryLevel, result, badges, extraMetric }: {
  identity: ReactNode; level: string; secondaryLevel?: string; result: ReactNode; badges: ReactNode; extraMetric?: ReactNode;
}) {
  const theme = useAppTheme();
  return <>
    <View style={styles.chartHeader}>
      <View style={styles.chartIdentity}>{identity}</View>
      <View style={styles.levelBlock}>
        <Text style={[styles.level, { color: theme.text }]}>{level}</Text>
        {secondaryLevel !== undefined ? <Text style={[styles.constant, { color: theme.textMuted }]}>{secondaryLevel}</Text> : null}
      </View>
    </View>
    <View style={styles.resultRow}><View style={styles.resultMain}>
      <Text style={[styles.achievementLabel, { color: theme.textMuted }]}>达成率</Text>
      {result}
      <View style={styles.statusRow}>{badges}</View>
      {extraMetric}
    </View></View>
    <View style={[styles.chartDivider, { backgroundColor: theme.border }]} />
  </>;
}

export function SimaiNoteTable({ group, label, onPress, accessibilityLabel }: {
  group: NoteGroupPresentation; label?: string; onPress: () => void; accessibilityLabel: string;
}) {
  const theme = useAppTheme();
  return <DetailPressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
    style={({ pressed }) => [styles.notesAction, pressed && styles.notesActionPressed]}>
    {label ? <Text style={[styles.notesPlayerLabel, { color: theme.text }]}>{label}</Text> : null}
    <GameNoteTable mode="grid" group={group} accessibilityLabel="谱面物量"
      containerStyle={[styles.notesTable, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}
      rowStyle={styles.notesRow} headerRowStyle={styles.notesHeaderRow}
      headerTextStyle={[styles.notesCell, styles.notesHeader, { color: theme.textMuted }]}
      valueTextStyle={[styles.notesCell, styles.notesValue, { color: theme.text }]} />
    <Text style={[styles.notesHint, { color: theme.textMuted }]}>点击物量表，前往达成率与容错计算</Text>
  </DetailPressable>;
}

export function SimaiNoteStatus({ loading, onRetry }: { loading: boolean; onRetry?: () => void }) {
  const theme = useAppTheme();
  return <View>
    <Text style={[styles.chartMeta, { color: theme.textSecondary }]}>{loading ? '加载物量中…' : '物量不可用'}</Text>
    {!loading && onRetry ? <DetailPressable accessibilityRole="button" accessibilityLabel="重试谱面物量" onPress={onRetry}>
      <Text style={[styles.chartMeta, { color: theme.accent }]}>重试</Text>
    </DetailPressable> : null}
  </View>;
}
