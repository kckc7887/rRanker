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
import { router, Stack, type Href } from 'expo-router';
import * as Location from 'expo-location';
import { useNotification } from '@/components/AppNotification';
import { ArcadeBusinessStatusLabel } from '@/components/ArcadeBusinessStatusLabel';
import { ArcadeFilterBar } from '@/components/ArcadeFilterBar';
import { ArcadeOriginPickerSheet } from '@/components/ArcadeOriginPickerSheet';
import { Card } from '@/components/Card';
import {
  FALLBACK_ARCADE_GAME_TITLES,
  formatArcadeAddress,
  formatArcadeDistanceKm,
  formatArcadeGamesSummary,
  formatArcadeGeocodedLabel,
  filterArcadeShops,
  type ArcadeGameTitle,
  type ArcadeOrigin,
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

async function acquireGpsOrigin(): Promise<ArcadeOrigin> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('permission');
  }
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  let label = '当前位置';
  try {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (places[0]) {
      label = formatArcadeGeocodedLabel(places[0]) || label;
    }
  } catch {
    // Keep the generic GPS label when reverse geocode is unavailable.
  }
  return { source: 'gps', latitude, longitude, label };
}

function ArcadeShopCard({
  shop,
  onNavigate,
  onOpenDetail,
}: {
  shop: ArcadeShop;
  onNavigate: (shop: ArcadeShop) => void;
  onOpenDetail: (shop: ArcadeShop) => void;
}) {
  const theme = useAppTheme();
  return (
    <Card style={styles.shopCard}>
      <View style={styles.shopHeader}>
        <View style={styles.shopTitleBlock}>
          <Text style={[styles.shopName, { color: theme.text }]} numberOfLines={2}>
            {shop.name}
          </Text>
          <ArcadeBusinessStatusLabel openingHours={shop.openingHours} />
        </View>
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
      <View style={styles.actionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`查看${shop.name}详情`}
          onPress={() => onOpenDetail(shop)}
          style={[styles.secondaryButton, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>详情</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`导航到${shop.name}`}
          onPress={() => onNavigate(shop)}
          style={[styles.navButton, { backgroundColor: theme.accent }]}
        >
          <Text style={styles.navButtonText}>导航</Text>
        </Pressable>
      </View>
    </Card>
  );
}

export default function ArcadeFinderScreen() {
  const theme = useAppTheme();
  const { showActionNotification, showNotification } = useNotification();
  const activeGameId = useSession((s) => s.activeGameId);
  const [hydrated, setHydrated] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [radiusKm, setRadiusKm] = useState<ArcadeRadiusKm>(10);
  const [titleIds, setTitleIds] = useState<number[]>([]);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [origin, setOrigin] = useState<ArcadeOrigin | null>(null);
  const [originPickerVisible, setOriginPickerVisible] = useState(false);
  const [locatingOrigin, setLocatingOrigin] = useState(false);
  const [gameTitles, setGameTitles] = useState<readonly ArcadeGameTitle[]>(FALLBACK_ARCADE_GAME_TITLES);
  const [shops, setShops] = useState<ArcadeShop[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorKind, setErrorKind] = useState<LoadErrorKind>(null);
  const debouncedKeyword = useDebouncedValue(keyword);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    void (async () => {
      const prefs = await arcadeFinderPreferencesStore.load(activeGameId);
      if (cancelled) return;
      setRadiusKm(prefs.radiusKm);
      setTitleIds(prefs.titleIds);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeGameId]);

  useEffect(() => {
    if (!hydrated) return;
    void arcadeFinderPreferencesStore.save(activeGameId, { radiusKm, titleIds });
  }, [activeGameId, hydrated, radiusKm, titleIds]);

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

  const useGpsOrigin = useCallback(async () => {
    setLocatingOrigin(true);
    setErrorKind(null);
    try {
      const next = await acquireGpsOrigin();
      setOrigin(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorKind(message === 'permission' ? 'permission' : 'location');
      if (!origin) setShops(null);
    } finally {
      setLocatingOrigin(false);
    }
  }, [origin]);

  useEffect(() => {
    if (!hydrated || origin) return;
    void useGpsOrigin();
  }, [hydrated, origin, useGpsOrigin]);

  useEffect(() => {
    if (!hydrated || !origin) return;
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      setErrorKind(null);
      try {
        const next = await fetchNearcadeDiscover({
          latitude: origin.latitude,
          longitude: origin.longitude,
          radiusKm,
        });
        if (cancelled) return;
        setShops(next);
        setErrorKind(null);
      } catch {
        if (cancelled) return;
        setShops(null);
        setErrorKind('network');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, origin, radiusKm]);

  const filtered = useMemo(() => {
    if (!shops) return [];
    return filterArcadeShops(shops, { keyword: debouncedKeyword, titleIds });
  }, [debouncedKeyword, shops, titleIds]);

  const resetFilters = () => {
    const defaults = defaultArcadeFinderPreferences(activeGameId);
    setRadiusKm(defaults.radiusKm);
    setTitleIds(defaults.titleIds);
    void useGpsOrigin();
  };

  const retryLoad = () => {
    if (origin && errorKind === 'network') {
      setOrigin({ ...origin });
      return;
    }
    void useGpsOrigin();
  };

  const openDetail = useCallback((shop: ArcadeShop) => {
    router.push(`/tools/arcade-finder/${shop.id}` as Href);
  }, []);

  const openNavigation = useCallback((shop: ArcadeShop) => {
    openArcadeNavigation(shop, { showActionNotification, showNotification });
  }, [showActionNotification, showNotification]);

  const renderItem = useCallback<ListRenderItem<ArcadeShop>>(({ item }) => (
    <ArcadeShopCard
      shop={item}
      onNavigate={openNavigation}
      onOpenDetail={openDetail}
    />
  ), [openDetail, openNavigation]);

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
      <View style={[styles.searchArea, { backgroundColor: theme.surface }]}>
        <TextInput
          accessibilityLabel="机厅搜索"
          value={keyword}
          onChangeText={setKeyword}
          placeholder="搜索机厅名字"
          placeholderTextColor={theme.textMuted}
          style={[
            styles.searchBox,
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
      </View>
      <ArcadeFilterBar
        collapsed={filtersCollapsed}
        onCollapsedChange={setFiltersCollapsed}
        origin={origin}
        locatingOrigin={locatingOrigin}
        radiusKm={radiusKm}
        titleIds={titleIds}
        gameTitles={gameTitles}
        onUseGpsOrigin={() => { void useGpsOrigin(); }}
        onEditOrigin={() => setOriginPickerVisible(true)}
        onRadiusChange={setRadiusKm}
        onTitleIdsChange={setTitleIds}
        onReset={resetFilters}
      />

      <View style={styles.resultsArea}>
      {((isLoading || locatingOrigin) && !shops) ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.statusText, { color: theme.textMuted }]}>
            {locatingOrigin ? '正在定位…' : '正在加载附近机厅…'}
          </Text>
        </View>
      ) : errorText ? (
        <View style={styles.center}>
          <Text style={[styles.statusText, { color: theme.textMuted }]}>{errorText}</Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: theme.accent }]}
            onPress={retryLoad}
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
          ListHeaderComponent={isLoading || locatingOrigin ? (
            <View style={styles.refreshRow}>
              <ActivityIndicator color={theme.accent} size="small" />
              <Text style={[styles.refreshText, { color: theme.textMuted }]}>
                {locatingOrigin ? '定位中…' : '刷新中…'}
              </Text>
            </View>
          ) : null}
        />
      )}
      </View>

      <ArcadeOriginPickerSheet
        visible={originPickerVisible}
        onClose={() => setOriginPickerVisible(false)}
        onSelect={setOrigin}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  searchArea: { padding: 12, paddingBottom: 8 },
  searchBox: { borderWidth: 1, borderRadius: 10, padding: 11, fontSize: 16 },
  resultsArea: { flex: 1, minHeight: 0 },
  listContent: { padding: 16, gap: 12, paddingBottom: 32 },
  shopCard: { gap: 8 },
  shopHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  shopTitleBlock: { flex: 1, minWidth: 0, gap: 4 },
  shopName: { fontSize: 17, fontWeight: '700' },
  shopDistance: { fontSize: 14, fontWeight: '700' },
  shopAddress: { fontSize: 13, lineHeight: 18 },
  shopGames: { fontSize: 13, lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  secondaryButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  navButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
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
