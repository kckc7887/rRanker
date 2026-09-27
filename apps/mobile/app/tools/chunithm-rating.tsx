import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Card } from '@/components/Card';
import { FormField } from '@/components/FormField';
import {
  CHUNITHM_CLEAR_TIER_LABELS,
  CHUNITHM_CLEAR_TIER_MIN_SCORE,
  calculateChunithmOverPower,
  chunithmChartRatingDisplay,
  chunithmRatingTable,
  formulaMinimumScoreForChunithmOverPower,
  formulaMinimumScoreForChunithmRating,
  type ChunithmChartInputViolation,
  type ChunithmClearTier,
  type ChunithmMinimumScore,
  maxChunithmOverPower,
  minimumScoreForChunithmOverPower,
  minimumScoreForChunithmRating,
  parseChunithmChartInput,
} from '@/domain/chunithm-rating';
import { useAppTheme } from '@/theme/app-theme';
import { parseNumericInput } from '@/utils/numeric-input';

const CLEAR_TIER_DESCRIPTIONS: readonly { id: ChunithmClearTier; description: string }[] = [
  { id: 'ajc', description: 'ALL JUSTICE CRITICAL' },
  { id: 'aj', description: 'ALL JUSTICE' },
  { id: 'fc', description: 'FULL COMBO' },
  { id: 'none', description: '无连击奖励' },
];

/** 灯的最低分数来自领域政策，文案里的数字不在这里重复维护。 */
const CLEAR_TIERS: readonly { id: ChunithmClearTier; label: string; hint: string }[] =
  CLEAR_TIER_DESCRIPTIONS.map((tier) => {
    const minScore = CHUNITHM_CLEAR_TIER_MIN_SCORE[tier.id];
    return {
      id: tier.id,
      label: CHUNITHM_CLEAR_TIER_LABELS[tier.id],
      hint: minScore > 0
        ? `${tier.description} · 至少 ${minScore.toLocaleString('en-US')} 分`
        : tier.description,
    };
  });

type ReverseMinimumRow = {
  id: 'rating' | 'over-power';
  title: string;
  note: string | null;
};

/**
 * 反推结果行。
 *
 * - 定数或目标不合法时给「输入无效」，不进入公式。
 * - 可达时给出该灯态合法输入集内的最低分；领域侧已用与正算相同的输入校验复核过。
 * - 公式解更低（说明它在当前灯态不可能出现）时补一行说明，避免把公式值当成能打出的分数。
 * - 不可达时给明确状态，绝不用公式值冒充最低分。
 */
function reverseMinimumRow(options: {
  id: ReverseMinimumRow['id'];
  name: 'Rating' | 'OP';
  targetText: string;
  targetValue: number;
  levelValid: boolean;
  clearLabel: string;
  result: ChunithmMinimumScore;
  formulaMinimum: number | null;
}): ReverseMinimumRow {
  const targetValid = Number.isFinite(options.targetValue) && options.targetValue >= 0;
  const heading = `${options.name} ${targetValid ? options.targetText : '—'}`;
  if (!options.levelValid || !targetValid) {
    return { id: options.id, title: `${heading}：输入无效`, note: null };
  }
  const { result, formulaMinimum } = options;
  if (result.status !== 'reachable' || result.score == null) {
    return { id: options.id, title: `${heading}：不可达`, note: null };
  }
  const note = formulaMinimum != null && formulaMinimum < result.score
    ? `公式最低分 ${formulaMinimum.toLocaleString('en-US')} 分低于 ${options.clearLabel} 的合法最低分 ${result.lampMinScore.toLocaleString('en-US')} 分，不能作为该灯态的输入。`
    : null;
  return { id: options.id, title: `${heading}：${result.score.toLocaleString('en-US')} 分`, note };
}

