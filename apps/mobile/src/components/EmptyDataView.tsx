import { StyleSheet, Text, View } from 'react-native';

/** 导航页通用空态：数据为空时展示，不讨论「属于哪个游戏」。 */
export function EmptyDataView({
  title = '暂无数据',
  detail = '空空空，当前账号还没有任何内容。',
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <View style={styles.page} accessibilityLabel={title}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{detail}</Text>
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
});
