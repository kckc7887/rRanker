import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

/** 无限列表页脚：加载中、后页失败可重试、已经结束。已载列表保持不动。 */
export function InfinitePageFooter({
  loading,
  failed,
  hasNextPage,
  onRetry,
}: {
  loading: boolean;
  failed: boolean;
  hasNextPage: boolean;
  onRetry: () => void;
}) {
  const theme = useAppTheme();
  if (loading) return <ActivityIndicator color={theme.accent} style={styles.footer} />;
  if (failed) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="重试加载后页" onPress={onRetry} style={styles.footer}>
        <Text style={{ color: theme.accent, textAlign: 'center' }}>后页加载失败，点此重试</Text>
      </Pressable>
    );
  }
  if (!hasNextPage) {
    return <Text style={[styles.footer, { color: theme.textMuted, textAlign: 'center' }]}>没有更多了</Text>;
  }
  return null;
}

const styles = StyleSheet.create({
  footer: { paddingVertical: 12 },
});
