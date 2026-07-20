import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

export type FilterSelectOption<T extends string = string> = {
  value: T;
  label: string;
};

export function FilterSelectSheet<T extends string>({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
  optionAccessibilityPrefix,
}: {
  visible: boolean;
  title: string;
  options: readonly FilterSelectOption<T>[];
  selectedValue: T;
  onSelect: (value: T) => void;
  onClose: () => void;
  optionAccessibilityPrefix: string;
}) {
  const theme = useAppTheme();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingBottom: 16, backgroundColor: theme.background }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="完成" hitSlop={12} onPress={onClose}
            style={({ pressed }) => [styles.closeHit, pressed && styles.pressed]}>
            <Text style={[styles.close, { color: theme.accent }]}>完成</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator>
          {options.map((option) => {
            const selected = option.value === selectedValue;
            return (
              <Pressable key={option.value} accessibilityRole="button"
                accessibilityLabel={`${optionAccessibilityPrefix} ${option.label}`}
                accessibilityState={{ selected }}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
                style={[styles.option, { borderBottomColor: theme.border }, selected && { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.optionText, { color: selected ? theme.accent : theme.textSecondary }, selected && styles.optionTextSelected]}>
                  {option.label}
                </Text>
                {selected ? <Text style={[styles.check, { color: theme.accent }]}>✓</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 17, fontWeight: '800' },
  closeHit: { paddingVertical: 4, paddingHorizontal: 2 },
  close: { fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  list: { paddingBottom: 16 },
  option: {
    minHeight: 48,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: { flex: 1, fontSize: 15 },
  optionTextSelected: { fontWeight: '700' },
  check: { fontSize: 15, fontWeight: '900' },
});
