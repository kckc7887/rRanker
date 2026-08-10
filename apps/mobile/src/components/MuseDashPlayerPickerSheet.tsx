import { useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMuseDashSearch } from '@/hooks/use-muse-dash';
import { useAppTheme } from '@/theme/app-theme';

export type MuseDashSearchResult = { nickname: string; userId: string };

export function MuseDashPlayerPickerSheet({
  visible, onClose, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (player: MuseDashSearchResult) => Promise<void> | void;
}) {
  const theme = useAppTheme();
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const debounced = useDebouncedValue(query, 350).trim();
  const search = useMuseDashSearch(debounced);
  const players: MuseDashSearchResult[] = debounced
    ? (search.data ?? []).map(([nickname, userId]) => ({ nickname, userId }))
    : [];
  const loading = search.isFetching;
  const error = search.error;

  useEffect(() => { if (!visible) { setQuery(''); setBusyId(null); } }, [visible]);

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <View style={styles.signature} />
        <View style={styles.header}>
          <View><Text style={[styles.title, { color: theme.text }]}>绑定喵斯快跑玩家</Text>
            <Text style={[styles.detail, { color: theme.textMuted }]}>仅搜索公开资料，不需要账号或 Token</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="关闭玩家搜索" onPress={onClose}>
            <Text style={[styles.close, { color: theme.accent }]}>完成</Text>
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel="搜索喵斯快跑玩家"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="昵称或 user_id"
          placeholderTextColor={theme.textMuted}
          value={query}
          onChangeText={setQuery}
          style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
        />
        {loading ? <ActivityIndicator style={styles.state} color={theme.accent} /> : null}
        {error ? <Text style={styles.error}>{error instanceof Error ? error.message : '玩家搜索失败'}</Text> : null}
        {!loading && !error && debounced && players.length === 0
          ? <Text style={[styles.stateText, { color: theme.textMuted }]}>没有找到公开玩家</Text>
          : null}
        <FlatList
          data={players}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`绑定喵斯快跑玩家 ${item.nickname}`}
              disabled={busyId !== null}
              onPress={async () => {
                setBusyId(item.userId);
                try { await onSelect(item); } finally { setBusyId(null); }
              }}
              style={({ pressed }) => [styles.row, { backgroundColor: theme.surface }, pressed && styles.pressed]}
            >
              <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>M</Text></View>
              <View style={styles.main}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.nickname}</Text>
                <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={1}>{item.userId}</Text>
              </View>
              {busyId === item.userId ? <ActivityIndicator color={theme.accent} /> : <Text style={[styles.bind, { color: theme.accent }]}>绑定</Text>}
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 18 },
  signature: { height: 4, marginHorizontal: -18, backgroundColor: '#FF5A8A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20 },
  title: { fontSize: 22, fontWeight: '800' }, detail: { fontSize: 12, marginTop: 4 }, close: { fontSize: 16, fontWeight: '700' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 14, height: 48, fontSize: 15 },
  state: { marginTop: 28 }, stateText: { textAlign: 'center', marginTop: 28 }, error: { color: '#B42318', marginTop: 16 },
  list: { gap: 10, paddingVertical: 16 }, row: { minHeight: 72, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.82 }, avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { backgroundColor: '#B8194D', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#FFF', fontWeight: '900', fontSize: 20 },
  main: { flex: 1, gap: 4 }, name: { fontSize: 16, fontWeight: '700' }, meta: { fontSize: 12 }, bind: { fontWeight: '700' },
});
