import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveTufAvatarUrl, type TufPlayer } from '@/domain/tuf';
import { findGame, findProvider } from '@/domain/game-bind-options';
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
  const insets = useSafeAreaInsets();
  const tufProvider = findProvider('tuf')!;
  const adofaiGame = findGame('adofai');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const debounced = useDebouncedValue(query, 350).trim();
  const pid = useMemo(() => {
    const match = /^(?:pid:)?(\d+)$/i.exec(debounced);
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
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.background }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭玩家搜索"
            hitSlop={12}
            onPress={onClose}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
          >
            <Text style={[styles.close, { color: theme.accent }]}>取消</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>绑定 TUF 玩家</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.identity}>
            <Image source={tufProvider.icon} style={styles.icon} />
            <Text style={[styles.providerName, { color: theme.text }]}>{tufProvider.title}</Text>
            <Text style={[styles.gameLine, { color: theme.textMuted }]}>用于绑定 {adofaiGame?.title ?? '冰与火之舞'}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.body, { color: theme.textSecondary }]}>仅搜索公开资料，不需要账号或 Token</Text>
            <TextInput
              accessibilityLabel="搜索 TUF 玩家"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="昵称、PID 数字、Discord ID 或用户名"
              placeholderTextColor={theme.textMuted}
              value={query}
              onChangeText={setQuery}
              style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
            />
            {loading ? <ActivityIndicator style={styles.state} color={theme.accent} /> : null}
            {error ? <Text style={styles.error}>{error instanceof Error ? error.message : '玩家搜索失败'}</Text> : null}
            {!loading && !error && debounced && players.length === 0
              ? <Text style={[styles.stateText, { color: theme.textMuted }]}>没有找到公开玩家</Text>
              : null}
            {players.map((item) => {
              const avatarUrl = resolveTufAvatarUrl(item);
              return <Pressable
                key={String(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`绑定 TUF 玩家 ${item.name}`}
                disabled={busyId !== null}
                onPress={async () => {
                  setBusyId(item.id);
                  try { await onSelect(item); } finally { setBusyId(null); }
                }}
                style={({ pressed }) => [styles.row, { backgroundColor: theme.surfaceMuted }, pressed && styles.pressed]}
              >
                {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                  : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>T</Text></View>}
                <View style={styles.main}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>PID {item.id}{item.globalRank ? ` · 世界 #${item.globalRank}` : ''}</Text>
                </View>
                {busyId === item.id ? <ActivityIndicator color={theme.accent} /> : <Text style={[styles.bind, { color: theme.accent }]}>绑定</Text>}
              </Pressable>;
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F3F7' },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAction: { minWidth: 56, paddingVertical: 4 },
  headerSpacer: { minWidth: 56 },
  title: { flex: 1, textAlign: 'center', color: '#111827', fontSize: 17, fontWeight: '700' },
  close: { color: '#246BFD', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.82 },
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 14 },
  identity: { alignItems: 'center', gap: 6, paddingTop: 4, paddingBottom: 2 },
  icon: { width: 64, height: 64, borderRadius: 16 },
  providerName: { color: '#111827', fontSize: 20, fontWeight: '700' },
  gameLine: { color: '#6B7280', fontSize: 13 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, gap: 10 },
  body: { color: '#4B5563', lineHeight: 21 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, color: '#111827' },
  state: { marginTop: 4 },
  stateText: { textAlign: 'center', marginTop: 8, fontSize: 13 },
  error: { color: '#B42318', fontSize: 13 },
  row: { minHeight: 72, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { backgroundColor: '#17233B', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#FFF', fontWeight: '900', fontSize: 20 },
  main: { flex: 1, gap: 4 }, name: { fontSize: 16, fontWeight: '700' }, meta: { fontSize: 12 }, bind: { fontWeight: '700' },
});
