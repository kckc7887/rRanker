import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@rranker/sdk/components/Card';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';

type Count = { completed: number; total: number };
const percent = ({ completed, total }: Count) => total ? Math.min(100, completed / total * 100) : 0;

export function CollectionProgressBar({ progress }: { progress: Count }) {
  const theme = useAppTheme();
  return <View style={[styles.barTrack, { backgroundColor: theme.border }]}>
    <View style={[styles.barFill, { width: `${percent(progress)}%`, backgroundColor: theme.accent }]} />
  </View>;
}

export function CollectionProgress({ title, preview, eyebrow, progress, requirement, difficulty, children, testID }: {
  title: string; preview?: ReactNode; eyebrow?: string; testID?: string;
  progress: Count & { byDifficulty: Record<number, Count> }; requirement?: ReactNode;
  difficulty: (level: number) => ReactNode; children?: ReactNode;
}) {
  const theme = useAppTheme();
  return <Card style={styles.card} testID={testID}>
    {eyebrow && <Text style={[styles.eyebrow, { color: theme.accent }]}>{eyebrow}</Text>}
    <View style={styles.progressHeader}>
      {preview}
      <Text style={[styles.progressTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.progressPct, { color: theme.accent }]}>{percent(progress).toFixed(1)}%</Text>
    </View>
    <CollectionProgressBar progress={progress} />
    <View style={styles.progressMetaRow}>
      <View style={styles.hint}>{requirement}</View>
      <Text style={[styles.progressCount, { color: theme.textSecondary }]}>{progress.completed} / {progress.total}</Text>
    </View>
    {Object.entries(progress.byDifficulty).sort(([a], [b]) => Number(a) - Number(b)).map(([key, item]) => (
      <View key={key} style={styles.diffRow}>
        {Number(key) < 0 ? <Text style={[styles.anyDiff, { color: theme.textMuted }]}>任意难度</Text> : difficulty(Number(key))}
        <Text style={[styles.meta, { color: theme.textMuted }]}>{item.completed}/{item.total}</Text>
      </View>
    ))}
    {children}
  </Card>;
}

export function CollectionPinButton({ name, pinned, pending, onPress }: {
  name: string; pinned: boolean; pending: boolean; onPress: () => void;
}) {
  const theme = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${pinned ? '从主页移除' : '添加到主页'} ${name}`}
    disabled={pending} onPress={onPress} style={({ pressed }) => [styles.pin,
      { borderColor: pinned ? theme.accent : theme.border, backgroundColor: pinned ? theme.accentSoft : undefined },
      (pending || pressed) && styles.dimmed]}>
    <Text style={[styles.pinLabel, { color: pinned ? theme.accent : theme.textSecondary }]}>
      {pinned ? '已添加到主页' : '添加到主页'}
    </Text>
  </Pressable>;
}

export function CollectionPickerCard({ label, name, preview, expanded, onToggle, children }: {
  label: string; name?: string; preview?: ReactNode; expanded: boolean; onToggle: () => void; children: ReactNode;
}) {
  const theme = useAppTheme();
  return <Card style={styles.picker}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
      accessibilityLabel={name ? `当前${label} ${name}` : `选择${label}`}
      onPress={onToggle} style={({ pressed }) => [styles.trigger, pressed && styles.dimmed]}>
      <View style={styles.copy}>
        <Text style={[styles.caption, { color: theme.textMuted }]}>当前{label}</Text>
        <Text style={[styles.name, { color: theme.text }]}>{name ?? '请选择'}</Text>
      </View>
      {preview}
      <Text style={{ color: theme.textMuted }}>{expanded ? '▲' : '▼'}</Text>
    </Pressable>
    {expanded && <View style={[styles.body, { borderTopColor: theme.border, backgroundColor: theme.surfaceMuted }]}>{children}</View>}
  </Card>;
}

const styles = StyleSheet.create({
  hint: { flex: 1 },
  pin: { marginTop: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  pinLabel: { fontSize: 14, fontWeight: '700' },
  dimmed: { opacity: 0.6 },
  picker: { padding: 0, overflow: 'hidden' },
  trigger: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  caption: { fontSize: 12, fontWeight: '600' },
  name: { fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },
  body: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 10 },
  card: { gap: 8 },
  eyebrow: { color: '#246BFD', fontSize: 12, fontWeight: '700' },
  progressHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  progressTitle: { color: '#111827', fontSize: 18, fontWeight: '800', flex: 1 },
  progressPct: { color: '#246BFD', fontSize: 22, fontWeight: '800' },
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#246BFD',
  },
  progressMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  progressCount: { color: '#4B5563', fontSize: 12, fontWeight: '600', flexShrink: 0 },
  diffRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  anyDiff: { color: '#6B7280', fontSize: 12, fontWeight: '700' },
  meta: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
});
