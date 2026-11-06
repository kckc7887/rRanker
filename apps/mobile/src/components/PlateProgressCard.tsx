import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CollectionProgress } from './CollectionProgress';
import { DifficultyBadge, ScoreStatusBadges } from '@/components/ScoreVisuals';
import { difficultyFromIndex } from '@/domain/catalog';
import {
  parseVersionPlateName,
  plateRequirementSpec,
  type PlateProgress,
  type PlateTierLabel,
} from '@/domain/plates';
import type { Plate } from '@/domain/models';
import { useAppTheme } from '@/theme/app-theme';

type PlateProgressCardProps = {
  plate: Plate;
  progress: PlateProgress;
  eyebrow?: string;
  footer?: ReactNode;
  testID?: string;
};

function RequirementHint({ label }: { label: PlateTierLabel }) {
  const theme = useAppTheme();
  const spec = plateRequirementSpec(label);
  return (
    <View style={styles.requirementHint}>
      <Text style={[styles.requirementText, { color: theme.textMuted }]}>达成</Text>
      <ScoreStatusBadges rate={spec.rate} fc={spec.fc} fs={spec.fs} />
      <Text style={[styles.requirementText, { color: theme.textMuted }]}>及以上{spec.suffix}</Text>
    </View>
  );
}

export function PlateProgressCard({ plate, progress, eyebrow, footer, testID }: PlateProgressCardProps) {
  const plateMeta = parseVersionPlateName(plate.name);
  return <CollectionProgress title={plate.name} progress={progress} eyebrow={eyebrow} testID={testID}
    requirement={plateMeta && <RequirementHint label={plateMeta.label} />}
    difficulty={level => <DifficultyBadge difficulty={difficultyFromIndex(level)} compact />}>
    {footer}
  </CollectionProgress>;
}

const styles = StyleSheet.create({
  requirementHint: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  requirementText: { color: '#6B7280', fontSize: 11, lineHeight: 16 },
});
