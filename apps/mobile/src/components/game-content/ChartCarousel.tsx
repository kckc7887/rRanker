import { Fragment, type ComponentRef, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import {
  GestureHandlerRootView,
  ScrollView as GestureScrollView,
} from 'react-native-gesture-handler';
import { CachedContentActivityScope } from '@/components/CachedTabScreen';
import { RemoteImageActivityScope } from '@/components/RemoteImage';

export type ChartCarouselItemState = {
  active: boolean;
  tagEditor: {
    draft: string;
    onDraftChange: (draft: string) => void;
    onBusyChange: (busy: boolean) => void;
  };
  onDownloadRunningChange: (running: boolean) => void;
};

function clampCarouselIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  const rounded = Number.isFinite(index) ? Math.round(index) : 0;
  return Math.min(length - 1, Math.max(0, rounded));
}

function indexFromOffset(offset: number, interval: number, length: number): number {
  if (!(interval > 0) || !Number.isFinite(offset)) return 0;
  return clampCarouselIndex(offset / interval, length);
}

type ChartCarouselProps<TItem> = {
  items: readonly TItem[];
  cardWidth: number;
  gap: number;
  initialIndex: number;
  empty: ReactNode;
  accessibilityLabel: string;
  rootStyle: StyleProp<ViewStyle>;
  scrollStyle: StyleProp<ViewStyle>;
  contentContainerStyle: StyleProp<ViewStyle>;
  keyExtractor: (item: TItem) => string;
  renderItem: (item: TItem, state: ChartCarouselItemState) => ReactNode;
  onIndexChange?: (index: number) => void;
  resetKey?: string | number;
  testID?: string;
};

export function ChartCarousel<TItem>({
  items,
  cardWidth,
  gap,
  initialIndex,
  empty,
  accessibilityLabel,
  rootStyle,
  scrollStyle,
  contentContainerStyle,
  keyExtractor,
  renderItem,
  onIndexChange,
  resetKey,
  testID,
}: ChartCarouselProps<TItem>) {
  const interval = cardWidth + gap;
  const scrollRef = useRef<ComponentRef<typeof GestureScrollView>>(null);
  const [selection, setSelection] = useState(() => {
    const index = clampCarouselIndex(initialIndex, items.length);
    return { index, initialIndex, resetKey, interval, length: items.length, contentOffset: { x: index * interval, y: 0 } };
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [tagEditorKeys, setTagEditorKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [downloadKeys, setDownloadKeys] = useState<ReadonlySet<string>>(() => new Set());
  const retainedKeys = new Set([...tagEditorKeys, ...downloadKeys]);
  const retain = (current: ReadonlySet<string>, key: string, busy: boolean) => {
    if (current.has(key) === busy) return current;
    const next = new Set(current);
    if (busy) next.add(key);
    else next.delete(key);
    return next;
  };
  let currentSelection = selection;
  if (selection.initialIndex !== initialIndex || selection.resetKey !== resetKey
    || selection.interval !== interval || selection.length !== items.length) {
    const reset = selection.initialIndex !== initialIndex || selection.resetKey !== resetKey
      || (selection.length === 0 && items.length > 0);
    const index = clampCarouselIndex(reset ? initialIndex : selection.index, items.length);
    const reposition = reset || selection.interval !== interval || index !== selection.index;
    currentSelection = { index, initialIndex, resetKey, interval, length: items.length,
      contentOffset: reposition ? { x: index * interval, y: 0 } : selection.contentOffset };
    setSelection(currentSelection);
  }
  const windowIndex = currentSelection.index;
  const setIndex = (index: number) => setSelection((current) => current.index === index ? current : { ...current, index });
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ x: currentSelection.contentOffset.x, animated: false });
  }, [currentSelection.contentOffset]);

  if (items.length === 0) return empty;

  return (
    <GestureHandlerRootView style={rootStyle}>
      <GestureScrollView
        accessibilityLabel={accessibilityLabel}
        contentContainerStyle={contentContainerStyle}
        contentOffset={currentSelection.contentOffset}
        decelerationRate="fast"
        disableIntervalMomentum
        directionalLockEnabled
        horizontal
        nestedScrollEnabled
        onMomentumScrollEnd={(event) => {
          const nextIndex = indexFromOffset(event.nativeEvent.contentOffset.x, interval, items.length);
          onIndexChange?.(nextIndex);
          setIndex(nextIndex);
        }}
        onScroll={(event) => {
          const nextIndex = indexFromOffset(event.nativeEvent.contentOffset.x, interval, items.length);
          if (nextIndex !== windowIndex) onIndexChange?.(nextIndex);
          setIndex(nextIndex);
        }}
        onScrollEndDrag={(event) => {
          const nextIndex = indexFromOffset(event.nativeEvent.contentOffset.x, interval, items.length);
          onIndexChange?.(nextIndex);
          setIndex(nextIndex);
        }}
        ref={scrollRef}
        removeClippedSubviews={false}
        showsHorizontalScrollIndicator={false}
        snapToAlignment="start"
        snapToInterval={interval}
        style={scrollStyle}
        testID={testID}
      >
        {items.map((item, itemIndex) => {
          const key = keyExtractor(item);
          const visible = Math.abs(itemIndex - windowIndex) <= 1 || retainedKeys.has(key);
          const active = itemIndex === windowIndex;
          return (
            <Fragment key={key}>
              {visible ? <CachedContentActivityScope active={active}>
                <RemoteImageActivityScope active={active}>
                  {renderItem(item, {
                    active,
                    tagEditor: {
                      draft: drafts[key] ?? '',
                      onDraftChange: (draft) => setDrafts((current) => ({ ...current, [key]: draft })),
                      onBusyChange: (busy) => setTagEditorKeys((current) => retain(current, key, busy)),
                    },
                    onDownloadRunningChange: (running) => setDownloadKeys((current) => retain(current, key, running)),
                  })}
                </RemoteImageActivityScope>
              </CachedContentActivityScope> : <View style={{ width: cardWidth }} />}
            </Fragment>
          );
        })}
      </GestureScrollView>
    </GestureHandlerRootView>
  );
}
