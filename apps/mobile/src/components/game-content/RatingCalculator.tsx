import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Card } from '@/components/Card';
import { useAppTheme } from '@/theme/app-theme';

export function RatingCalculator({ title, children }: { title: string; children: ReactNode }) {
  const theme = useAppTheme();
  return <ScrollView style={[styles.page, { backgroundColor: theme.background }]}
    contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Stack.Screen options={{ title }} />
    {children}
  </ScrollView>;
}

export function RatingFields({ children }: { children: ReactNode }) {
  return <View style={styles.fields}>{children}</View>;
}

export function RatingMessage({ kind, children }: {
  kind: 'result' | 'note' | 'error' | 'warning'; children: ReactNode;
}) {
  const theme = useAppTheme();
  const color = { result: theme.text, note: theme.textMuted, error: theme.danger, warning: theme.warning }[kind];
  return <Text style={[styles[kind], { color }]}>{children}</Text>;
}

export function RatingTable<T>({ title, note, rows, rowKey, cells }: {
  title: string; note?: string; rows: readonly T[]; rowKey: (row: T) => number; cells: (row: T) => string[];
}) {
  const theme = useAppTheme();
  return <Card>
    <Text style={[styles.heading, { color: theme.text }]}>{title}</Text>
    {note && <Text style={[styles.tableNote, { color: theme.textMuted }]}>{note}</Text>}
    {rows.map(row => <View key={rowKey(row)} style={[styles.tableRow, { borderTopColor: theme.border }]}>
      {cells(row).map((value, index) => <Text key={index} style={[styles.cell, { color: theme.textSecondary }]}>{value}</Text>)}
    </View>)}
  </Card>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12 },
  heading: { fontWeight: '700', marginBottom: 8 },
  tableNote: { fontSize: 12, marginBottom: 6 },
  fields: { flexDirection: 'row', gap: 10 },
  result: { fontSize: 17, fontWeight: '700', marginTop: 10 },
  note: { fontSize: 12, marginTop: 6 },
  error: { marginTop: 8 },
  warning: { marginTop: 8, lineHeight: 19 },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  cell: { fontSize: 13 },
});
