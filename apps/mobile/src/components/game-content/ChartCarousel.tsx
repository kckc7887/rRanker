import { Fragment, type ComponentRef, type ReactNode, useEffect, useState, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import {
  GestureHandlerRootView,
  ScrollView as GestureScrollView,
} from 'react-native-gesture-handler';

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
  renderItem: (item: TItem) => ReactNode;
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
  const [index, setIndex] = useState(() => clampCarouselIndex(initialIndex, items.length));
  const virtualize = items.length > 24;
  const windowRadius = 2;
  const syncKey = `${resetKey ?? ''}|${initialIndex}|${interval}`;
  const syncRef = useRef(syncKey);
  let windowIndex = clampCarouselIndex(index, items.length);
  if (syncRef.current !== syncKey) {
    syncRef.current = syncKey;
    windowIndex = clampCarouselIndex(initialIndex, items.length);
  }
  if (windowIndex !== index) setIndex(windowIndex);
  useEffect(() => {
    const next = clampCarouselIndex(initialIndex, items.length);
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: next * interval, animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, [initialIndex, interval, items.length, resetKey]);
  useEffect(() => {
    const next = clampCarouselIndex(index, items.length);
    if (next === index) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: next * interval, animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, [index, items.length, interval]);

  if (items.length === 0) return empty;

  return (
    <GestureHandlerRootView style={rootStyle}>
      <GestureScrollView
        accessibilityLabel={accessibilityLabel}
        contentContainerStyle={contentContainerStyle}
        contentOffset={{ x: clampCarouselIndex(initialIndex, items.length) * interval, y: 0 }}
        decelerationRate="fast"
        disableIntervalMomentum
        directionalLockEnabled
        horizontal
        nestedScrollEnabled
        onMomentumScrollEnd={(event) => {
          const nextIndex = indexFromOffset(event.nativeEvent.contentOffset.x, interval, items.length);
          onIndexChange?.(nextIndex);
          setIndex((current) => (current === nextIndex ? current : nextIndex));
        }}
        onScroll={(event) => {
          const nextIndex = indexFromOffset(event.nativeEvent.contentOffset.x, interval, items.length);
          setIndex((current) => (current === nextIndex ? current : nextIndex));
        }}
        onScrollEndDrag={(event) => {
          const nextIndex = indexFromOffset(event.nativeEvent.contentOffset.x, interval, items.length);
          onIndexChange?.(nextIndex);
          setIndex((current) => (current === nextIndex ? current : nextIndex));
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
          const visible = !virtualize || Math.abs(itemIndex - windowIndex) <= windowRadius;
          return (
            <Fragment key={keyExtractor(item)}>
              {visible ? renderItem(item) : <View style={{ width: cardWidth }} />}
            </Fragment>
          );
        })}
      </GestureScrollView>
    </GestureHandlerRootView>
  );
}
