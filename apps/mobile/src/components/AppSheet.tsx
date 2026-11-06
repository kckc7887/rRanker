import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ModalProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppModal } from '@/components/AppModal';
import { useAppTheme } from '@/theme/app-theme';

type SheetAction = {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
};

function HeaderAction({ action }: { action?: SheetAction }) {
  const theme = useAppTheme();
  if (!action) return <View style={styles.action} />;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={action.accessibilityLabel ?? action.label}
      accessibilityState={{ disabled: !!action.disabled }} disabled={action.disabled} onPress={action.onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <Text style={[styles.actionText, { color: action.disabled ? theme.textMuted : theme.accent }]}>{action.label}</Text>
    </Pressable>
  );
}

export function AppSheet({ title, subtitle, leftAction, rightAction, children, testID, ...modal }: ModalProps & {
  title: ReactNode;
  subtitle?: ReactNode;
  leftAction?: SheetAction;
  rightAction?: SheetAction;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <AppModal animationType="slide" presentationStyle="pageSheet" {...modal}>
      <View testID={testID} style={[styles.page, { backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <HeaderAction action={leftAction} />
          <View style={styles.copy}>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            {subtitle != null && <Text numberOfLines={2} style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text>}
          </View>
          <HeaderAction action={rightAction} />
        </View>
        {children}
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 10, marginBottom: 4 },
  header: { minHeight: 48, paddingHorizontal: 12, paddingBottom: 4, flexDirection: 'row', alignItems: 'center' },
  action: { minWidth: 60, minHeight: 42, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 16, fontWeight: '600' },
  copy: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  title: { textAlign: 'center', fontSize: 17, fontWeight: '700' },
  subtitle: { textAlign: 'center', fontSize: 13, marginTop: 2 },
  pressed: { opacity: 0.65 },
});
