import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, type Href } from 'expo-router';
import { AppModal } from '@/components/AppModal';
import { Card } from '@/components/Card';
import { EmptyDataView } from '@/components/EmptyDataView';
import { PhigrosDifficultyBadge } from '@/components/phigros/PhigrosDifficultyBadge';
import { PhigrosStrengthRadar } from '@/components/phigros/PhigrosStrengthRadar';
import { buildPhigrosKyouChartTagIndex } from '@/domain/phigros-kyou';
import { phigrosLevelLabel } from '@/domain/phigros-level-theme';
import {
  analyzePhigrosStrength,
  type PhigrosStrengthChartSample,
  type PhigrosStrengthRecommendation,
  type PhigrosTagRksStat,
} from '@/domain/phigros-strength-analysis';
import { useGameData } from '@/hooks/use-game-data';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { usePhigrosKyouChartTags } from '@/hooks/use-phigros-kyou';
import { useAppTheme } from '@/theme/app-theme';

const POOL_DESCRIPTION = '阈值取玩家 RKS 减 0.2 后向下保留一位小数，最高为 16.0。候选池包含定数达到阈值的全部谱面，稀缺系数只由候选数量决定；基础分析池仅包含 RKS 达标且评级 A 以上的成绩。标签基础样本为 1–2 张时，从候选池内已有成绩但未入分析池的同标签谱面按 RKS 向下补入最多 5 张，参与标签平均、覆盖率和歌曲列表。再对未达到同类满分基准的结果应用校准并封顶。';

function Metric({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.metric, { backgroundColor: theme.surfaceMuted }]}>
      <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function MainSummary({
  label,
  tag,
  tone,
  onPress,
}: {
  label: string;
  tag: PhigrosTagRksStat | null;
  tone: 'strong' | 'weak';
  onPress: (tag: PhigrosTagRksStat) => void;
}) {
  const theme = useAppTheme();
  const color = tone === 'strong' ? theme.accent : theme.warning;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tag ? `查看${tag.name}标签歌曲列表` : `${label}暂无样本`}
      disabled={!tag}
      onPress={() => { if (tag) onPress(tag); }}
      style={({ pressed }) => [styles.summaryBox, { borderColor: color, backgroundColor: theme.surface }, pressed && styles.pressed]}
    >
      <Text style={[styles.summaryLabel, { color }]}>{label}</Text>
      <Text style={[styles.summaryName, { color: theme.text }]}>{tag?.name ?? '—'}</Text>
      <Text style={[styles.summaryValue, { color: theme.textSecondary }]}>
        {tag?.averageRks == null
          ? '暂无样本'
          : `${tag.averageRks.toFixed(4)} · ×${tag.coefficient.toFixed(4)} · ${tag.sampleCount} 张${tag.supplementedSampleCount > 0 ? ` · 下取 ${tag.supplementedSampleCount}` : ''}${tag.isSmallSample ? ' · 样本较少' : ''}`}
      </Text>
    </Pressable>
  );
}

function MainTieSummary({ rks }: { rks: number }) {
  const theme = useAppTheme();
  return (
    <View
      accessible
      accessibilityLabel={`五维主标签持平，修正后标签 RKS 均为 ${rks.toFixed(4)}`}
      style={[styles.tieSummary, { backgroundColor: theme.surfaceMuted }]}
    >
      <Text style={[styles.tieSummaryLabel, { color: theme.accent }]}>五维持平</Text>
      <Text style={[styles.tieSummaryValue, { color: theme.text }]}>{rks.toFixed(4)}</Text>
      <Text style={[styles.tieSummaryDetail, { color: theme.textMuted }]}>全部主标签达到同一修正基准，不判定相对最强或最弱。</Text>
    </View>
  );
}