/** 反推卡片的两行数据：输入解析后的定数与灯态在这里进入领域反推入口。 */
function reverseMinimumRows(input: {
  levelValue: number;
  levelValid: boolean;
  clear: ChunithmClearTier;
  ratingText: string;
  ratingValue: number;
  overPowerText: string;
  overPowerValue: number;
}): ReverseMinimumRow[] {
  const clearLabel = CHUNITHM_CLEAR_TIER_LABELS[input.clear];
  return [
    reverseMinimumRow({
      id: 'rating',
      name: 'Rating',
      targetText: input.ratingText,
      targetValue: input.ratingValue,
      levelValid: input.levelValid,
      clearLabel,
      result: minimumScoreForChunithmRating(input.levelValue, input.ratingValue, input.clear),
      formulaMinimum: formulaMinimumScoreForChunithmRating(input.levelValue, input.ratingValue),
    }),
    reverseMinimumRow({
      id: 'over-power',
      name: 'OP',
      targetText: input.overPowerText,
      targetValue: input.overPowerValue,
      levelValid: input.levelValid,
      clearLabel,
      result: minimumScoreForChunithmOverPower(input.levelValue, input.overPowerValue, input.clear),
      formulaMinimum: formulaMinimumScoreForChunithmOverPower(
        input.levelValue,
        input.overPowerValue,
        input.clear,
      ),
    }),
  ];
}

