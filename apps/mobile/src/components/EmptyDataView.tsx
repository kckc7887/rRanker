import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

/** 导航页通用空态：数据为空时展示，不讨论「属于哪个游戏」。 */
export function EmptyDataView({
  title = '暂无数据',
  detail = '当前账号暂无可显示内容。',
  showBindAction = false,
}: {
  title?: string;
  detail?: string;
  showBindAction?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <View style={[styles.page, { backgroundColor: theme.background }]} accessibilityLabel={title}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.body, { color: theme.textMuted }]}>{detail}</Text>
      {showBindAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="前往游戏管理"
          onPress={() => router.push('/game-management')}
          style={[styles.action, { backgroundColor: theme.accent }]}
        >
          <Text style={[styles.actionText, { color: theme.onAccent }]}>前往游戏管理</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F7F8FA',
    padding: 24,
    justifyContent: 'center',
    gap: 10,
  },
  title: { color: '#111827', fontSize: 22, fontWeight: '700' },
  body: { color: '#6B7280', fontSize: 15, lineHeight: 22 },
  action: { alignSelf: 'flex-start', borderRadius: 10, marginTop: 8, paddingHorizontal: 16, paddingVertical: 10 },
  actionText: { fontSize: 15, fontWeight: '700' },
});
