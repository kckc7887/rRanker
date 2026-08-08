import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Card } from '@/components/Card';
import { FormField } from '@/components/FormField';
import {
  calculateChunithmChartRating,
  calculateChunithmOverPower,
  chunithmRatingTable,
  type ChunithmClearTier,
  maxChunithmOverPower,
  minimumScoreForChunithmOverPower,
  minimumScoreForChunithmRating,
} from '@/domain/chunithm-rating';
import { useAppTheme } from '@/theme/app-theme';

const CLEAR_TIERS: readonly { id: ChunithmClearTier; label: string; hint: string }[] = [
  { id: 'ajc', label: 'AJC', hint: 'ALL JUSTICE CRITICAL（1,010,000 分）' },
  { id: 'aj', label: 'AJ', hint: 'ALL JUSTICE' },
  { id: 'fc', label: 'FC', hint: 'FULL COMBO' },
  { id: 'none', label: '无', hint: '无连击奖励' },
];

function parseNumericInput(value: string): number {
  const normalized = value.normalize('NFKC').trim().replace(',', '.');
  return normalized ? Number(normalized) : Number.NaN;
}

export default function ChunithmRatingToolScreen() {
  const theme = useAppTheme();
  const [constant, setConstant] = useState('14.0');
  const [score, setScore] = useState('1009000');
  const [targetRating, setTargetRating] = useState('15.00');
  const [targetOverPower, setTargetOverPower] = useState('85');
  const [clear, setClear] = useState<ChunithmClearTier>('ajc');

  const ds = parseNumericInput(constant);
  const scoreValue = parseNumericInput(score);
  const targetRatingValue = parseNumericInput(targetRating);
  const targetOverPowerValue = parseNumericInput(targetOverPower);

  const constantError = !Number.isFinite(ds) || ds <= 0 || ds > 16 ? '定数必须大于 0 且不超过 16。' : null;
  const scoreError = !Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 1_010_000
    ? '分数必须在 0 到 1010000 之间。'
    : null;

  const result = !constantError && !scoreError
    ? {
        rating: calculateChunithmChartRating(ds, scoreValue),
        overPower: calculateChunithmOverPower(ds, scoreValue, clear),
      }
    : null;

  const reverseRating = !constantError && Number.isFinite(targetRatingValue)
    ? minimumScoreForChunithmRating(ds, targetRatingValue)
    : null;
  const reverseOverPower = !constantError && Number.isFinite(targetOverPowerValue)
    ? minimumScoreForChunithmOverPower(ds, targetOverPowerValue, clear)
    : null;

  const rows = useMemo(
    () => (!constantError ? chunithmRatingTable(ds, clear) : []),
    [constantError, ds, clear],
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
        <Text style={[styles.result, { color: theme.text }]}>
          Rating：{result?.rating.toFixed(2) ?? '输入无效'}
        </Text>
        <Text style={[styles.result, { color: theme.text }]}>
          OVER POWER：{result?.overPower.toFixed(2) ?? '输入无效'}
        </Text>
        <Text style={[styles.note, { color: theme.textMuted }]}>
          理论最高 OVER POWER（AJC）：{!constantError ? maxChunithmOverPower(ds).toFixed(2) : '—'}
        </Text>
      </Card>

      <Card>
        <Text style={[styles.heading, { color: theme.text }]}>反推最低分数</Text>
        <View style={styles.row}>
          <FormField label="目标 Rating" value={targetRating} onChangeText={setTargetRating} placeholder="例如 15.00" />
          <FormField label="目标 OVER POWER" value={targetOverPower} onChangeText={setTargetOverPower} placeholder="例如 85" />
        </View>
        <Text style={[styles.result, { color: theme.text }]}>
          Rating {targetRatingValue >= 0 ? targetRating : '—'}：{reverseRating === null ? '不可达或输入无效' : `${reverseRating.toLocaleString('en-US')} 分`}
        </Text>
        <Text style={[styles.result, { color: theme.text }]}>
          OP {targetOverPowerValue >= 0 ? targetOverPower : '—'}：{reverseOverPower === null ? '不可达或输入无效' : `${reverseOverPower.toLocaleString('en-US')} 分`}
        </Text>
      </Card>

      <Card>
        <Text style={[styles.heading, { color: theme.text }]}>分数档位</Text>
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
