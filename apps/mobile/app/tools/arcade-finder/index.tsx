import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from 'react-native';
import { router, Stack, type Href } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useNotification } from '@/components/AppNotification';
import { ArcadeBusinessStatusLabel } from '@/components/ArcadeBusinessStatusLabel';
import { ArcadeMap } from '@/components/ArcadeMap';
import type { ArcadeMapCamera } from '@/components/ArcadeMap.types';
import { arcadeDistanceKm, type ArcadeCoordinate } from '@/domain/arcade-coordinates';
import { ArcadeFilterBar } from '@/components/ArcadeFilterBar';
import { ArcadeSearchResults } from '@/components/ArcadeSearchResults';
import { Card } from '@/components/Card';
import {
  FALLBACK_ARCADE_GAME_TITLES,
  formatArcadeAddress,
  formatArcadeDistanceKm,
  formatArcadeGamesSummary,
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
import { useArcadeSearch } from '@/hooks/use-arcade-search';
import { fetchNearcadeDiscover, fetchNearcadeGameTitles } from '@/services/nearcade-client';
import { resolveArcadePlace, type ArcadePlace } from '@/services/arcade-place-search';
import { useSession } from '@/state/session-store';
import { getForegroundAbortSignal, useAppLifecycle } from '@/state/app-lifecycle';
import { useAppTheme } from '@/theme/app-theme';
import { acquireArcadeGpsOrigin } from '@/utils/acquire-arcade-gps-origin';
import { openArcadeNavigation } from '@/utils/open-arcade-navigation';

type LoadErrorKind = 'permission' | 'location' | 'network' | null;

function ArcadeShopCard({
  shop,
  onNavigate,
  onOpenDetail,
  selected,
  onSelect,
}: {
  shop: ArcadeShop;
  onNavigate: (shop: ArcadeShop) => void;
  onOpenDetail: (shop: ArcadeShop) => void;
  selected: boolean;
  onSelect: (shop: ArcadeShop) => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable onPress={() => onSelect(shop)}>
    <Card style={{ ...styles.shopCard, ...(selected ? { borderColor: theme.accent, borderWidth: 2 } : {}) }}>
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
          <Text style={[styles.navButtonText, { color: theme.onAccent }]}>导航</Text>
        </Pressable>
      </View>
    </Card>
    </Pressable>
  );
}

export default function ArcadeFinderScreen() {
  const theme = useAppTheme();
  const { showActionNotification, showNotification } = useNotification();
  const activeGameId = useSession((s) => s.activeGameId);
  const focused = useIsFocused();
  const headerHeight = useHeaderHeight();
  const { foregroundReady, foregroundGeneration } = useAppLifecycle();
  const [hydrated, setHydrated] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [radiusKm, setRadiusKm] = useState<ArcadeRadiusKm>(10);
  const [titleIds, setTitleIds] = useState<number[]>([]);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [origin, setOrigin] = useState<ArcadeOrigin | null>(null);
  const [locatingOrigin, setLocatingOrigin] = useState(false);
  const [gameTitles, setGameTitles] = useState<readonly ArcadeGameTitle[]>(FALLBACK_ARCADE_GAME_TITLES);
  const [shops, setShops] = useState<ArcadeShop[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorKind, setErrorKind] = useState<LoadErrorKind>(null);
  const [camera, setCamera] = useState<ArcadeMapCamera>(null);
  const [selectedShop, setSelectedShop] = useState<ArcadeShop | null>(null);
  const selectedShopId = selectedShop?.id ?? null;
  const [placeGeneration, setPlaceGeneration] = useState(0);
  const [selectingPlace, setSelectingPlace] = useState<ArcadePlace | null>(null);
  const [placeError, setPlaceError] = useState('');
  const selectionRequest = useRef<AbortController | null>(null);
  const screenActive = useRef(true);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const searchInput = useRef<TextInput>(null);
  const search = useArcadeSearch({ keyword, titleIds, active: focused && foregroundReady && hydrated,
    generation: foregroundGeneration, placeGeneration });
  const cancelSearch = search.cancel;
  const clearSearch = useCallback(() => {
    cancelSearch();
    selectionRequest.current?.abort();
    setKeyword('');
    setSelectingPlace(null);
    setPlaceError('');
    Keyboard.dismiss();
  }, [cancelSearch]);
  const originIntent = useRef(0);
  const autoLocated = useRef(false);
  const request = useRef<AbortController | null>(null);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const list = useRef<FlatList<ArcadeShop>>(null);
  const cancelPending = useCallback(() => {
    request.current?.abort();
    if (dragTimer.current) clearTimeout(dragTimer.current);
    dragTimer.current = null;
  }, []);
  useEffect(() => {
    const foreground = getForegroundAbortSignal();
    screenActive.current = focused && !foreground.aborted;
    if (!screenActive.current) { setLocatingOrigin(false); setSelectingPlace(null); }
    const cancel = () => { screenActive.current = false; originIntent.current += 1; cancelPending(); selectionRequest.current?.abort(); };
    const background = () => { cancel(); setLocatingOrigin(false); setSelectingPlace(null); };
    foreground.addEventListener('abort', background, { once: true });
    return () => { cancel(); foreground.removeEventListener('abort', background); };
  }, [cancelPending, focused, foregroundGeneration]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const selectOrigin = useCallback((next: ArcadeOrigin, shop: ArcadeShop | null = null, keepZoom = false) => {
    originIntent.current += 1;
    clearSearch();
    cancelPending();
    setLocatingOrigin(false);
    setErrorKind(null);
    setSelectedShop(shop);
    setOrigin(next);
    setCamera(keepZoom ? { center: next } : { center: next, radiusKm: 2 });
  }, [cancelPending, clearSearch]);

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
    const controller = new AbortController();
    void (async () => {
      const titles = await fetchNearcadeGameTitles(controller.signal);
      if (!controller.signal.aborted) setGameTitles(titles);
    })().catch(() => {});
    return () => controller.abort();
  }, []);

  const acquireOriginFromGps = useCallback(async () => {
    const intent = ++originIntent.current;
    clearSearch();
    cancelPending();
    setLocatingOrigin(true);
    setErrorKind(null);
    try {
      const next = await acquireArcadeGpsOrigin();
      if (intent !== originIntent.current) return;
      selectOrigin(next, null, origin !== null);
    } catch (error) {
      if (intent !== originIntent.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setErrorKind(message === 'permission' ? 'permission' : 'location');
      if (!origin) setShops(null);
    } finally {
      if (intent === originIntent.current) setLocatingOrigin(false);
    }
  }, [cancelPending, clearSearch, origin, selectOrigin]);

  useEffect(() => {
    if (!hydrated || !focused || !foregroundReady || autoLocated.current) return;
    autoLocated.current = true;
    void acquireOriginFromGps();
  }, [acquireOriginFromGps, focused, foregroundReady, hydrated]);

  useEffect(() => {
    if (!hydrated || !origin || !focused || !foregroundReady) return;
    const controller = new AbortController();
    request.current = controller;
    const foreground = getForegroundAbortSignal();
    const abort = () => controller.abort();
    foreground.addEventListener('abort', abort, { once: true });
    if (foreground.aborted) abort();
    void (async () => {
      setIsLoading(true);
      setErrorKind(null);
      try {
        const next = await fetchNearcadeDiscover({
          latitude: origin.latitude,
          longitude: origin.longitude,
          radiusKm,
          titleIds,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setShops(next);
        setErrorKind(null);
      } catch {
        if (controller.signal.aborted) return;
        setErrorKind('network');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => {
      controller.abort();
      foreground.removeEventListener('abort', abort);
    };
  }, [focused, foregroundGeneration, foregroundReady, hydrated, origin, radiusKm, titleIds]);

  const filtered = useMemo(() => {
    const items = (shops ?? []).map(shop => origin ? { ...shop, distanceKm: arcadeDistanceKm(origin, shop) } : shop)
      .filter(shop => shop.distanceKm === null || shop.distanceKm <= radiusKm);
    if (selectedShop && origin && !items.some(shop => shop.id === selectedShop.id)) {
      const distanceKm = arcadeDistanceKm(origin, selectedShop);
      if (distanceKm <= radiusKm) items.push({ ...selectedShop, distanceKm });
    }
    return filterArcadeShops(items, { keyword: '', titleIds });
  }, [origin, radiusKm, selectedShop, shops, titleIds]);

  const choosePlace = async (place: ArcadePlace) => {
    originIntent.current += 1;
    clearSearch();
    cancelPending();
    setLocatingOrigin(false);
    setIsLoading(false);
    const controller = new AbortController();
    selectionRequest.current = controller;
    setSelectingPlace(place);
    try {
      const coordinate = await resolveArcadePlace(place, controller.signal);
      if (!controller.signal.aborted) selectOrigin({ ...coordinate, source: 'custom', label: place.name });
    } catch {
      if (!controller.signal.aborted) setPlaceError('地点定位失败，请重试');
    }
  };

  const selectShop = useCallback((shop: ArcadeShop) => {
    originIntent.current += 1;
    if (dragTimer.current) clearTimeout(dragTimer.current);
    dragTimer.current = null;
    setLocatingOrigin(false);
    setSelectedShop(shop);
    setCamera({ center: shop, radiusKm: Math.min(radiusKm, 2) });
    Keyboard.dismiss();
  }, [radiusKm]);

  const moveMap = () => {
    if (!screenActive.current) return;
    originIntent.current += 1;
    clearSearch();
    if (dragTimer.current) clearTimeout(dragTimer.current);
    dragTimer.current = null;
    setLocatingOrigin(false);
    setCamera(null);
  };

  const mapAvailabilityChanged = useCallback(() => {
    if (dragTimer.current) clearTimeout(dragTimer.current);
    dragTimer.current = null;
    setPlaceGeneration(value => value + 1);
  }, []);
  const settleMap = (center: ArcadeCoordinate) => {
    if (!screenActive.current) return;
    if (dragTimer.current) clearTimeout(dragTimer.current);
    dragTimer.current = setTimeout(() => {
      dragTimer.current = null;
      if (origin && arcadeDistanceKm(origin, center) < Math.max(0.3, radiusKm * 0.1)) return;
      request.current?.abort();
      setErrorKind(null);
      setSelectedShop(null);
      setOrigin({ ...center, source: 'custom', label: '地图中心' });
    }, 500);
  };

  const resetFilters = () => {
    const defaults = defaultArcadeFinderPreferences(activeGameId);
    setRadiusKm(defaults.radiusKm);
    setTitleIds(defaults.titleIds);
    void acquireOriginFromGps();
  };

  const retryLoad = () => {
    if (origin && errorKind === 'network') {
      setOrigin({ ...origin });
      return;
    }
    void acquireOriginFromGps();
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
      selected={item.id === selectedShopId}
      onSelect={selectShop}
    />
  ), [openDetail, openNavigation, selectShop, selectedShopId]);

  const errorText = errorKind === 'permission'
    ? '定位未获授权，可拖动地图或设置搜索位置'
    : errorKind === 'location'
      ? '定位失败，可拖动地图或设置搜索位置'
      : errorKind === 'network'
        ? '机厅数据加载失败，请检查网络后重试'
        : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}
      style={[styles.page, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: '音游地图' }} />
      {focused ? <ArcadeMap camera={camera} shops={filtered} selectedShopId={selectedShopId}
        initialCamera={origin ? { center: origin, radiusKm: 2 } : null}
        onAvailabilityChange={mapAvailabilityChanged}
        compact={keyboardVisible} locating={locatingOrigin} onLocate={() => { void acquireOriginFromGps(); }}
        onGestureStart={moveMap} onCenterChange={settleMap}
        onSelectShop={shop => {
          originIntent.current += 1;
          if (dragTimer.current) clearTimeout(dragTimer.current);
          dragTimer.current = null;
          setLocatingOrigin(false);
          clearSearch();
          setSelectedShop(shop);
          const index = filtered.findIndex(item => item.id === shop.id);
          if (index >= 0) list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
        }} /> : null}
      <View style={styles.resultsPanel}>
      <View style={[styles.searchArea, { backgroundColor: theme.surface }]}>
        <TextInput
          ref={searchInput}
          accessibilityLabel="机厅搜索"
          value={keyword}
          onChangeText={value => {
            if (value.trim() !== keyword.trim()) search.cancel();
            selectionRequest.current?.abort();
            setSelectingPlace(null); setPlaceError(''); setKeyword(value);
          }}
          placeholder="搜索机厅或地点"
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
        onUseGpsOrigin={() => { void acquireOriginFromGps(); }}
        onEditOrigin={() => { setFiltersCollapsed(true); searchInput.current?.focus(); }}
        onRadiusChange={value => { cancelPending(); setRadiusKm(value); }}
        onTitleIdsChange={setTitleIds}
        onReset={resetFilters}
      />

      <View style={styles.resultsArea}>
      {keyword.trim() ? <ArcadeSearchResults search={search}
        onSelectShop={shop => selectOrigin({ latitude: shop.latitude, longitude: shop.longitude, source: 'custom', label: shop.name }, shop)}
        onSelectPlace={place => { void choosePlace(place); }} /> : selectingPlace ? (
        <View style={styles.center}>
          {placeError ? <>
            <Text style={[styles.statusText, { color: theme.textMuted }]}>{placeError}</Text>
            <Pressable style={[styles.retryButton, { backgroundColor: theme.accent }]} onPress={() => { void choosePlace(selectingPlace); }}>
              <Text style={[styles.retryText, { color: theme.onAccent }]}>重试地点定位</Text>
            </Pressable>
          </> : <><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.textMuted }}>正在定位{selectingPlace.name}…</Text></>}
        </View>
      ) : ((isLoading || locatingOrigin) && !filtered.length) ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.statusText, { color: theme.textMuted }]}>
            {locatingOrigin ? '正在定位…' : '正在加载附近机厅…'}
          </Text>
        </View>
      ) : errorText && !filtered.length ? (
        <View style={styles.center}>
          <Text style={[styles.statusText, { color: theme.textMuted }]}>{errorText}</Text>
          <Pressable
            style={[styles.retryButton, { backgroundColor: theme.accent }]}
            onPress={retryLoad}
          >
            <Text style={[styles.retryText, { color: theme.onAccent }]}>重试</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={list}
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={({ index, averageItemLength }) => list.current?.scrollToOffset({ offset: index * averageItemLength, animated: true })}
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
          ) : errorKind === 'network' ? <Pressable onPress={retryLoad} style={styles.refreshRow}>
            <Text style={{ color: theme.accent }}>附近机厅加载失败，点击重试</Text>
          </Pressable> : null}
        />
      )}
      </View>
      </View>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  resultsPanel: { flex: 1, minHeight: 180 },
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
