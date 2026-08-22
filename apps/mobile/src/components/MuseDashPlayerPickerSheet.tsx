import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { findGame, findProvider } from '@/domain/game-bind-options';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMuseDashPlayer, useMuseDashSearch } from '@/hooks/use-muse-dash';
import { useAppTheme } from '@/theme/app-theme';

export type MuseDashSearchResult = { nickname: string; userId: string };

/** musedash.moe 的 user_id 是 32 位小写 hex（可带连字符）。 */
function normalizeUserId(value: string): string | null {
  const normalized = value.replace(/-/g, '');
  return /^[0-9a-f]{32}$/i.test(normalized) ? normalized : null;
}

export function MuseDashPlayerPickerSheet({
  visible, onClose, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (player: MuseDashSearchResult) => Promise<void> | void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const museDashProvider = findProvider('musedash-moe')!;
  const museDashGame = findGame('musedash');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const debounced = useDebouncedValue(query, 350).trim();
  const userId = useMemo(() => normalizeUserId(debounced), [debounced]);
  const search = useMuseDashSearch(userId === null ? debounced : '');
  const direct = useMuseDashPlayer(userId);
  const players: MuseDashSearchResult[] = userId === null
    ? (search.data ?? []).map(([nickname, uid]) => ({ nickname, userId: uid }))
    : direct.data
      ? [{ nickname: direct.data.user.nickname, userId: direct.data.user.user_id }]
      : [];
  const loading = userId === null ? search.isFetching : direct.isFetching;
  const error = userId === null ? search.error : direct.error;

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
          <Text style={[styles.title, { color: theme.text }]}>绑定喵斯快跑玩家</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.identity}>
            <Image source={museDashProvider.icon} style={styles.icon} />
            <Text style={[styles.providerName, { color: theme.text }]}>{museDashProvider.title}</Text>
            <Text style={[styles.gameLine, { color: theme.textMuted }]}>用于绑定 {museDashGame?.title ?? '喵斯快跑'}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.body, { color: theme.textSecondary }]}>可输入昵称或玩家 ID</Text>
            <TextInput
              accessibilityLabel="搜索喵斯快跑玩家"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="昵称或玩家 ID"
              placeholderTextColor={theme.textMuted}
              value={query}
              onChangeText={setQuery}
              style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
            />
            {loading ? <ActivityIndicator style={styles.state} color={theme.accent} /> : null}
            {error ? <Text style={styles.error}>玩家搜索失败，请重试。</Text> : null}
            {!loading && !error && debounced && players.length === 0
              ? <Text style={[styles.stateText, { color: theme.textMuted }]}>没有找到公开玩家</Text>
              : null}
            {players.map((item) => (
              <Pressable
                key={item.userId}
                accessibilityRole="button"
                accessibilityLabel={`绑定喵斯快跑玩家 ${item.nickname}`}
                disabled={busyId !== null}
                onPress={async () => {
                  setBusyId(item.userId);
                  try { await onSelect(item); } finally { setBusyId(null); }
                }}
                style={({ pressed }) => [styles.row, { backgroundColor: theme.surfaceMuted }, pressed && styles.pressed]}
              >
                <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>M</Text></View>
                <View style={styles.main}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.nickname}</Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={1}>{item.userId}</Text>
                </View>
                {busyId === item.userId ? <ActivityIndicator color={theme.accent} /> : <Text style={[styles.bind, { color: theme.accent }]}>绑定</Text>}
              </Pressable>
            ))}
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
  avatarFallback: { backgroundColor: '#B8194D', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#FFF', fontWeight: '900', fontSize: 20 },
  main: { flex: 1, gap: 4 }, name: { fontSize: 16, fontWeight: '700' }, meta: { fontSize: 12 }, bind: { fontWeight: '700' },
});
