import { Stack, router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { EmptyDataView } from '@/components/EmptyDataView';
import { getGameToolbox } from '@/domain/game-toolbox';
import { useSession } from '@/state/session-store';

export default function ToolsScreen() {
  const activeGameId = useSession((s) => s.activeGameId);
  const toolbox = getGameToolbox(activeGameId);

  if (toolbox.tools.length === 0) {
    return (
      <View style={styles.page}>
        <Stack.Screen options={{ title: '工具箱' }} />
        <EmptyDataView title="工具箱" detail={toolbox.emptyDetail} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: '工具箱' }} />
      {toolbox.tools.map((tool) => (
        <Pressable key={tool.id} onPress={() => router.push(tool.href as Href)}>
          <Card style={styles.card}>
            <Text style={styles.title}>{tool.title}</Text>
            <Text style={styles.detail}>{tool.detail}</Text>
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