function MainTagStat({
  tag,
  onPress,
}: {
  tag: PhigrosTagRksStat;
  onPress: (tag: PhigrosTagRksStat) => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`查看${tag.name}标签歌曲列表`}
      onPress={() => onPress(tag)}
      style={({ pressed }) => [styles.mainTagStat, { backgroundColor: theme.surfaceMuted }, pressed && styles.pressed]}
    >
      <View style={styles.mainTagStatHeading}>
        <Text style={[styles.mainTagStatName, { color: theme.text }]}>{tag.name}</Text>
        <Text style={[styles.mainTagStatRks, { color: tag.averageRks == null ? theme.textMuted : theme.accent }]}>
          {tag.averageRks?.toFixed(4) ?? '—'}
        </Text>
      </View>
      <Text style={[styles.mainTagStatMeta, { color: tag.isSmallSample ? theme.warning : theme.textMuted }]}>
        {tag.sampleCount > 0 ? `入池 ${tag.sampleCount} · 候选 ${tag.eligibleChartCount} · 覆盖 ${(tag.sampleCoverage * 100).toFixed(0)}%${tag.supplementedSampleCount > 0 ? ` · 下取 ${tag.supplementedSampleCount}` : ''}${tag.isSmallSample ? ' · 样本较少' : ''}` : '暂无样本'}
      </Text>
      <Text style={[styles.mainTagStatMeta, { color: theme.textMuted }]}>候选均定 {tag.eligibleAverageDifficulty?.toFixed(4) ?? '—'}</Text>
      {tag.rawAverageRks != null ? (
        <Text style={[styles.mainTagStatFormula, { color: theme.textMuted }]}>原始 {tag.rawAverageRks.toFixed(4)} × {tag.coefficient.toFixed(4)}</Text>
      ) : null}
    </Pressable>
  );
}

function SecondaryTagRow({
  tag,
  onPress,
}: {
  tag: PhigrosTagRksStat;
  onPress: (tag: PhigrosTagRksStat) => void;
}) {
  const theme = useAppTheme();
  const delta = tag.deltaFromPoolAverage ?? 0;
  const deltaColor = delta >= 0 ? theme.accent : theme.warning;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`查看${tag.name}标签歌曲列表，修正后标签 RKS ${tag.averageRks!.toFixed(4)}，原始平均 ${tag.rawAverageRks!.toFixed(4)}，总系数 ${tag.coefficient.toFixed(4)}，数量系数 ${tag.countCoefficient.toFixed(4)}，按覆盖率生效的难度系数 ${tag.difficultyCoefficient.toFixed(4)}，${tag.sampleCount}张入池谱面${tag.supplementedSampleCount > 0 ? `，其中${tag.supplementedSampleCount}张为向下补入` : ''}，${tag.eligibleChartCount}张候选谱面，覆盖率 ${(tag.sampleCoverage * 100).toFixed(0)}%，候选平均定数 ${tag.eligibleAverageDifficulty?.toFixed(4) ?? '无数据'}${tag.isSmallSample ? '，样本较少' : ''}`}
      onPress={() => onPress(tag)}
      style={({ pressed }) => [styles.tagRow, { borderColor: theme.border, backgroundColor: theme.surface }, pressed && styles.pressed]}
    >
      <View style={styles.tagCopy}>
        <View style={styles.tagTitleRow}>
          <Text style={[styles.tagName, { color: theme.text }]}>{tag.name}</Text>
          {tag.isSmallSample ? (
            <Text style={[styles.smallSample, { color: theme.warning, borderColor: theme.warning }]}>样本较少</Text>
          ) : null}
        </View>
        <Text style={[styles.tagMeta, { color: theme.textMuted }]}>入池 {tag.sampleCount} · 候选 {tag.eligibleChartCount} · 覆盖 {(tag.sampleCoverage * 100).toFixed(0)}%{tag.supplementedSampleCount > 0 ? ` · 下取 ${tag.supplementedSampleCount}` : ''} · 均定 {tag.eligibleAverageDifficulty?.toFixed(4) ?? '—'}</Text>
        <Text style={[styles.tagFormula, { color: theme.textMuted }]}>原始 {tag.rawAverageRks!.toFixed(4)} × {tag.coefficient.toFixed(4)}</Text>
      </View>
      <View style={styles.tagNumbers}>
        <Text style={[styles.tagRks, { color: theme.text }]}>{tag.averageRks!.toFixed(4)}</Text>
        <Text style={[styles.tagDelta, { color: deltaColor }]}>
          {delta >= 0 ? '+' : ''}{delta.toFixed(4)}
        </Text>
      </View>
    </Pressable>
  );
}

