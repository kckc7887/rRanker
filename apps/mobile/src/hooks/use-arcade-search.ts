import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArcadeShop } from '@/domain/arcade-shops';
import { searchNearcadeShops } from '@/services/nearcade-client';
import { searchArcadePlaces, type ArcadePlace } from '@/services/arcade-place-search';
import { getForegroundAbortSignal } from '@/state/app-lifecycle';
import { useDebouncedValue } from './use-debounced-value';

type ShopResults = { items: ArcadeShop[]; page: number; hasMore: boolean; loading: boolean; error: string };
type PlaceResults = { items: ArcadePlace[]; loading: boolean; error: string };
const emptyShops: ShopResults = { items: [], page: 0, hasMore: false, loading: false, error: '' };
const emptyPlaces: PlaceResults = { items: [], loading: false, error: '' };

export function useArcadeSearch({ keyword, titleIds, active, generation, placeGeneration }: {
  keyword: string; titleIds: readonly number[]; active: boolean; generation: number; placeGeneration: number;
}) {
  const query = keyword.trim();
  const settled = useDebouncedValue(query, 350);
  const ready = active && query.length > 0 && query === settled;
  const [shops, setShops] = useState<ShopResults>(emptyShops);
  const [places, setPlaces] = useState<PlaceResults>(emptyPlaces);
  const [shopRetry, retryShops] = useState(0);
  const [placeRetry, retryPlaces] = useState(0);
  const shopRequest = useRef<AbortController | null>(null);
  const placeRequest = useRef<AbortController | null>(null);
  const loadingMore = useRef(false);
  const cancel = useCallback(() => { shopRequest.current?.abort(); placeRequest.current?.abort(); }, []);

  useEffect(() => {
    const foreground = getForegroundAbortSignal();
    foreground.addEventListener('abort', cancel, { once: true });
    return () => { foreground.removeEventListener('abort', cancel); cancel(); };
  }, [active, cancel, generation]);

  useEffect(() => {
    setShops(emptyShops);
    loadingMore.current = false;
    if (!ready || getForegroundAbortSignal().aborted) return;
    const controller = new AbortController();
    shopRequest.current = controller;
    setShops({ ...emptyShops, loading: true });
    void searchNearcadeShops({ keyword: query, titleIds, signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setShops({ items: result.shops, page: result.page, hasMore: result.hasNextPage, loading: false, error: '' });
    }, () => {
      if (!controller.signal.aborted) setShops({ ...emptyShops, error: '机厅搜索失败，请重试' });
    });
    return () => controller.abort();
  }, [generation, query, ready, shopRetry, titleIds]);

  useEffect(() => {
    setPlaces(emptyPlaces);
    if (!ready || getForegroundAbortSignal().aborted) return;
    const controller = new AbortController();
    placeRequest.current = controller;
    setPlaces({ ...emptyPlaces, loading: true });
    void searchArcadePlaces(query, controller.signal).then(items => {
      if (!controller.signal.aborted) setPlaces({ items, loading: false, error: '' });
    }, error => {
      if (!controller.signal.aborted) setPlaces({ ...emptyPlaces, error: error instanceof Error ? error.message : '地点搜索失败，请重试' });
    });
    return () => controller.abort();
  }, [generation, placeGeneration, placeRetry, query, ready]);

  const loadMore = async () => {
    const controller = shopRequest.current;
    if (!ready || !controller || controller.signal.aborted || shops.loading || loadingMore.current || !shops.hasMore) return;
    loadingMore.current = true;
    setShops(previous => ({ ...previous, loading: true, error: '' }));
    try {
      const result = await searchNearcadeShops({ keyword: query, page: shops.page + 1, titleIds, signal: controller.signal });
      if (controller.signal.aborted) return;
      setShops(previous => ({
        items: [...previous.items, ...result.shops.filter(shop => !previous.items.some(item => item.id === shop.id))],
        page: result.page, hasMore: result.hasNextPage, loading: false, error: '',
      }));
    } catch {
      if (!controller.signal.aborted) setShops(previous => ({ ...previous, loading: false, error: '加载更多机厅失败，请重试' }));
    } finally {
      if (!controller.signal.aborted) loadingMore.current = false;
    }
  };

  return {
    shops: ready ? shops : { ...emptyShops, loading: Boolean(query) },
    places: ready ? places : { ...emptyPlaces, loading: Boolean(query) },
    cancel, loadMore,
    retryShops: () => { if (shops.page) void loadMore(); else retryShops(value => value + 1); },
    retryPlaces: () => retryPlaces(value => value + 1),
  };
}
