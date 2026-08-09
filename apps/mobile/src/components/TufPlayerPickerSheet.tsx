import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import type { TufPlayer } from '@/domain/tuf';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTufPlayerSearch, useTufProfile } from '@/hooks/use-tuf';
import { useAppTheme } from '@/theme/app-theme';

export function TufPlayerPickerSheet({
  visible, onClose, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (player: TufPlayer) => Promise<void> | void;
}) {
  const theme = useAppTheme();
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const debounced = useDebouncedValue(query, 350).trim();
  const pid = useMemo(() => {
    const match = /^pid:(\d+)$/i.exec(debounced);
    return match ? Number(match[1]) : null;
  }, [debounced]);
  const search = useTufPlayerSearch(pid === null ? debounced : '');
  const direct = useTufProfile(pid);
  const players = pid === null ? search.data?.results ?? [] : direct.data ? [direct.data] : [];
  const loading = pid === null ? search.isFetching : direct.isFetching;
  const error = pid === null ? search.error : direct.error;

  useEffect(() => { if (!visible) { setQuery(''); setBusyId(null); } }, [visible]);

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <View style={[styles.page, { backgroundColor: theme.background }]}>
        <View style={styles.signature}><View style={styles.ice} /><View style={styles.fire} /></View>
        <View style={styles.header}>
          <View><Text style={[styles.title, { color: theme.text }]}>绑定 TUF 玩家</Text>
            <Text style={[styles.detail, { color: theme.textMuted }]}>仅搜索公开资料，不需要账号或 Token</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="关闭玩家搜索" onPress={onClose}>
            <Text style={[styles.close, { color: theme.accent }]}>完成</Text>
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel="搜索 TUF 玩家"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="昵称、pid:123、Discord ID 或用户名"
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
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const avatarUrl = item.avatarUrl ?? item.avatar ?? null;
            return <Pressable
              accessibilityRole="button"
              accessibilityLabel={`绑定 TUF 玩家 ${item.name}`}
              disabled={busyId !== null}
              onPress={async () => {
                setBusyId(item.id);
                try { await onSelect(item); } finally { setBusyId(null); }
              }}
              style={({ pressed }) => [styles.row, { backgroundColor: theme.surface }, pressed && styles.pressed]}
            >
              {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>T</Text></View>}
              <View style={styles.main}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.meta, { color: theme.textMuted }]}>PID {item.id}{item.globalRank ? ` · 世界 #${item.globalRank}` : ''}</Text>
              </View>
              {busyId === item.id ? <ActivityIndicator color={theme.accent} /> : <Text style={[styles.bind, { color: theme.accent }]}>绑定</Text>}
            </Pressable>;
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 18 },
  signature: { flexDirection: 'row', height: 4, marginHorizontal: -18 },
  ice: { flex: 1, backgroundColor: '#44C7F4' }, fire: { flex: 1, backgroundColor: '#F15B55' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20 },
  title: { fontSize: 22, fontWeight: '800' }, detail: { fontSize: 12, marginTop: 4 }, close: { fontSize: 16, fontWeight: '700' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 14, height: 48, fontSize: 15 },
  state: { marginTop: 28 }, stateText: { textAlign: 'center', marginTop: 28 }, error: { color: '#B42318', marginTop: 16 },
  list: { gap: 10, paddingVertical: 16 }, row: { minHeight: 72, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pressed: { opacity: 0.82 }, avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { backgroundColor: '#17233B', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#FFF', fontWeight: '900', fontSize: 20 },
  main: { flex: 1, gap: 4 }, name: { fontSize: 16, fontWeight: '700' }, meta: { fontSize: 12 }, bind: { fontWeight: '700' },
});