function TagChartRow({
  chart,
  title,
  onPress,
}: {
  chart: PhigrosStrengthChartSample;
  title: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const levelLabel = phigrosLevelLabel(chart.levelIndex);
  return (
    <Pressable
      accessibilityLabel={`查看歌曲 ${title} 的${levelLabel}难度卡片`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.chartRow,
        { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.chartCopy}>
        <Text numberOfLines={2} style={[styles.chartTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.chartMeta, { color: chart.isSupplemental ? theme.warning : theme.textMuted }]}>Acc {chart.achievements.toFixed(2)}%{chart.isSupplemental ? ' · 向下补入' : ''}</Text>
      </View>
      <View style={styles.chartNumbers}>
        <PhigrosDifficultyBadge levelIndex={chart.levelIndex} constant={chart.difficultyConstant} />
        <Text style={[styles.chartRks, { color: theme.accent }]}>RKS {chart.rks.toFixed(4)}</Text>
      </View>
    </Pressable>
  );
}

function RecommendationRow({
  recommendation,
  onPress,
}: {
  recommendation: PhigrosStrengthRecommendation;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  const levelLabel = phigrosLevelLabel(recommendation.levelIndex);
  const currentAcc = recommendation.currentAcc == null
    ? '未游玩'
    : `当前 Acc ${recommendation.currentAcc.toFixed(2)}%`;
  return (
    <Pressable
      accessibilityLabel={`查看推荐谱面 ${recommendation.title} 的${levelLabel}难度卡片，目标 Acc ${recommendation.targetAcc.toFixed(2)}%`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.recommendationRow,
        { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.recommendationCopy}>
        <Text numberOfLines={2} style={[styles.recommendationTitle, { color: theme.text }]}>{recommendation.title}</Text>
        <Text style={[styles.recommendationMeta, { color: theme.textMuted }]}>{currentAcc}</Text>
        <Text style={[styles.recommendationTarget, { color: theme.accent }]}>目标 Acc ≥ {recommendation.targetAcc.toFixed(2)}%</Text>
        <Text style={[styles.recommendationGain, { color: theme.textSecondary }]}>达成后预计 {recommendation.tagName} RKS +{recommendation.projectedGain.toFixed(4)}</Text>
      </View>
      <PhigrosDifficultyBadge levelIndex={recommendation.levelIndex} constant={recommendation.difficultyConstant} />
    </Pressable>
  );
}

function TagSongsSheet({
  tag,
  titleMap,
  onClose,
  onOpenChart,
}: {
  tag: PhigrosTagRksStat | null;
  titleMap: ReadonlyMap<string, string>;
  onClose: () => void;
  onOpenChart: (chart: PhigrosStrengthChartSample) => void;
}) {
  const theme = useAppTheme();
  return (
    <AppModal
      animationType="slide"
      presentationStyle="pageSheet"
      visible={tag != null}
      onRequestClose={onClose}
    >
      <View testID="phigros-strength-tag-songs-sheet" style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={[styles.sheetGrabber, { backgroundColor: theme.border }]} />
        <View style={styles.sheetHeader}>
          <View style={styles.sheetHeaderSpacer} />
          <View style={styles.sheetTitleBlock}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>{tag?.name ?? ''}标签歌曲</Text>
            <Text style={[styles.sheetCount, { color: theme.textMuted }]}>
              {tag ? `${tag.sampleCount} 张入池 · ${tag.eligibleChartCount} 张候选${tag.supplementedSampleCount > 0 ? ` · 下取 ${tag.supplementedSampleCount} 张` : ''}` : ''}
            </Text>
            <Text style={[styles.sheetCount, { color: theme.textMuted }]}>{tag ? `覆盖 ${(tag.sampleCoverage * 100).toFixed(0)}% · 均定 ${tag.eligibleAverageDifficulty?.toFixed(4) ?? '—'} · ×${tag.coefficient.toFixed(4)}` : ''}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭标签歌曲列表"
            onPress={onClose}
            style={({ pressed }) => [styles.sheetClose, pressed && styles.pressed]}
          >
            <Text style={[styles.sheetCloseText, { color: theme.accent }]}>完成</Text>
          </Pressable>
        </View>
        <FlatList
          data={tag?.charts ?? []}
          keyExtractor={(chart) => `${chart.songId}-${chart.levelIndex}`}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TagChartRow
              chart={item}
              title={titleMap.get(item.songId) ?? item.title ?? item.songId}
              onPress={() => onOpenChart(item)}
            />
          )}
          ListEmptyComponent={(
            <View style={styles.sheetEmpty}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>暂无达标谱面</Text>
              <Text style={[styles.emptyDetail, { color: theme.textMuted }]}>当前分析池中没有归入此标签的成绩。</Text>
            </View>
          )}
        />
      </View>
    </AppModal>
  );
}

export default function PhigrosStrengthAnalysisScreen() {
  const theme = useAppTheme();
  const [selectedTag, setSelectedTag] = useState<PhigrosTagRksStat | null>(null);
  const [isPoolDescriptionExpanded, setIsPoolDescriptionExpanded] = useState(false);
  const gameQuery = useGameData();
  const catalogQuery = usePhigrosCatalog();
  const tagsQuery = usePhigrosKyouChartTags();
  const payload = gameQuery.data?.payload;
  const phigrosPayload = payload?.kind === 'phigros' ? payload : null;
  const openSongChart = (songId: string, levelIndex: number) => {
    router.push({
      pathname: '/songs/[songId]',
      params: { songId, levelIndex: String(levelIndex) },
    } as Href);
  };
  const openChartDetail = (chart: PhigrosStrengthChartSample) => {
    setSelectedTag(null);
    openSongChart(chart.songId, chart.levelIndex);
  };
  const tagIndex = useMemo(() => buildPhigrosKyouChartTagIndex(
    tagsQuery.data,
    catalogQuery.data?.snapshot,
  ), [catalogQuery.data?.snapshot, tagsQuery.data]);
  const analysis = useMemo(() => {
    if (!phigrosPayload || !tagsQuery.data || !catalogQuery.data?.snapshot) return null;
    return analyzePhigrosStrength(
      phigrosPayload.playerScore.value,
      phigrosPayload.records,
      tagIndex,
      tagsQuery.data.tags,
      catalogQuery.data.snapshot,
    );
  }, [catalogQuery.data?.snapshot, phigrosPayload, tagIndex, tagsQuery.data]);
  const titleMap = useMemo(() => new Map(
    (catalogQuery.data?.snapshot.songs ?? []).map((song) => [song.id, song.title]),
  ), [catalogQuery.data?.snapshot.songs]);

  const retry = () => {
    void Promise.all([
      gameQuery.refetch(),
      catalogQuery.refetch(),
      tagsQuery.refetch(),
    ]);
  };
  const isLoading = gameQuery.isLoading || catalogQuery.isLoading || tagsQuery.isLoading;
  const hasError = gameQuery.isError || catalogQuery.isError || tagsQuery.isError;

  if (isLoading && !analysis) {
    return (
      <View style={[styles.page, styles.centered, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '实力分析' }} />
        <ActivityIndicator color={theme.accent} />
        <Text style={[styles.loadingText, { color: theme.textMuted }]}>正在整理成绩与谱面标签…</Text>
      </View>
    );
  }

  if (!phigrosPayload) {
    return (
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '实力分析' }} />
        <EmptyDataView
          title="尚未绑定 TapTap"
          detail="请在游戏管理中绑定 Phigros 的 TapTap 云存档后再查看实力分析。"
        />
      </View>
    );
  }

  if ((hasError && !analysis) || !analysis) {
    return (
      <View style={[styles.page, styles.centered, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '实力分析' }} />
        <Text style={[styles.errorTitle, { color: theme.text }]}>暂时无法生成分析</Text>
        <Text style={[styles.errorDetail, { color: theme.textMuted }]}>成绩、曲库或 Kyou 谱面标签未能完整加载。</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="重试实力分析"
          onPress={retry}
          style={({ pressed }) => [styles.retryButton, { backgroundColor: theme.accent }, pressed && styles.pressed]}
        >
          <Text style={styles.retryText}>重试</Text>
        </Pressable>
      </View>
    );
  }

  if (!analysis.hasExpectedPrimaryAxes) {
    return (
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '实力分析' }} />
        <EmptyDataView title="标签结构暂不可用" detail="Kyou 主标签不是预期的五项，已停止生成雷达以避免错误结论。" />
      </View>
    );
  }

  const isStale = gameQuery.isDataStale
    || catalogQuery.data?.snapshot.source.isStale
    || tagsQuery.data?.source.isStale;
  const coverage = analysis.pool.totalCount > 0
    ? `${analysis.pool.taggedCount}/${analysis.pool.totalCount}`
    : '0/0';

  return (
    <>
    <ScrollView
      style={[styles.page, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen options={{ title: '实力分析' }} />
      {isStale ? (
        <View style={[styles.staleBanner, { backgroundColor: theme.surfaceMuted, borderColor: theme.warning }]}>
          <Text style={[styles.staleText, { color: theme.textSecondary }]}>当前使用缓存数据，联网同步后结果会自动更新。</Text>
        </View>
      ) : null}

      <Card style={styles.poolCard}>
        <View style={styles.poolHeading}>
          <View style={styles.poolTitleBlock}>
            <Text style={[styles.eyebrow, { color: theme.accent }]}>基础池 RKS ≥ {analysis.pool.threshold.toFixed(1)} · A 及以上</Text>
            <Text style={[styles.poolTitle, { color: theme.text }]}>本次分析池</Text>
          </View>
          <View style={styles.playerRksBlock}>
            <Text style={[styles.playerRksLabel, { color: theme.textMuted }]}>玩家 RKS</Text>
            <Text style={[styles.playerRks, { color: theme.accent }]}>{analysis.playerRks.toFixed(4)}</Text>
          </View>
        </View>
        <View style={styles.metricsGrid}>
          <Metric label="入池谱面" value={analysis.pool.supplementedCount > 0 ? `${analysis.pool.totalCount}（+${analysis.pool.supplementedCount}）` : String(analysis.pool.totalCount)} />
          <Metric label="池平均 RKS" value={analysis.pool.averageRks?.toFixed(4) ?? '—'} />
          <Metric label="标签覆盖" value={coverage} />
          <Metric label="池内最高" value={analysis.pool.maxRks?.toFixed(4) ?? '—'} />
        </View>
        <View style={styles.formulaRow}>
          <Text
            ellipsizeMode="tail"
            numberOfLines={isPoolDescriptionExpanded ? undefined : 1}
            style={[styles.formula, { color: theme.textMuted }]}
          >
            {POOL_DESCRIPTION}
          </Text>
          <Pressable
            accessibilityLabel={isPoolDescriptionExpanded ? '收起分析池说明' : '展开分析池说明'}
            accessibilityRole="button"
            accessibilityState={{ expanded: isPoolDescriptionExpanded }}
            hitSlop={8}
            onPress={() => setIsPoolDescriptionExpanded((expanded) => !expanded)}
            style={({ pressed }) => [styles.formulaToggle, pressed && styles.pressed]}
          >
            <Text style={[styles.formulaToggleText, { color: theme.accent }]}>{isPoolDescriptionExpanded ? '收起' : '展开'}</Text>
          </Pressable>
        </View>
      </Card>

      {analysis.pool.totalCount === 0 ? (
        <Card>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>暂无达标谱面</Text>
          <Text style={[styles.emptyDetail, { color: theme.textMuted }]}>当前没有同时满足 RKS 阈值与 A 以上评级的成绩。</Text>
        </Card>
      ) : (
        <>
          <Card style={styles.radarCard}>
            <View style={styles.radarHeading}>
              <Text numberOfLines={1} style={[styles.radarAnalysisTitle, { color: theme.text }]}>分析：{analysis.mainTagProfileLabel}</Text>
              <Text style={[styles.scaleText, { color: theme.textMuted }]}>范围 {analysis.radarDomain.min.toFixed(4)}–{analysis.radarDomain.max.toFixed(4)}</Text>
            </View>
            <PhigrosStrengthRadar
              tags={analysis.mainTags}
              min={analysis.radarDomain.min}
              max={analysis.radarDomain.max}
              onTagPress={setSelectedTag}
            />
            <View style={styles.mainTagGrid}>
              {analysis.mainTags.map((tag) => (
                <MainTagStat key={tag.tagId} tag={tag} onPress={setSelectedTag} />
              ))}
            </View>
            {analysis.areMainTagsTied ? (
              <MainTieSummary rks={analysis.mainTags[0]!.averageRks!} />
            ) : (
              <View style={styles.summaryRow}>
                <MainSummary label="相对最强" tag={analysis.strongestMainTag} tone="strong" onPress={setSelectedTag} />
                <MainSummary label="相对最弱" tag={analysis.weakestMainTag} tone="weak" onPress={setSelectedTag} />
              </View>
            )}
          </Card>

          <View style={styles.recommendationSection}>
            <View style={styles.sectionHeading}>
              <View style={styles.recommendationHeadingCopy}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>薄弱项练习</Text>
                <Text style={[styles.sectionHint, { color: theme.textMuted }]}>
                  {analysis.weakestMainTag
                    ? `针对 ${analysis.weakestMainTag.name} · 由低定数起，目标按单张独立估算`
                    : '五维持平时不强行指定薄弱项'}
                </Text>
              </View>
            </View>
            {analysis.recommendations.length > 0 ? analysis.recommendations.map((recommendation) => (
              <RecommendationRow
                key={`${recommendation.songId}-${recommendation.levelIndex}`}
                recommendation={recommendation}
                onPress={() => openSongChart(recommendation.songId, recommendation.levelIndex)}
              />
            )) : (
              <Card>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>暂无可提升推荐</Text>
                <Text style={[styles.emptyDetail, { color: theme.textMuted }]}>
                  {analysis.weakestMainTag
                    ? '当前薄弱项候选谱面即使达到满分，也无法继续提高该标签评分。'
                    : '当前五维没有明确的相对薄弱项。'}
                </Text>
              </Card>
            )}
          </View>

          <View style={styles.secondarySection}>
            <View style={styles.sectionHeading}>
              <View>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>细分标签</Text>
                <Text style={[styles.sectionHint, { color: theme.textMuted }]}>按修正后标签 RKS 从高到低 · 右侧为相对池平均</Text>
              </View>
            </View>
            {analysis.secondaryTags.length > 0 ? analysis.secondaryTags.map((tag) => (
              <SecondaryTagRow key={tag.tagId} tag={tag} onPress={setSelectedTag} />
            )) : (
              <Card>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>暂无细分标签样本</Text>
                <Text style={[styles.emptyDetail, { color: theme.textMuted }]}>入池谱面没有票数大于 3 的细分标签。</Text>
              </Card>
            )}
          </View>
        </>
      )}
    </ScrollView>
    <TagSongsSheet
      tag={selectedTag}
      titleMap={titleMap}
      onClose={() => setSelectedTag(null)}
      onOpenChart={openChartDetail}
    />
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  loadingText: { fontSize: 14 },
  errorTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  errorDetail: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retryButton: { minWidth: 104, minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  staleBanner: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  staleText: { fontSize: 12, lineHeight: 17 },
  poolCard: { gap: 14 },
  poolHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  poolTitleBlock: { flex: 1, gap: 3 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '800', letterSpacing: 0.35 },
  poolTitle: { fontSize: 20, lineHeight: 26, fontWeight: '800' },
  playerRksBlock: { alignItems: 'flex-end', gap: 1 },
  playerRksLabel: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
  playerRks: { fontSize: 24, lineHeight: 29, fontWeight: '800', fontVariant: ['tabular-nums'] },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { width: '48.5%', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, gap: 3 },
  metricLabel: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
  metricValue: { fontSize: 16, lineHeight: 21, fontWeight: '800', fontVariant: ['tabular-nums'] },
  formulaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  formula: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 18 },
  formulaToggle: { minWidth: 36, minHeight: 18, alignItems: 'flex-end', justifyContent: 'center' },
  formulaToggleText: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  radarCard: { paddingHorizontal: 8, paddingBottom: 14, gap: 4, overflow: 'hidden' },
  radarHeading: { alignItems: 'center', gap: 1 },
  radarAnalysisTitle: { alignSelf: 'stretch', fontSize: 17, lineHeight: 23, fontWeight: '800', textAlign: 'center' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { flexShrink: 1, fontSize: 17, lineHeight: 23, fontWeight: '800' },
  sectionHint: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  scaleText: { fontSize: 10, lineHeight: 14, fontVariant: ['tabular-nums'] },
  mainTagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 8 },
  mainTagStat: { width: '48.5%', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  mainTagStatHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mainTagStatName: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  mainTagStatRks: { fontSize: 13, lineHeight: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  mainTagStatMeta: { fontSize: 10, lineHeight: 14 },
  mainTagStatFormula: { fontSize: 9, lineHeight: 13, fontVariant: ['tabular-nums'] },
  summaryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 8 },
  summaryBox: { flex: 1, minHeight: 78, borderWidth: 1, borderRadius: 12, padding: 10, gap: 3 },
  summaryLabel: { fontSize: 10, lineHeight: 14, fontWeight: '800' },
  summaryName: { fontSize: 16, lineHeight: 21, fontWeight: '800' },
  summaryValue: { fontSize: 11, lineHeight: 16, fontVariant: ['tabular-nums'] },
  tieSummary: { marginHorizontal: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  tieSummaryLabel: { fontSize: 11, lineHeight: 15, fontWeight: '800' },
  tieSummaryValue: { fontSize: 18, lineHeight: 23, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tieSummaryDetail: { fontSize: 10, lineHeight: 15 },
  recommendationSection: { gap: 8 },
  recommendationHeadingCopy: { flex: 1, minWidth: 0 },
  recommendationRow: { minHeight: 86, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  recommendationCopy: { flex: 1, minWidth: 0, gap: 2 },
  recommendationTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  recommendationMeta: { fontSize: 10, lineHeight: 14, fontVariant: ['tabular-nums'] },
  recommendationTarget: { fontSize: 13, lineHeight: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  recommendationGain: { fontSize: 10, lineHeight: 14, fontVariant: ['tabular-nums'] },
  secondarySection: { gap: 8 },
  tagRow: { minHeight: 66, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tagCopy: { flex: 1, minWidth: 0, gap: 3 },
  tagTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  tagName: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  smallSample: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, fontSize: 9, lineHeight: 13, fontWeight: '800' },
  tagMeta: { fontSize: 11, lineHeight: 15 },
  tagFormula: { fontSize: 10, lineHeight: 14, fontVariant: ['tabular-nums'] },
  tagNumbers: { alignItems: 'flex-end', gap: 2 },
  tagRks: { fontSize: 16, lineHeight: 21, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tagDelta: { fontSize: 11, lineHeight: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  emptyTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  emptyDetail: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  sheet: { flex: 1 },
  sheetGrabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, marginBottom: 4 },
  sheetHeader: { minHeight: 62, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  sheetHeaderSpacer: { width: 56 },
  sheetTitleBlock: { flex: 1, alignItems: 'center', gap: 1 },
  sheetTitle: { fontSize: 17, lineHeight: 23, fontWeight: '800' },
  sheetCount: { fontSize: 10, lineHeight: 14 },
  sheetClose: { width: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  sheetContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28, gap: 8 },
  chartRow: { minHeight: 74, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  chartCopy: { flex: 1, minWidth: 0, gap: 4 },
  chartTitle: { fontSize: 14, lineHeight: 19, fontWeight: '700' },
  chartMeta: { fontSize: 11, lineHeight: 15, fontVariant: ['tabular-nums'] },
  chartNumbers: { alignItems: 'flex-end', gap: 5 },
  chartRks: { fontSize: 12, lineHeight: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sheetEmpty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
});
