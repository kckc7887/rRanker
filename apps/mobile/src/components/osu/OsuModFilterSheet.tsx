import { useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable as GesturePressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppModal } from '@/components/AppModal';
import type { OsuGameId } from '@/domain/game-mode-family';
import {
  OSU_MOD_TYPE_LABELS,
  osuUserPlayableMods,
  type OsuModMetadata,
  type OsuModType,
} from '@/domain/osu-mods';
import { OSU_MOD_FILTER_NONE } from '@/domain/osu-filters';
import { useAppTheme } from '@/theme/app-theme';
import { OsuModBadge } from './OsuModBadge';

const SheetPressable = Platform.OS === 'android' ? Pressable : GesturePressable;
const TYPE_ORDER: readonly OsuModType[] = [
  'DifficultyReduction',
  'DifficultyIncrease',
  'Conversion',
  'Automation',
  'Fun',
  'System',
];

type FilterItem = Pick<OsuModMetadata, 'acronym' | 'chineseName' | 'type'>;

export function OsuModFilterSheet({
  visible,
  gameId,
  selectedMods,
  onApply,
  onClose,
}: {
  visible: boolean;
  gameId: OsuGameId;
  selectedMods: readonly string[];
  onApply: (mods: string[]) => void;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [draftMods, setDraftMods] = useState<Set<string>>(() => new Set(selectedMods));
  const grouped = useMemo(() => {
    const playable = osuUserPlayableMods(gameId);
    return TYPE_ORDER.map((type) => ({
      type,
      label: OSU_MOD_TYPE_LABELS[type],
      items: [
        ...(type === 'System'
          ? [{ acronym: OSU_MOD_FILTER_NONE, chineseName: '无模组', type: 'System' as const }]
          : []),
        ...playable.filter((item) => item.type === type),
      ] satisfies FilterItem[],
    })).filter((group) => group.items.length > 0);
  }, [gameId]);

  const toggle = (acronym: string) => {
    setDraftMods((current) => {
      if (acronym === OSU_MOD_FILTER_NONE) {
        return current.has(OSU_MOD_FILTER_NONE) ? new Set() : new Set([OSU_MOD_FILTER_NONE]);
      }
      const next = new Set(current);
      next.delete(OSU_MOD_FILTER_NONE);
      if (next.has(acronym)) next.delete(acronym);
      else next.add(acronym);
      return next;
    });
  };
  const apply = () => {
    const order = grouped.flatMap((group) => group.items.map((item) => item.acronym));
    onApply(order.filter((acronym) => draftMods.has(acronym)));
    onClose();
  };

  return (
    <AppModal
      animationType="slide"
      presentationStyle="pageSheet"
      visible={visible}
      onRequestClose={onClose}
    >
      <View testID="osu-mod-filter-sheet" style={[styles.page, {
        backgroundColor: theme.background,
        paddingBottom: Math.max(insets.bottom, 12),
      }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <SheetPressable accessibilityRole="button" accessibilityLabel="清空 osu! 模组筛选"
            accessibilityState={{ disabled: draftMods.size === 0 }} disabled={draftMods.size === 0}
            onPress={() => setDraftMods(new Set())} style={({ pressed }) => [styles.headerActionHit, pressed && styles.pressed]}>
            <Text style={[styles.headerAction, { color: draftMods.size === 0 ? theme.textMuted : theme.accent }]}>清空</Text>
          </SheetPressable>
          <Text style={[styles.title, { color: theme.text }]}>模组筛选</Text>
          <SheetPressable accessibilityRole="button" accessibilityLabel="完成 osu! 模组筛选"
            onPress={apply} style={({ pressed }) => [styles.headerActionHit, pressed && styles.pressed]}>
            <Text style={[styles.headerAction, { color: theme.accent }]}>完成</Text>
          </SheetPressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {grouped.map((group) => (
            <View key={group.type} style={styles.group} testID={`osu-mod-filter-group-${group.type}`}>
              <Text style={[styles.groupTitle, { color: theme.textSecondary }]}>{group.label}</Text>
              <View style={[styles.groupCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                {group.items.map((item, index) => {
                  const selected = draftMods.has(item.acronym);
                  return (
                    <SheetPressable key={item.acronym} accessibilityRole="checkbox"
                      accessibilityLabel={`${item.acronym} ${item.chineseName}，${selected ? '已选中' : '未选中'}`}
                      accessibilityState={{ checked: selected }} onPress={() => toggle(item.acronym)}
                      testID={`osu-mod-filter-option-${item.acronym}`}
                      style={({ pressed }) => [styles.option, index > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }, pressed && styles.pressed]}>
                      {item.acronym === OSU_MOD_FILTER_NONE ? (
                        <View style={[styles.nmIcon, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                          <Ionicons name="remove" size={15} color={theme.textMuted} />
                        </View>
                      ) : (
                        <View pointerEvents="none">
                          <OsuModBadge acronym={item.acronym} />
                        </View>
                      )}
                      <Text style={[styles.acronym, { color: theme.text }]}>{item.acronym}</Text>
                      <Text style={[styles.chineseName, { color: theme.textSecondary }]}>{item.chineseName}</Text>
                      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22}
                        color={selected ? theme.accent : theme.textMuted} />
                    </SheetPressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, marginBottom: 4 },
  header: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  headerActionHit: { minWidth: 52, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  headerAction: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, gap: 20 },
  group: { gap: 8 },
  groupTitle: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  groupCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: 'hidden' },
  option: { minHeight: 52, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  nmIcon: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  acronym: { width: 38, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  chineseName: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  pressed: { opacity: 0.62 },
});
