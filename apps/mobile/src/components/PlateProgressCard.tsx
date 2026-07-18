import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { DifficultyBadge, ScoreStatusBadges } from '@/components/ScoreVisuals';
import { difficultyFromIndex } from '@/domain/catalog';
import {
  parseVersionPlateName,
  plateRequirementSpec,
  type PlateProgress,
  type PlateTierLabel,
} from '@/domain/plates';
import type { Plate } from '@/domain/models';

type PlateProgressCardProps = {
  plate: Plate;
  progress: PlateProgress;
  eyebrow?: string;
  footer?: ReactNode;
  testID?: string;
};

function progressPercent(completed: number, total: number): number {
  return total ? Math.min(100, (completed / total) * 100) : 0;
}

function RequirementHint({ label }: { label: PlateTierLabel }) {
  const spec = plateRequirementSpec(label);
  return (
    <View style={styles.requirementHint}>
      <Text style={styles.requirementText}>达成</Text>
      <ScoreStatusBadges rate={spec.rate} fc={spec.fc} fs={spec.fs} />
      <Text style={styles.requirementText}>及以上{spec.suffix}</Text>
    </View>
  );
}

export function PlateProgressCard({ plate, progress, eyebrow, footer, testID }: PlateProgressCardProps) {
  const plateMeta = parseVersionPlateName(plate.name);
  const percent = progressPercent(progress.completed, progress.total);

  return (
    <Card style={styles.card} testID={testID}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <View style={styles.progressHeader}>
        <Text style={styles.progressTitle}>{plate.name}</Text>
        <Text style={styles.progressPct}>{percent.toFixed(1)}%</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${percent}%` }]} />
      </View>
      <View style={styles.progressMetaRow}>
        {plateMeta ? <RequirementHint label={plateMeta.label} /> : <View style={styles.requirementHint} />}
        <Text style={styles.progressCount}>
          {progress.completed} / {progress.total}
        </Text>
      </View>
      {Object.entries(progress.byDifficulty)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([difficulty, item]) => {
          const levelIndex = Number(difficulty);
          return (
            <View key={difficulty} style={styles.diffRow}>
              {levelIndex < 0 ? (
                <Text style={styles.anyDiff}>任意难度</Text>
              ) : (
                <DifficultyBadge difficulty={difficultyFromIndex(levelIndex)} compact />
              )}
              <Text style={styles.meta}>{item.completed}/{item.total}</Text>
            </View>
          );
        })}
      {footer}
    </Card>
  );
}

const styles = StyleSheet.create({
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
  requirementHint: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  requirementText: { color: '#6B7280', fontSize: 11, lineHeight: 16 },
  progressCount: { color: '#4B5563', fontSize: 12, fontWeight: '600', flexShrink: 0 },
  diffRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  anyDiff: { color: '#6B7280', fontSize: 12, fontWeight: '700' },
  meta: { color: '#6B7280', fontSize: 12, fontWeight: '600' },
});
