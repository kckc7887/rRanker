import { memo } from 'react';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  findTagGroup,
  findTagItem,
  type GameManifestV1,
  type ScoreCardDocument,
} from '@/domain/game-model';
import { GameTag, formatGameTag } from './GameTag';
import { useAppTheme } from '@/theme/app-theme';

function tagValue(manifest: GameManifestV1, record: ScoreCardDocument['primaryValue']): string {
  const text = formatGameTag(manifest, record);
  const label = findTagItem(manifest, record)?.label;
  return label && text.startsWith(`${label} `) ? text.slice(label.length + 1) : text;
}

export const GameScoreCard = memo(function GameScoreCard({
  manifest,
  record,
  position,
}: {
  manifest: GameManifestV1;
  record: ScoreCardDocument;
  position?: number;
}) {
  const theme = useAppTheme();
  const trailingLabel = record.trailingMetric
    ? findTagItem(manifest, record.trailingMetric)?.label
    : undefined;
  const allTags = record.tagRows.flat();
  const typeTag = allTags.find((tag) => findTagGroup(manifest, tag.groupId)?.role === 'type-axis');
  const difficultyTag = allTags.find(
    (tag) => findTagGroup(manifest, tag.groupId)?.role === 'difficulty-axis',
  );
  const chartDescription = [
    typeTag && tagValue(manifest, typeTag),
    difficultyTag?.itemId,
  ].filter(Boolean).join(' ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`查看谱面 ${record.title}${chartDescription ? ` ${chartDescription}` : ''}`}
      onPress={() => router.push({
        pathname: '/songs/[songId]',
        params: { songId: record.songId, chartId: record.chartId },
      } as Href)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.surface },
        pressed && styles.pressed,
      ]}
      testID={`game-score-card-${record.id}`}
    >
      <View style={styles.main}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
          {position ? `${position}. ` : ''}{record.title}
        </Text>
        <Text testID={`game-score-primary-${record.id}`} style={[styles.primary, { color: theme.text }]}>
          {tagValue(manifest, record.primaryValue)}
        </Text>
        <View style={styles.tagRows}>
          {record.tagRows.filter((row) => row.length > 0).map((row, index) => (
            <View key={index} testID={`game-score-tags-${record.id}-${index}`} style={styles.tagRow}>
              {row.map((tag, tagIndex) => (
                <GameTag
                  key={`${tag.groupId}:${tag.itemId}:${tagIndex}`}
                  manifest={manifest}
                  tag={tag}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
      {record.trailingMetric ? (
        <View style={styles.trailing}>
          <Text style={[styles.trailingLabel, { color: theme.textMuted }]}>
            {trailingLabel}
          </Text>
          <Text style={[styles.trailingValue, { color: theme.accent }]}>
            {tagValue(manifest, record.trailingMetric)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pressed: { opacity: 0.72 },
  main: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 15, fontWeight: '700' },
  primary: { fontSize: 24, lineHeight: 30, fontWeight: '900', letterSpacing: -0.4 },
  tagRows: { gap: 5, marginTop: 4 },
  tagRow: { minHeight: 22, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  trailing: { minWidth: 58, alignItems: 'flex-end', gap: 2 },
  trailingLabel: { fontSize: 10, fontWeight: '700' },
  trailingValue: { fontSize: 18, fontWeight: '900' },
});
