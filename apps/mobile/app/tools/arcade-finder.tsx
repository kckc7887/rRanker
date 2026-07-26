import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from 'react-native';
import { Stack } from 'expo-router';
import * as Location from 'expo-location';
import { Card } from '@/components/Card';
import { EmptyDataView } from '@/components/EmptyDataView';
import {
  ARCADE_RADIUS_OPTIONS,
  FALLBACK_ARCADE_GAME_TITLES,
  formatArcadeAddress,
  formatArcadeDistanceKm,
  formatArcadeGamesSummary,
  filterArcadeShops,
  type ArcadeGameTitle,
  type ArcadeRadiusKm,
  type ArcadeShop,
} from '@/domain/arcade-shops';
import {
  arcadeFinderPreferencesStore,
  defaultArcadeFinderPreferences,
} from '@/features/toolbox/arcade-finder-preferences';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { fetchNearcadeDiscover, fetchNearcadeGameTitles } from '@/services/nearcade-client';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { openArcadeNavigation } from '@/utils/open-arcade-navigation';

type LoadErrorKind = 'permission' | 'location' | 'network' | null;

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
        active && { backgroundColor: theme.accent, borderColor: theme.accent },
      ]}
    >
      <Text style={[styles.chipText, { color: theme.textSecondary }, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ArcadeShopCard({
  shop,
  onNavigate,
}: {
  shop: ArcadeShop;
  onNavigate: (shop: ArcadeShop) => void;
}) {
  const theme = useAppTheme();
  return (
    <Card style={styles.shopCard}>
      <View style={styles.shopHeader}>
        <Text style={[styles.shopName, { color: theme.text }]} numberOfLines={2}>
          {shop.name}
        </Text>
        <Text style={[styles.shopDistance, { color: theme.accent }]}>
          {formatArcadeDistanceKm(shop.distanceKm)}
        </Text>
      </View>
      <Text style={[styles.shopAddress, { color: theme.textMuted }]} numberOfLines={2}>
        {formatArcadeAddress(shop) || '地址未知'}
      </Text>
      <Text style={[styles.shopGames, { color: theme.textSecondary }]} numberOfLines={3}>
        {formatArcadeGamesSummary(shop.games)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`导航到${shop.name}`}
        onPress={() => onNavigate(shop)}
        style={[styles.navButton, { backgroundColor: theme.accent }]}
      >
        <Text style={styles.navButtonText}>导航</Text>
      </Pressable>
    </Card>
  );
}

export default function ArcadeFinderScreen() {
  const theme = useAppTheme();
  const activeGameId = useSession((s) => s.activeGameId);
  const [hydrated, setHydrated] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [radiusKm, setRadiusKm] = useState<ArcadeRadiusKm>(10);
  const [titleIds, setTitleIds] = useState<number[]>(() => defaultArcadeFinderPreferences().titleIds);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [gameTitles, setGameTitles] = useState<readonly ArcadeGameTitle[]>(FALLBACK_ARCADE_GAME_TITLES);
  const [shops, setShops] = useState<ArcadeShop[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorKind, setErrorKind] = useState<LoadErrorKind>(null);
  const debouncedKeyword = useDebouncedValue(keyword);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const prefs = await arcadeFinderPreferencesStore.load();
      if (cancelled) return;
      setRadiusKm(prefs.radiusKm);
      setTitleIds(prefs.titleIds);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void arcadeFinderPreferencesStore.save({ radiusKm, titleIds });
  }, [hydrated, radiusKm, titleIds]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const titles = await fetchNearcadeGameTitles();
      if (!cancelled) setGameTitles(titles);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadShops = useCallback(async () => {
    setIsLoading(true);
    setErrorKind(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setShops(null);
        setErrorKind('permission');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const next = await fetchNearcadeDiscover({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        radiusKm,
      });
      setShops(next);
      setErrorKind(null);
    } catch (error) {
      setShops(null);
      const message = error instanceof Error ? error.message : String(error);
      setErrorKind(message.includes('discover') || message.includes('HTTP') || message.includes('Network')
        ? 'network'
        : 'location');
    } finally {
      setIsLoading(false);
    }
  }, [radiusKm]);

  useEffect(() => {
    if (!hydrated || activeGameId !== 'maimai') return;
    void loadShops();
  }, [activeGameId, hydrated, loadShops]);

  const filtered = useMemo(() => {
    if (!shops) return [];
    return filterArcadeShops(shops, { keyword: debouncedKeyword, titleIds });
  }, [debouncedKeyword, shops, titleIds]);

  const toggleTitleId = (titleId: number) => {
    setTitleIds((current) => (
      current.includes(titleId)
        ? current.filter((id) => id !== titleId)
        : [...current, titleId]
    ));
  };

  const filterSummary = useMemo(() => {
    const radiusLabel = `${radiusKm} km`;
    const selectedNames = gameTitles
      .filter((title) => titleIds.includes(title.id))
      .map((title) => title.name);
    const gamesLabel = selectedNames.length === 0
      ? '未选机型'
      : selectedNames.length <= 2
        ? selectedNames.join('、')
        : `${selectedNames.slice(0, 2).join('、')} 等${selectedNames.length}种`;
    return `${radiusLabel} · ${gamesLabel}`;
  }, [gameTitles, radiusKm, titleIds]);

  const renderItem = useCallback<ListRenderItem<ArcadeShop>>(({ item }) => (
    <ArcadeShopCard shop={item} onNavigate={(shop) => { void openArcadeNavigation(shop); }} />
  ), []);

  if (activeGameId !== 'maimai') {
    return (
      <>
        <Stack.Screen options={{ title: '机厅查找' }} />
        <EmptyDataView title="仅舞萌可用" detail="机厅查找目前挂在舞萌 DX 工具箱。" />
      </>
    );
  }

  const errorText = errorKind === 'permission'
    ? '需要定位权限才能查找附近机厅'
    : errorKind === 'location'
      ? '定位失败，请稍后重试'
      : errorKind === 'network'
        ? '机厅数据加载失败，请检查网络后重试'
        : null;

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: '机厅查找' }} />
      <View style={styles.header}>
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          placeholder="搜索机厅名字"
          placeholderTextColor={theme.textMuted}
          style={[
            styles.search,
            {
              backgroundColor: theme.input,
              borderColor: theme.border,
              color: theme.text,
            },
          ]}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={filtersCollapsed ? '展开筛选' : '收起筛选'}
          onPress={() => setFiltersCollapsed((value) => !value)}
          style={[styles.filterToggle, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Text style={[styles.filterToggleText, { color: theme.textSecondary }]} numberOfLines={1}>
            {filtersCollapsed ? `筛选 · ${filterSummary}` : '收起筛选'}
          </Text>
        </Pressable>
        {!filtersCollapsed ? (
          <View style={[styles.filterPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.filterLabel, { color: theme.textMuted }]}>距离</Text>
            <View style={styles.chipRow}>
              {ARCADE_RADIUS_OPTIONS.map((radius) => (
                <Chip
                  key={radius}
                  label={`${radius} km`}
                  active={radiusKm === radius}
                  onPress={() => setRadiusKm(radius)}
                />
              ))}
            </View>
            <Text style={[styles.filterLabel, { color: theme.textMuted }]}>游戏机类型</Text>
            <View style={styles.chipRow}>
              {gameTitles.map((title) => (
                <Chip
                  key={title.id}
                  label={title.name}
                  active={titleIds.includes(title.id)}
                  onPress={() => toggleTitleId(title.id)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {isLoading && !shops ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.statusText, { color: theme.textMuted }]}>正在定位并加载附近机厅…</Text>
        </View>
      ) : errorText ? (
        <View style={styles.center}>
          <Text style={[styles.statusText, { color: theme.textMuted }]}>{errorText}</Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: theme.accent }]}
            onPress={() => { void loadShops(); }}
          >
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={(
            <View style={styles.centerInline}>
              <Text style={[styles.statusText, { color: theme.textMuted }]}>
                {shops && shops.length > 0 ? '没有符合筛选条件的机厅' : '附近暂无机厅'}
              </Text>
            </View>
          )}
          ListHeaderComponent={isLoading ? (
            <View style={styles.refreshRow}>
              <ActivityIndicator color={theme.accent} size="small" />
              <Text style={[styles.refreshText, { color: theme.textMuted }]}>刷新中…</Text>
            </View>
          ) : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  search: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  filterToggle: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  filterToggleText: { fontSize: 14, fontWeight: '600' },
  filterPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  filterLabel: { fontSize: 12, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  listContent: { padding: 16, gap: 12, paddingBottom: 32 },
  shopCard: { gap: 8 },
  shopHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  shopName: { flex: 1, fontSize: 17, fontWeight: '700' },
  shopDistance: { fontSize: 14, fontWeight: '700' },
  shopAddress: { fontSize: 13, lineHeight: 18 },
  shopGames: { fontSize: 13, lineHeight: 18 },
  navButton: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 4,
  },
  navButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centerInline: { paddingVertical: 48, alignItems: 'center' },
  statusText: { fontSize: 14, textAlign: 'center' },
  retryButton: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  refreshRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  refreshText: { fontSize: 12 },
});
