import { Stack, router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNotification } from '@/components/AppNotification';
import { Card } from '@/components/Card';
import { EmptyDataView } from '@/components/EmptyDataView';
import { getGameToolbox } from '@/domain/game-toolbox';
import { useSession } from '@/state/session-store';
import { useToolboxPins } from '@/state/toolbox-pins';

export default function ToolsScreen() {
  const { showNotification } = useNotification();
  const activeGameId = useSession((s) => s.activeGameId);
  const toolbox = getGameToolbox(activeGameId);
  const pinnedToolIds = useToolboxPins((s) => s.pinnedToolIdsByGame[activeGameId]);
  const hydratePins = useToolboxPins((s) => s.hydrate);
  const togglePinnedTool = useToolboxPins((s) => s.togglePinnedTool);
  const [pendingToolId, setPendingToolId] = useState<string | null>(null);

  useEffect(() => {
    void hydratePins();
  }, [hydratePins]);

  const togglePin = async (toolId: string) => {
    setPendingToolId(toolId);
    try {
      await togglePinnedTool(activeGameId, toolId);
    } catch {
      showNotification({
        title: '保存失败',
        message: '无法保存工具置顶状态，请稍后重试。',
        variant: 'error',
      });
    } finally {
      setPendingToolId(null);
    }
  };

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
            <View style={styles.titleRow}>
              <Text style={styles.title}>{tool.title}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${pinnedToolIds.includes(tool.id) ? '取消置顶' : '置顶'} ${tool.title}`}
                disabled={pendingToolId !== null}
                onPress={(event) => {
                  event.stopPropagation();
                  void togglePin(tool.id);
                }}
                style={({ pressed }) => [
                  styles.pinButton,
                  pinnedToolIds.includes(tool.id) && styles.pinButtonActive,
                  pressed && styles.pinButtonPressed,
                  pendingToolId !== null && styles.pinButtonDisabled,
                ]}
              >
                <Text style={[
                  styles.pinButtonText,
                  pinnedToolIds.includes(tool.id) && styles.pinButtonTextActive,
                ]}>
                  {pinnedToolIds.includes(tool.id) ? '已置顶' : '置顶'}
                </Text>
              </Pressable>
            </View>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, color: '#111827', fontSize: 17, fontWeight: '700' },
  pinButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C7D2E2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pinButtonActive: { borderColor: '#246BFD', backgroundColor: '#EAF1FF' },
  pinButtonPressed: { opacity: 0.7 },
  pinButtonDisabled: { opacity: 0.55 },
  pinButtonText: { color: '#5B6472', fontSize: 13, fontWeight: '700' },
  pinButtonTextActive: { color: '#246BFD' },
  detail: { color: '#6B7280', lineHeight: 20 },
  link: { color: '#246BFD', fontWeight: '600' },
});
