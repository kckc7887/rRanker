import { RatingCalculator, RatingFields, RatingMessage, RatingTable } from '@/components/game-content/RatingCalculator';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
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

function reverseMinimumRow(options: {
  result: ChunithmMinimumScore;
  id: ReverseMinimumRow['id'];
  name: 'Rating' | 'OP';
  targetText: string;
  targetValue: number;
  levelValid: boolean;
  clearLabel: string;
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
  /** 默认满分与 AJC 灯态相容。 */
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
    <RatingCalculator title="Rating / OVER POWER 计算器">

      <Card>
        <Text style={[styles.heading, { color: theme.text }]}>单谱面评分</Text>
        <RatingFields>
          <FormField label="定数" value={constant} onChangeText={setConstant} placeholder="例如 14.0" />
          <FormField label="分数" value={score} onChangeText={setScore} placeholder="例如 1009000" />
        </RatingFields>
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
        {constantError ? <RatingMessage kind="error">{constantError}</RatingMessage> : null}
        {scoreError ? <RatingMessage kind="error">{scoreError}</RatingMessage> : null}
        {lampError ? <RatingMessage kind="error">{lampError}</RatingMessage> : null}
        <RatingMessage kind="result">
          Rating：{rating?.toFixed(2) ?? '输入无效'}
        </RatingMessage>
        <RatingMessage kind="result">
          OVER POWER：{overPower?.toFixed(2) ?? '输入无效'}
        </RatingMessage>
        <RatingMessage kind="note">
          理论最高 OVER POWER（AJC）：{!constantError ? maxChunithmOverPower(parsedInput.levelValue).toFixed(2) : '—'}
        </RatingMessage>
      </Card>

      <Card>
        <Text style={[styles.heading, { color: theme.text }]}>反推最低分数</Text>
        <RatingFields>
          <FormField label="目标 Rating" value={targetRating} onChangeText={setTargetRating} placeholder="例如 15.00" />
          <FormField label="目标 OVER POWER" value={targetOverPower} onChangeText={setTargetOverPower} placeholder="例如 85" />
        </RatingFields>
        <RatingMessage kind="note">
          反推在所选灯态的合法分数范围内求解，结果一定能通过上方的输入校验。
        </RatingMessage>
        {reverseRows.map((row) => (
          <View key={row.id}>
            <RatingMessage kind="result">{row.title}</RatingMessage>
            {row.note ? <RatingMessage kind="note">{row.note}</RatingMessage> : null}
          </View>
        ))}
      </Card>

      <RatingTable title="分数档位" rows={rows} rowKey={row => row.score}
        note="OP 按所选灯的奖励给出各档位的公式值；低于该灯最低分数的档位只是公式参考，实战中不会出现。"
        cells={row => [row.score.toLocaleString('en-US'), `Rating ${row.rating.toFixed(2)}`, `OP ${row.overPower.toFixed(2)}`]} />
    </RatingCalculator>
  );
}

const styles = StyleSheet.create({
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
});
