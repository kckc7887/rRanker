import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Card } from '@/components/Card';
import { FormField } from '@/components/FormField';
import { calculateAchievement, maximumSameErrors, singleNoteLoss, type NoteCounts } from '@/domain/tolerance';

const KINDS = ['tap', 'hold', 'slide', 'touch', 'break'] as const;
export default function ToleranceToolScreen() {
  const [values, setValues] = useState<Record<string, string>>({ tap: '500', hold: '100', slide: '100', touch: '0', break: '20', tapGreat: '0', holdGreat: '0', slideGreat: '0', touchGreat: '0', breakGreat: '0' });
  const [target, setTarget] = useState('100');
  const notes = useMemo(() => Object.fromEntries(KINDS.map((kind) => [kind, Number(values[kind])])) as unknown as NoteCounts,
    [values]);
  const computed = useMemo(() => {
    try {
      const achievement = calculateAchievement(notes, {
        tap: { great: Number(values.tapGreat) }, hold: { great: Number(values.holdGreat) },
        slide: { great: Number(values.slideGreat) }, touch: { great: Number(values.touchGreat) },
        break: { great1: Number(values.breakGreat) },
      });
      return { achievement, error: null };
    } catch (error) { return { achievement: null, error: error instanceof Error ? error.message : '输入无效' }; }
  }, [notes, values]);
  const set = (key: string) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Stack.Screen options={{ title: '达成率与容错' }} />
    <Card><Text style={styles.heading}>谱面物量</Text><View style={styles.wrap}>{KINDS.map((kind) => <View key={kind} style={styles.small}><FormField label={kind.toUpperCase()} value={values[kind]} onChangeText={set(kind)} /></View>)}</View></Card>
    <Card><Text style={styles.heading}>已知判定（各类 GREAT；BREAK 按 GREAT-1）</Text><View style={styles.wrap}>{KINDS.map((kind) => <View key={kind} style={styles.small}><FormField label={`${kind.toUpperCase()} GREAT`} value={values[`${kind}Great`]} onChangeText={set(`${kind}Great`)} /></View>)}</View>
      <Text style={computed.error ? styles.error : styles.result}>{computed.error ?? `预计达成率 ${computed.achievement?.toFixed(4)}%`}</Text></Card>
    <Card><FormField label="目标达成率" value={target} onChangeText={setTarget} /><Text style={styles.note}>101%-：距理论值的损失；100%-：距 100% 的余量；0%+：预计达成率本身。下表采用同类 GREAT 估算。</Text>
      {KINDS.map((kind) => { try { const judgment = kind === 'break' ? 'great1' : 'great'; const loss = singleNoteLoss(notes, kind, judgment); const max = maximumSameErrors(notes, Number(target), kind, judgment); return <Text key={kind} style={styles.line}>{kind.toUpperCase()}：单次 -{loss.toFixed(6)}%，最多 {max} 个</Text>; } catch (error) { return <Text key={kind} style={styles.error}>{kind.toUpperCase()}：{error instanceof Error ? error.message : '无法计算'}</Text>; } })}
    </Card><Text style={styles.disclaimer}>结果用于估算；BREAK 细分判定会分别计算基础分与奖励分。</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#F7F8FA' }, content: { padding: 16, gap: 12 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, small: { minWidth: 95, flexGrow: 1, flexBasis: '30%' }, heading: { fontWeight: '700', color: '#111827', marginBottom: 10 }, result: { fontSize: 18, fontWeight: '700', color: '#166534', marginTop: 12 }, error: { color: '#B91C1C', marginTop: 7 }, note: { color: '#6B7280', fontSize: 12, marginVertical: 9, lineHeight: 18 }, line: { color: '#374151', paddingVertical: 4 }, disclaimer: { color: '#6B7280', fontSize: 11, textAlign: 'center' } });
