import { ProviderIdentity } from '@rranker/sdk/components/ProviderIdentity';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ImageSourcePropType } from 'react-native';
import { AppSheet } from '@rranker/sdk/components/AppSheet';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';
import { RemoteNativeImage } from '@rranker/sdk/components/RemoteNativeImage';

export type PublicPlayerOption<T> = {
  key: string; name: string; meta: string; avatarUrl?: string | null; value: T;
};

export function PublicPlayerPickerSheet<T>({
  visible, onClose, onSelect, title, providerTitle, gameTitle, icon, query, onQueryChange, hasQuery = !!query.trim(), prompt = '搜索公开玩家', fallbackColor,
  placeholder, accessibilityLabel, optionAccessibilityPrefix = '绑定玩家', options, loading, error, emptyText, fallbackLetter,
}: {
  visible: boolean; onClose: () => void; onSelect: (value: T) => Promise<void> | void;
  title: string; providerTitle: string; gameTitle: string; icon: ImageSourcePropType;
  query: string; onQueryChange: (value: string) => void; placeholder: string; accessibilityLabel: string;
  optionAccessibilityPrefix?: string; hasQuery?: boolean; prompt?: string; fallbackColor?: string;
  options: readonly PublicPlayerOption<T>[]; loading: boolean; error: unknown; emptyText: string; fallbackLetter: string;
}) {
  const theme = useAppTheme();
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => { if (!visible) setBusyId(null); }, [visible]);
  return <AppSheet visible={visible} onRequestClose={onClose} title={title}
    leftAction={{ label: '取消', accessibilityLabel: '关闭玩家搜索', onPress: onClose }}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <ProviderIdentity icon={icon} title={providerTitle} gameTitle={gameTitle} />
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Text style={[styles.body, { color: theme.textSecondary }]}>{prompt}</Text>
        <TextInput accessibilityLabel={accessibilityLabel} autoCapitalize="none" autoCorrect={false} placeholder={placeholder}
          placeholderTextColor={theme.textMuted} value={query} onChangeText={onQueryChange}
          style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
        {loading ? <ActivityIndicator style={styles.state} color={theme.accent} /> : null}
        {error ? <Text style={[styles.error, { color: theme.danger }]}>玩家搜索失败，请重试。</Text> : null}
        {!loading && !error && hasQuery && options.length === 0 ? <Text style={[styles.stateText, { color: theme.textMuted }]}>{emptyText}</Text> : null}
        {options.map((item) => <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`${optionAccessibilityPrefix} ${item.name}`}
          disabled={busyId !== null} onPress={async () => { setBusyId(item.key); try { await onSelect(item.value); } finally { setBusyId(null); } }}
          style={({ pressed }) => [styles.row, { backgroundColor: theme.surfaceMuted }, pressed && styles.pressed]}>
          {item.avatarUrl ? <RemoteNativeImage source={{ uri: item.avatarUrl }} style={styles.avatar} />
            : <View style={[styles.avatar, styles.avatarFallback, fallbackColor ? { backgroundColor: fallbackColor } : undefined]}><Text style={styles.avatarText}>{fallbackLetter}</Text></View>}
          <View style={styles.main}><Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>{item.meta}</Text></View>
          {busyId === item.key ? <ActivityIndicator color={theme.accent} /> : <Text style={[styles.bind, { color: theme.accent }]}>绑定</Text>}
        </Pressable>)}
      </View>
    </ScrollView>
  </AppSheet>;
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.82 },
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 14 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, gap: 10 },
  body: { color: '#4B5563', lineHeight: 21 }, input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, color: '#111827' }, state: { marginTop: 4 }, stateText: { textAlign: 'center', marginTop: 8, fontSize: 13 }, error: { fontSize: 13 },
  row: { minHeight: 72, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 46, height: 46, borderRadius: 23 }, avatarFallback: { backgroundColor: '#17233B', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#FFF', fontWeight: '900', fontSize: 20 }, main: { flex: 1, gap: 4 }, name: { fontSize: 16, fontWeight: '700' }, meta: { fontSize: 12 }, bind: { fontWeight: '700' },
});
