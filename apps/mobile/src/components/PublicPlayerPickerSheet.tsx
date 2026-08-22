import { useEffect, useState } from 'react';
import { ActivityIndicator, Image as NativeImage, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/app-theme';
import { RemoteNativeImage } from '@/components/RemoteNativeImage';

export type PublicPlayerOption<T> = {
  key: string; name: string; meta: string; avatarUrl?: string | null; value: T;
};

export function PublicPlayerPickerSheet<T>({
  visible, onClose, onSelect, title, providerTitle, gameTitle, icon, query, onQueryChange,
  placeholder, accessibilityLabel, optionAccessibilityPrefix = '绑定玩家', options, loading, error, emptyText, fallbackLetter,
}: {
  visible: boolean; onClose: () => void; onSelect: (value: T) => Promise<void> | void;
  title: string; providerTitle: string; gameTitle: string; icon: ImageSourcePropType;
  query: string; onQueryChange: (value: string) => void; placeholder: string; accessibilityLabel: string;
  optionAccessibilityPrefix?: string;
  options: readonly PublicPlayerOption<T>[]; loading: boolean; error: unknown; emptyText: string; fallbackLetter: string;
}) {
  const theme = useAppTheme(); const insets = useSafeAreaInsets();
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => { if (!visible) setBusyId(null); }, [visible]);
  return <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.background }]}>
      <View style={[styles.grabber, { backgroundColor: theme.border }]} />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭玩家搜索" hitSlop={12} onPress={onClose} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
          <Text style={[styles.close, { color: theme.accent }]}>取消</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text><View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <NativeImage source={icon} style={styles.icon} /><Text style={[styles.providerName, { color: theme.text }]}>{providerTitle}</Text>
          <Text style={[styles.gameLine, { color: theme.textMuted }]}>用于绑定 {gameTitle}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.body, { color: theme.textSecondary }]}>搜索公开玩家</Text>
          <TextInput accessibilityLabel={accessibilityLabel} autoCapitalize="none" autoCorrect={false} placeholder={placeholder}
            placeholderTextColor={theme.textMuted} value={query} onChangeText={onQueryChange}
            style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
          {loading ? <ActivityIndicator style={styles.state} color={theme.accent} /> : null}
          {error ? <Text style={styles.error}>玩家搜索失败，请重试。</Text> : null}
          {!loading && !error && query.trim() && options.length === 0 ? <Text style={[styles.stateText, { color: theme.textMuted }]}>{emptyText}</Text> : null}
          {options.map((item) => <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`${optionAccessibilityPrefix} ${item.name}`}
            disabled={busyId !== null} onPress={async () => { setBusyId(item.key); try { await onSelect(item.value); } finally { setBusyId(null); } }}
            style={({ pressed }) => [styles.row, { backgroundColor: theme.surfaceMuted }, pressed && styles.pressed]}>
            {item.avatarUrl ? <RemoteNativeImage source={{ uri: item.avatarUrl }} style={styles.avatar} />
              : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>{fallbackLetter}</Text></View>}
            <View style={styles.main}><Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.meta, { color: theme.textMuted }]}>{item.meta}</Text></View>
            {busyId === item.key ? <ActivityIndicator color={theme.accent} /> : <Text style={[styles.bind, { color: theme.accent }]}>绑定</Text>}
          </Pressable>)}
        </View>
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F3F7' }, grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: '#D1D5DB', marginTop: 10, marginBottom: 4 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }, headerAction: { minWidth: 56, paddingVertical: 4 }, headerSpacer: { minWidth: 56 },
  title: { flex: 1, textAlign: 'center', color: '#111827', fontSize: 17, fontWeight: '700' }, close: { color: '#246BFD', fontSize: 16, fontWeight: '600' }, pressed: { opacity: 0.82 },
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 14 }, identity: { alignItems: 'center', gap: 6, paddingTop: 4, paddingBottom: 2 }, icon: { width: 64, height: 64, borderRadius: 16 },
  providerName: { color: '#111827', fontSize: 20, fontWeight: '700' }, gameLine: { color: '#6B7280', fontSize: 13 }, card: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, gap: 10 },
  body: { color: '#4B5563', lineHeight: 21 }, input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, color: '#111827' }, state: { marginTop: 4 }, stateText: { textAlign: 'center', marginTop: 8, fontSize: 13 }, error: { color: '#B42318', fontSize: 13 },
  row: { minHeight: 72, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 46, height: 46, borderRadius: 23 }, avatarFallback: { backgroundColor: '#17233B', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#FFF', fontWeight: '900', fontSize: 20 }, main: { flex: 1, gap: 4 }, name: { fontSize: 16, fontWeight: '700' }, meta: { fontSize: 12 }, bind: { fontWeight: '700' },
});
