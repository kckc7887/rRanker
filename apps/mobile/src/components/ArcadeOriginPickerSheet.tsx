import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppModal } from '@/components/AppModal';
import { formatArcadeGeocodedLabel, type ArcadeOrigin } from '@/domain/arcade-shops';
import { useAppTheme } from '@/theme/app-theme';

export function ArcadeOriginPickerSheet({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (origin: ArcadeOrigin) => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraft('');
    setError('');
    setSearching(false);
    const handle = InteractionManager.runAfterInteractions(() => {
      inputRef.current?.focus();
    });
    return () => handle.cancel();
  }, [visible]);

  const search = async () => {
    const query = draft.trim();
    if (!query) {
      setError('请输入地址或地名');
      return;
    }
    setSearching(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('需要定位权限才能搜索地址');
        return;
      }
      const results = await Location.geocodeAsync(query);
      if (results.length === 0) {
        setError('未找到该地址，请换个关键词试试');
        return;
      }
      const first = results[0];
      let label = query;
      try {
        const places = await Location.reverseGeocodeAsync({
          latitude: first.latitude,
          longitude: first.longitude,
        });
        if (places[0]) {
          label = formatArcadeGeocodedLabel(places[0]) || query;
        }
      } catch {
        // Keep the user query as label when reverse geocode is unavailable.
      }
      onSelect({
        source: 'custom',
        latitude: first.latitude,
        longitude: first.longitude,
        label,
      });
      onClose();
    } catch {
      setError('地址搜索失败，请稍后重试');
    } finally {
      setSearching(false);
    }
  };

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={searching ? undefined : onClose}
    >
      <View
        style={[styles.root, { backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <Text style={[styles.title, { color: theme.text }]}>设置搜索原点</Text>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          输入城市、商圈或详细地址，将以此为中心查找附近机厅。
        </Text>
        <TextInput
          ref={inputRef}
          accessibilityLabel="原点地址"
          autoCorrect={false}
          editable={!searching}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => { void search(); }}
          returnKeyType="search"
          placeholder="例如：徐家汇 / 上海市静安区"
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="取消设置原点"
            disabled={searching}
            onPress={onClose}
            style={styles.secondary}
          >
            <Text style={[styles.secondaryText, { color: theme.textSecondary }]}>取消</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="搜索并设为原点"
            disabled={searching}
            onPress={() => { void search(); }}
            style={[styles.primary, { backgroundColor: theme.accent }, searching && styles.disabled]}
          >
            {searching ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>设为原点</Text>}
          </Pressable>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 20, paddingTop: 10, gap: 12 },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 999, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 13, lineHeight: 18 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16 },
  error: { color: '#DC2626', fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 4 },
  secondary: { minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 15, fontWeight: '600' },
  primary: {
    minHeight: 40,
    minWidth: 108,
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.7 },
});
