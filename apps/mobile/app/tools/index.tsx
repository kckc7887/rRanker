import { Stack, router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { EmptyDataView } from '@/components/EmptyDataView';
import { useSession } from '@/state/session-store';

const TOOLS = [
  ['/tools/rating', 'DX Rating 计算器', '档位表、指定达成率与目标 Rating 反推'],
  ['/tools/tolerance', '达成率与容错', 'Note 权重、BREAK 奖励与同类错误上限'],
  ['/tools/plates', '牌子进度', '用本地水鱼最佳成绩核对姓名框要求'],
  ['/tools/versions', '版本对照与总结', '国服/日服名称对照，以及逐版本游玩情况'],
] as const;

export default function ToolsScreen() {
  const activeGameId = useSession((s) => s.activeGameId);

  if (activeGameId !== 'maimai') {
    return (
      <View style={styles.page}>
        <Stack.Screen options={{ title: '工具箱' }} />
        <EmptyDataView title="工具箱" detail="空空空" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '工具箱' }} />
      {TOOLS.map(([href, title, detail]) => (
        <Pressable key={href} onPress={() => router.push(href as Href)}>
          <Card style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.detail}>{detail}</Text>
            <Text style={styles.link}>打开 →</Text>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 16, gap: 12 },
  card: { gap: 7 },
  title: { color: '#111827', fontSize: 17, fontWeight: '700' },
  detail: { color: '#6B7280', lineHeight: 20 },
  link: { color: '#246BFD', fontWeight: '600' },
});
