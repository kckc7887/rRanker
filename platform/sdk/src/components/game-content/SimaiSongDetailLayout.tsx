import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';
import type { NoteGroupPresentation } from '@rranker/sdk/features/game-content/presentation';
import { DetailPressable } from '@rranker/sdk/components/game-content/DetailPressable';
import { GameNoteTable } from '@rranker/sdk/components/game-content/GameNoteTable';
import { SongDetailHero } from '@rranker/sdk/components/game-content/SongDetailHero';
import { SongMetadataTable, type SongMetadataItem } from '@rranker/sdk/components/game-content/SongMetadataTable';
import { simaiSongDetailStyles as styles } from '@rranker/sdk/components/game-content/SimaiSongDetailStyles';

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
  return <SongDetailHero size={size} cover={cover} id={`#${id}`} title={title} artist={artist ?? '曲师未知'} scroll="all" />;
}

export function SimaiSongMetadata({ items, testIDPrefix = 'metadata' }: {
  items: readonly SongMetadataItem[]; testIDPrefix?: string;
}) {
  return <SongMetadataTable accessibilityLabel="歌曲详情数据" items={items} interaction="platform-detail"
    cellRootStyle={styles.metadataCellRoot} testIDPrefix={testIDPrefix} />;
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
  group: NoteGroupPresentation; label?: string; onPress?: () => void; accessibilityLabel: string;
}) {
  const theme = useAppTheme();
  return <DetailPressable accessibilityRole="button" accessibilityLabel={onPress ? accessibilityLabel : undefined} onPress={onPress} disabled={!onPress}
    style={({ pressed }) => [styles.notesAction, pressed && styles.notesActionPressed]}>
    {label ? <Text style={[styles.notesPlayerLabel, { color: theme.text }]}>{label}</Text> : null}
    <GameNoteTable mode="grid" group={group} accessibilityLabel="谱面物量" />
    {onPress ? <Text style={[styles.notesHint, { color: theme.textMuted }]}>点击物量表，前往达成率与容错计算</Text> : null}
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
