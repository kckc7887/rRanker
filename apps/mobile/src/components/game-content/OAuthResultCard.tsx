import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

type Result = { kind: 'success'; accountName: string } | { kind: 'error'; message: string };

export function OAuthResultCard({ title, message, result, busy, children }: {
  title?: string; message?: string; result?: Result; busy?: boolean; children?: ReactNode;
}) {
  const theme = useAppTheme();
  if (result?.kind === 'success') {
    title = '授权成功';
    message = '已绑定「' + result.accountName + '」，返回即可查看数据。';
  } else if (result?.kind === 'error') {
    title = '授权失败';
    message = result.message;
  }
  return <View style={[styles.page, { backgroundColor: theme.background }]}>
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      {busy && <ActivityIndicator color={theme.accent} />}
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.textMuted }]}>{message}</Text>
      {children}
      {result && <Pressable accessibilityRole="button" accessibilityLabel="返回首页" onPress={() => router.dismissTo('/')}
        style={({ pressed }) => [styles.button, { backgroundColor: theme.accent }, pressed && styles.pressed]}>
        <Text style={[styles.buttonText, { color: theme.onAccent }]}>返回首页</Text>
      </Pressable>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, borderRadius: 16, padding: 22, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  button: { borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 4 },
  buttonText: { fontWeight: '700' },
  pressed: { opacity: 0.9 },
});
