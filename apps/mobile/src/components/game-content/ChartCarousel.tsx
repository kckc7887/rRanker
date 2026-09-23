import { Fragment, type ComponentRef, type ReactNode, useEffect, useState, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import {
  GestureHandlerRootView,
  ScrollView as GestureScrollView,
} from 'react-native-gesture-handler';

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
  const [index, setIndex] = useState(initialIndex);
  const virtualize = items.length > 24;
  const windowRadius = 2;
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * interval, animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, [initialIndex, interval, resetKey]);

  if (items.length === 0) return empty;

  return (
    <GestureHandlerRootView style={rootStyle}>
      <GestureScrollView
        accessibilityLabel={accessibilityLabel}
        contentContainerStyle={contentContainerStyle}
        contentOffset={{ x: initialIndex * interval, y: 0 }}
        decelerationRate="fast"
        disableIntervalMomentum
        directionalLockEnabled
        horizontal
        nestedScrollEnabled
        onMomentumScrollEnd={(event) => {
          const nextIndex = Math.max(
            0,
            Math.min(items.length - 1, Math.round(event.nativeEvent.contentOffset.x / interval)),
          );
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
          const visible = !virtualize || Math.abs(itemIndex - index) <= windowRadius;
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
