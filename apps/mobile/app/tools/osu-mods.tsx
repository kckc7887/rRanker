import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { EmptyDataView } from '@/components/EmptyDataView';
import { OsuModBadge } from '@/components/osu/OsuModBadge';
import { isOsuGameId } from '@/domain/game-mode-family';
import {
  OSU_MOD_TYPE_LABELS,
  osuUserPlayableMods,
  type OsuModType,
} from '@/domain/osu-mods';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

const TYPE_ORDER: readonly OsuModType[] = [
  'DifficultyReduction',
  'DifficultyIncrease',
  'Conversion',
  'Automation',
  'Fun',
  'System',
];

export default function OsuModsScreen() {
  const theme = useAppTheme();
  const activeGameId = useSession((state) => state.activeGameId);
  if (!isOsuGameId(activeGameId)) {
    return (
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '模组百科' }} />
        <EmptyDataView title="模组百科" detail="请先切换到 osu! 游戏模式。" />
      </View>
    );
  }

  const mods = osuUserPlayableMods(activeGameId);
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={[styles.page, { backgroundColor: theme.background }]}
    >
      <Stack.Screen options={{ title: '模组百科' }} />
      <Text style={[styles.intro, { color: theme.textMuted }]}>当前仅展示此游戏模式可启用的模组。</Text>
      {TYPE_ORDER.map((type) => {
        const section = mods.filter((mod) => mod.type === type);
        if (section.length === 0) return null;
        return (
          <View key={type} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{OSU_MOD_TYPE_LABELS[type]}</Text>
            {section.map((mod) => {
              const multipliers = mod.gameplayMultipliersByGameId?.[activeGameId] ?? [];
              return (
                <Card key={mod.acronym} style={styles.card}>
                  <View style={styles.heading}>
                    <OsuModBadge acronym={mod.acronym} size={42} />
                    <View style={styles.headingText}>
                      <Text style={[styles.name, { color: theme.text }]}>{mod.chineseName}</Text>
                      <Text style={[styles.acronym, { color: theme.textSecondary }]}>{mod.acronym} · {mod.englishName}</Text>
                    </View>
                  </View>
                  <Text style={[styles.description, { color: theme.textSecondary }]}>
                    {mod.descriptionByGameId?.[activeGameId] ?? mod.description}
                  </Text>
                  {multipliers.length > 0 ? (
                    <View style={styles.multipliers}>
                      {multipliers.map((item) => (
                        <View key={item.label} style={[styles.multiplier, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                          <Text style={[styles.multiplierLabel, { color: theme.textMuted }]}>{item.label}</Text>
                          <Text style={[styles.multiplierValue, { color: theme.text }]}>{item.value}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 18 },
  intro: { fontSize: 13, lineHeight: 19 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  card: { gap: 10 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '800' },
  acronym: { fontSize: 12, fontWeight: '700' },
  description: { fontSize: 14, lineHeight: 21 },
  multipliers: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  multiplier: { minWidth: 92, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, gap: 2 },
  multiplierLabel: { fontSize: 10, fontWeight: '700' },
  multiplierValue: { fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
});
