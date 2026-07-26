import { StyleSheet, Text } from 'react-native';
import {
  formatArcadeBusinessStatus,
  resolveArcadeBusinessStatus,
  type ArcadeBusinessStatus,
  type ArcadeOpeningDay,
} from '@/domain/arcade-shops';
import { useAppTheme } from '@/theme/app-theme';

export function ArcadeBusinessStatusLabel({
  openingHours,
  now,
  status: statusOverride,
}: {
  openingHours: readonly ArcadeOpeningDay[];
  now?: Date;
  status?: ArcadeBusinessStatus;
}) {
  const theme = useAppTheme();
  const status = statusOverride ?? resolveArcadeBusinessStatus(openingHours, now);
  const color = status === 'open'
    ? theme.success
    : status === 'closing_soon'
      ? theme.warning
      : status === 'closed'
        ? theme.danger
        : theme.textMuted;

  return (
    <Text
      accessibilityRole="text"
      accessibilityLabel={`营业状态 ${formatArcadeBusinessStatus(status)}`}
      style={[styles.label, { color }]}
    >
      {formatArcadeBusinessStatus(status)}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '800' },
});
