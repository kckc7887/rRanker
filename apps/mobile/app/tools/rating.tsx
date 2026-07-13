import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Card } from '@/components/Card';
import { FormField } from '@/components/FormField';
import { calculateChartRating, minimumAchievementForRating, ratingTable } from '@/domain/rating';

export default function RatingToolScreen() {
  const [constant, setConstant] = useState('13.7'); const [achievement, setAchievement] = useState('100.5'); const [target, setTarget] = useState('300');
  const ds = parseNumericInput(constant); const ach = parseNumericInput(achievement); const targetValue = parseNumericInput(target);
  const constantError = !Number.isFinite(ds) || ds <= 0 || ds > 15 ? '定数必须大于 0 且不超过 15。' : null;
  const achievementError = !Number.isFinite(ach) || ach < 0 || ach > 101 ? '达成率必须在 0% 到理论最高 101% 之间。' : null;
  const result = !constantError && !achievementError ? calculateChartRating(ds, ach) : null;
  const reverse = !constantError && Number.isInteger(targetValue) && targetValue >= 0 ? minimumAchievementForRating(ds, targetValue) : null;
  const rows = useMemo(() => !constantError ? ratingTable(ds) : [], [constantError, ds]);
  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Stack.Screen options={{ title: 'DX Rating 计算器' }} />
    <Card><View style={styles.row}><FormField label="定数" value={constant} onChangeText={setConstant} /><FormField label="达成率 (%)" value={achievement} onChangeText={setAchievement} /></View>
      {constantError ? <Text style={styles.error}>{constantError}</Text> : null}
      {achievementError ? <Text style={styles.error}>{achievementError}</Text> : null}
      {!achievementError && ach > 100.5 ? <Text style={styles.warning}>达成率有效，但 Rating 在 100.5% 封顶；当前按 100.5% 计算。</Text> : null}
      <Text style={styles.result}>单曲 Rating：{result ?? '输入无效'}</Text><Text style={styles.note}>理论最高达成率为 101%；仅 Rating 计算在 100.5% 封顶，显示值最终向下取整。</Text></Card>
    <Card><FormField label="目标 Rating（整数）" value={target} onChangeText={setTarget} /><Text style={styles.result}>最低达成率：{reverse === null ? '无法达到或输入无效' : `${reverse.toFixed(4)}%`}</Text></Card>
    <Card><Text style={styles.heading}>当前定数的达成率档</Text>{rows.map((row) => <View key={row.achievement} style={styles.tableRow}><Text style={styles.cell}>{row.achievement.toFixed(4)}%</Text><Text style={styles.cell}>Rating {row.rating}</Text></View>)}</Card>
  </ScrollView>;
}
function parseNumericInput(value: string): number {
  const normalized = value.normalize('NFKC').trim().replace(',', '.');
  return normalized ? Number(normalized) : Number.NaN;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 16, gap: 12 }, row: { flexDirection: 'row', gap: 10 }, result: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 12 }, note: { color: '#6B7280', fontSize: 12, marginTop: 6 }, error: { color: '#B91C1C', marginTop: 8 }, warning: { color: '#B45309', marginTop: 8, lineHeight: 19 }, heading: { color: '#111827', fontWeight: '700', marginBottom: 8 }, tableRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB', paddingVertical: 6 }, cell: { color: '#374151' } });
