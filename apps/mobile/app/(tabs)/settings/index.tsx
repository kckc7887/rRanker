import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';

export default function SettingsScreen() {
  const tabBottomInset = useNativeTabBottomInset();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={styles.page}
      contentContainerStyle={[styles.content, { paddingBottom: tabBottomInset + 16 }]}
      scrollIndicatorInsets={{ bottom: tabBottomInset }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/game-management' as Href)}
        style={styles.row}
      >
        <View style={styles.rowText}>
          <Text style={styles.title}>游戏管理</Text>
          <Text style={styles.detail}>绑定的游戏账号与数据源</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 16, gap: 12 },
  row: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: { flex: 1, gap: 4 },
  title: { color: '#111827', fontSize: 17, fontWeight: '700' },
  detail: { color: '#6B7280', fontSize: 13 },
  chevron: { color: '#9CA3AF', fontSize: 28, lineHeight: 28, fontWeight: '300' },
});