export default function ChunithmRatingToolScreen() {
  const theme = useAppTheme();
  const { constant: routeConstant, score: routeScore } = useLocalSearchParams<{
    constant?: string;
    score?: string;
  }>();
  const [constant, setConstant] = useState(
    () => routeConstant && Number.isFinite(parseNumericInput(routeConstant)) ? routeConstant : '14.0',
  );
  // 默认分数取 1,010,000 只是为了让首屏与默认灯 AJC 构成合法组合，没有业务含义。
  const [score, setScore] = useState(
    () => routeScore && Number.isFinite(parseNumericInput(routeScore)) ? routeScore : '1010000',
  );
  const [targetRating, setTargetRating] = useState('15.00');
  const [targetOverPower, setTargetOverPower] = useState('85');
  const [clear, setClear] = useState<ChunithmClearTier>('ajc');

  const ds = parseNumericInput(constant);
  const scoreValue = parseNumericInput(score);
  const targetRatingValue = parseNumericInput(targetRating);
  const targetOverPowerValue = parseNumericInput(targetOverPower);

  const parsedInput = parseChunithmChartInput({ levelValue: ds, score: scoreValue, clear });
  const violationMessage = (code: ChunithmChartInputViolation['code']) => (
    parsedInput.violations.find((item) => item.code === code)?.message ?? null
  );
  const constantError = violationMessage('level_out_of_range');
  const scoreError = violationMessage('score_out_of_range');
  const lampError = violationMessage('lamp_score_conflict');
  // Rating 只依赖定数与分数；OP 还要求所选灯与分数是合法组合。
  const rating = constantError || scoreError
    ? null
    : chunithmChartRatingDisplay(parsedInput.levelValue, parsedInput.score);
  const overPower = rating == null || lampError != null
    ? null
    : calculateChunithmOverPower(parsedInput.levelValue, parsedInput.score, clear);

  const reverseRows = reverseMinimumRows({
    levelValue: parsedInput.levelValue,
    levelValid: constantError == null,
    clear,
    ratingText: targetRating,
    ratingValue: targetRatingValue,
    overPowerText: targetOverPower,
    overPowerValue: targetOverPowerValue,
  });

  const rows = useMemo(
    () => (!constantError ? chunithmRatingTable(parsedInput.levelValue, clear) : []),
    [constantError, parsedInput.levelValue, clear],
  );

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: 'Rating / OVER POWER 计算器' }} />

      <Card>
        <Text style={[styles.heading, { color: theme.text }]}>单谱面评分</Text>
        <View style={styles.row}>
          <FormField label="定数" value={constant} onChangeText={setConstant} placeholder="例如 14.0" />
          <FormField label="分数" value={score} onChangeText={setScore} placeholder="例如 1009000" />
        </View>
        <View style={styles.clearRow}>
          <Text style={[styles.clearLabel, { color: theme.textSecondary }]}>CLEAR 加成</Text>
          {CLEAR_TIERS.map((tier) => (
            <Pressable
              key={tier.id}
              accessibilityRole="button"
              accessibilityLabel={`${tier.label}（${tier.hint}）`}
              accessibilityState={{ selected: clear === tier.id }}
              onPress={() => setClear(tier.id)}
              style={[styles.clearChip, {
                borderColor: theme.border,
                backgroundColor: theme.surface,
              }, clear === tier.id && {
                borderColor: theme.accent,
                backgroundColor: theme.accentSoft,
              }]}
            >
              <Text style={[styles.clearChipText, {
                color: theme.textSecondary,
              }, clear === tier.id && { color: theme.accent }]}>{tier.label}</Text>
            </Pressable>
          ))}
        </View>
        {constantError ? <Text style={[styles.error, { color: theme.danger }]}>{constantError}</Text> : null}
        {scoreError ? <Text style={[styles.error, { color: theme.danger }]}>{scoreError}</Text> : null}
        {lampError ? <Text style={[styles.error, { color: theme.danger }]}>{lampError}</Text> : null}
        <Text style={[styles.result, { color: theme.text }]}>
          Rating：{rating?.toFixed(2) ?? '输入无效'}
        </Text>
        <Text style={[styles.result, { color: theme.text }]}>
          OVER POWER：{overPower?.toFixed(2) ?? '输入无效'}
        </Text>
        <Text style={[styles.note, { color: theme.textMuted }]}>
          理论最高 OVER POWER（AJC）：{!constantError ? maxChunithmOverPower(parsedInput.levelValue).toFixed(2) : '—'}
        </Text>
      </Card>

      <Card>
        <Text style={[styles.heading, { color: theme.text }]}>反推最低分数</Text>
        <View style={styles.row}>
          <FormField label="目标 Rating" value={targetRating} onChangeText={setTargetRating} placeholder="例如 15.00" />
          <FormField label="目标 OVER POWER" value={targetOverPower} onChangeText={setTargetOverPower} placeholder="例如 85" />
        </View>
        <Text style={[styles.note, { color: theme.textMuted }]}>
          反推在所选灯态的合法分数范围内求解，结果一定能通过上方的输入校验。
        </Text>
        {reverseRows.map((row) => (
          <View key={row.id}>
            <Text style={[styles.result, { color: theme.text }]}>{row.title}</Text>
            {row.note ? <Text style={[styles.note, { color: theme.textMuted }]}>{row.note}</Text> : null}
          </View>
        ))}
      </Card>

      <Card>
        <Text style={[styles.heading, { color: theme.text }]}>分数档位</Text>
        <Text style={[styles.note, { color: theme.textMuted, marginTop: 0, marginBottom: 6 }]}>
          OP 按所选灯的奖励给出各档位的公式值；低于该灯最低分数的档位只是公式参考，实战中不会出现。
        </Text>
        {rows.map((row) => (
          <View key={row.score} style={[styles.tableRow, { borderTopColor: theme.border }]}>
            <Text style={[styles.cell, { color: theme.textSecondary }]}>{row.score.toLocaleString('en-US')}</Text>
            <Text style={[styles.cell, { color: theme.textSecondary }]}>Rating {row.rating.toFixed(2)}</Text>
            <Text style={[styles.cell, { color: theme.textSecondary }]}>OP {row.overPower.toFixed(2)}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 10 },
  heading: { color: '#111827', fontWeight: '700', marginBottom: 8 },
  clearRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  clearLabel: { color: '#4B5563', fontSize: 12 },
  clearChip: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  clearChipText: { color: '#374151', fontSize: 13, fontWeight: '700' },
  result: { fontSize: 17, fontWeight: '700', color: '#111827', marginTop: 10 },
  note: { color: '#6B7280', fontSize: 12, marginTop: 6 },
  error: { color: '#B91C1C', marginTop: 8 },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingVertical: 6,
  },
  cell: { color: '#374151', fontSize: 13 },
});
