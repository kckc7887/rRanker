import type { ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DxRatingCard } from '@/components/DxRatingCard';
import { SourceStatus } from '@/components/SourceStatus';
import type { ActionRef, GameDataDocumentV1 } from '@/domain/game-model';
import { useAppTheme } from '@/theme/app-theme';

export function GameOverviewContent({
  document,
  refreshing,
  bottomInset,
  onRefresh,
  onAction,
  pinnedContent,
}: {
  document: GameDataDocumentV1;
  refreshing: boolean;
  bottomInset: number;
  onRefresh: () => void;
  onAction: (action: ActionRef) => void;
  pinnedContent?: ReactNode;
}) {
  const theme = useAppTheme();
  const overview = document.overview;
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={styles.scroll}
      testID="overview-scroll"
      alwaysBounceVertical
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.accent}
          colors={[theme.accent]}
        />
      )}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 20 }]}
      scrollIndicatorInsets={{ bottom: bottomInset }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`当前玩家 ${overview.accountName}，点击切换账号`}
        onPress={() => onAction(overview.accountAction)}
        style={({ pressed }) => [styles.nameRow, pressed && styles.pressed]}
      >
        <Text style={[styles.name, { color: theme.text }]}>{overview.accountName}</Text>
        <Text style={[styles.switchHint, { color: theme.accent }]}>·点击切换·</Text>
      </Pressable>

      <DxRatingCard
        label={overview.infoCard.label}
        display={overview.infoCard.value}
        rating={Number.isFinite(Number(overview.infoCard.value))
          ? Number(overview.infoCard.value)
          : null}
        meta={overview.infoCard.meta}
        sideBadge={overview.infoCard.sideBadge
          ? { title: overview.infoCard.sideBadge.label, value: overview.infoCard.sideBadge.value }
          : undefined}
      />

      <View style={[
        styles.actionRow,
        { backgroundColor: theme.accent },
        overview.syncActions.length === 1 && styles.singleAction,
      ]}>
        {overview.syncActions.map((item, index) => (
          <View key={`${item.action.id}:${index}`} style={styles.actionSlot}>
            {index > 0 ? <View style={styles.actionDivider} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.accessibilityLabel ?? `${item.title}，${item.subtitle}`}
              onPress={() => onAction(item.action)}
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
            >
              <Text style={styles.actionTitle}>{item.title}</Text>
              <Text style={styles.actionSubtitle}>{item.subtitle}</Text>
            </Pressable>
          </View>
        ))}
      </View>

      {pinnedContent}

      <Pressable
        accessibilityRole="button"
        onPress={() => onAction({ id: 'route', params: { href: '/tools' } })}
      >
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>工具箱</Text>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.body, { color: theme.textSecondary }]}
          >
            {overview.toolboxSummary}
          </Text>
          <Text style={[styles.link, { color: theme.accent }]}>打开工具箱 →</Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => onAction({ id: 'route', params: { href: '/library' } })}
      >
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>我的曲库</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>{overview.librarySummary}</Text>
          <Text style={[styles.link, { color: theme.accent }]}>打开收藏与练习清单 →</Text>
        </View>
      </Pressable>

      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>数据状态</Text>
        <SourceStatus items={overview.sources.map((source) => ({
          key: source.id,
          label: source.label,
          updatedAt: source.updatedAt,
          state: source.state,
        }))} />
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          当前版本：{overview.currentVersion}
        </Text>
        {overview.sources.some((source) => source.updatedAt) ? (
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            更新时间：{new Date(Math.max(...overview.sources.flatMap(
              (source) => source.updatedAt ? [Date.parse(source.updatedAt)] : [],
            ))).toLocaleString()}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 },
  name: { fontSize: 28, fontWeight: '900' },
  switchHint: { fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  actionRow: { minHeight: 68, borderRadius: 14, flexDirection: 'row', overflow: 'hidden' },
  singleAction: { alignSelf: 'stretch' },
  actionSlot: { flex: 1, flexDirection: 'row' },
  actionDivider: { width: StyleSheet.hairlineWidth, backgroundColor: '#FFFFFF66' },
  actionButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  actionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  actionSubtitle: { color: '#FFFFFFCC', fontSize: 10, fontWeight: '600' },
  card: { borderRadius: 14, padding: 15, gap: 6 },
  cardTitle: { fontSize: 17, fontWeight: '900' },
  body: { fontSize: 12, lineHeight: 18 },
  link: { fontSize: 12, fontWeight: '800' },
});
