import { SettingsRow } from '@rranker/sdk/components/SettingsRow';
import Constants from 'expo-constants';
import { Stack, router, type Href } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text } from 'react-native';
import { useNotification } from '@rranker/sdk/components/AppNotification';
import { DetailGestureRoot } from '@rranker/sdk/components/game-content/DetailPressable';
import { recordRuntimeError } from '@rranker/sdk/services/runtime-diagnostics-recorder';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';

export default function AboutScreen() {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const appVersion = Constants.expoConfig?.version ?? '未知';

  const handleOpenRepository = async () => {
    try {
      await Linking.openURL('https://github.com/kckc7887/rRanker');
    } catch (error) {
      recordRuntimeError('github-repository-open', error);
      showNotification({
        title: '打开失败',
        message: '无法打开 GitHub 仓库，请检查浏览器后重试。',
        variant: 'error',
      });
    }
  };

  return (
    <DetailGestureRoot style={[styles.page, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: '关于' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <SettingsRow title="版本信息"><Text style={[styles.value, { color: theme.textSecondary }]}>{appVersion}</Text></SettingsRow>
        <SettingsRow title="隐私政策" onPress={() => router.push('/privacy-policy' as Href)} />
        <SettingsRow title="GitHub 仓库" detail="kckc7887/rRanker" onPress={() => void handleOpenRepository()} />
      </ScrollView>
    </DetailGestureRoot>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12 },
  value: { flexShrink: 1, fontSize: 15 },
});
