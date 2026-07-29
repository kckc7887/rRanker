import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { FilterDefinition, GameManifestV1 } from '@/domain/game-model';
import type { FilterSelection } from '@/state/game-filters';
import { GameTag } from './GameTag';
import { useAppTheme } from '@/theme/app-theme';

export function GameFilterBar({
  manifest,
  definitions,
  collapsed,
  selections,
  onCollapsedChange,
  onSelectionChange,
  onReset,
}: {
  manifest: GameManifestV1;
  definitions: readonly FilterDefinition[];
  collapsed: boolean;
  selections: Record<string, FilterSelection>;
  onCollapsedChange: (collapsed: boolean) => void;
  onSelectionChange: (filterId: string, selection: FilterSelection) => void;
  onReset: () => void;
}) {
  const theme = useAppTheme();
  if (!definitions.length) return null;
  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={collapsed ? '展开筛选' : '收起筛选'}
          onPress={() => onCollapsedChange(!collapsed)}
          style={styles.headerButton}
        >
          <Text style={[styles.headerText, { color: theme.text }]}>筛选</Text>
          <Ionicons
            name={collapsed ? 'chevron-down' : 'chevron-up'}
            color={theme.textMuted}
            size={17}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="重置筛选"
          onPress={onReset}
          style={styles.reset}
        >
          <Text style={[styles.resetText, { color: theme.accent }]}>重置</Text>
        </Pressable>
      </View>
      {collapsed ? null : definitions.map((definition) => {
        const selection = selections[definition.id] ?? {};
        return (
          <View key={definition.id} style={styles.section}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: theme.textSecondary }]}>{definition.title}</Text>
              {definition.toggle ? (
                <View style={[styles.toggle, { borderColor: theme.border }]}>
                  {[false, true].map((value) => (
                    <Pressable
                      key={String(value)}
                      onPress={() => onSelectionChange(definition.id, { ...selection, toggle: value })}
                      style={[
                        styles.toggleHalf,
                        (selection.toggle ?? definition.toggle!.defaultValue) === value
                          ? { backgroundColor: theme.accent }
                          : null,
                      ]}
                    >
                      <Text style={[
                        styles.toggleText,
                        {
                          color: (selection.toggle ?? definition.toggle!.defaultValue) === value
                            ? '#FFFFFF'
                            : theme.textMuted,
                        },
                      ]}>
                        {value ? definition.toggle!.rightLabel : definition.toggle!.leftLabel}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
            {definition.control === 'range' ? (
              <View style={styles.range}>
                <TextInput
                  accessibilityLabel={`${definition.title}下限`}
                  keyboardType="decimal-pad"
                  placeholder="最小"
                  placeholderTextColor={theme.textMuted}
                  value={selection.minimum ?? ''}
                  onChangeText={(minimum) => onSelectionChange(definition.id, { ...selection, minimum })}
                  style={[
                    styles.rangeInput,
                    { backgroundColor: theme.input, borderColor: theme.border, color: theme.text },
                  ]}
                />
                <Text style={{ color: theme.textMuted }}>—</Text>
                <TextInput
                  accessibilityLabel={`${definition.title}上限`}
                  keyboardType="decimal-pad"
                  placeholder="最大"
                  placeholderTextColor={theme.textMuted}
                  value={selection.maximum ?? ''}
                  onChangeText={(maximum) => onSelectionChange(definition.id, { ...selection, maximum })}
                  style={[
                    styles.rangeInput,
                    { backgroundColor: theme.input, borderColor: theme.border, color: theme.text },
                  ]}
                />
                {definition.unit ? (
                  <Text style={[styles.unit, { color: theme.textMuted }]}>{definition.unit}</Text>
                ) : null}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
                <Pressable
                  accessibilityLabel={`${definition.title}筛选：全部`}
                  onPress={() => onSelectionChange(definition.id, { ...selection, value: undefined })}
                  style={[
                    styles.option,
                    { borderColor: theme.border },
                    !selection.value ? { borderColor: theme.accent, backgroundColor: theme.accentSoft } : null,
                  ]}
                >
                  <Text style={[styles.optionText, { color: theme.text }]}>全部</Text>
                </Pressable>
                {definition.options.map((option) => {
                  const selected = selection.value === option.value;
                  return (
                    <Pressable
                      accessibilityLabel={`${definition.title}筛选：${option.label}`}
                      key={option.value}
                      onPress={() => onSelectionChange(definition.id, {
                        ...selection,
                        value: selected ? undefined : option.value,
                      })}
                      style={[
                        styles.option,
                        { borderColor: selected ? theme.accent : theme.border },
                        selected ? { backgroundColor: theme.accentSoft } : null,
                      ]}
                    >
                      {'tag' in option && option.tag ? (
                        <GameTag manifest={manifest} tag={option.tag} small />
                      ) : (
                        <Text style={[styles.optionText, { color: theme.text }]}>{option.label}</Text>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  header: { height: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  headerButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerText: { fontSize: 13, fontWeight: '800' },
  reset: { paddingHorizontal: 8, paddingVertical: 6 },
  resetText: { fontSize: 12, fontWeight: '700' },
  section: { paddingHorizontal: 12, paddingBottom: 11, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 11, fontWeight: '700' },
  options: { gap: 6 },
  option: {
    minHeight: 30,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { fontSize: 11, fontWeight: '700' },
  range: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rangeInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    fontSize: 12,
  },
  unit: { fontSize: 11 },
  toggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  toggleHalf: { minWidth: 42, paddingHorizontal: 8, paddingVertical: 5, alignItems: 'center' },
  toggleText: { fontSize: 10, fontWeight: '800' },
});
