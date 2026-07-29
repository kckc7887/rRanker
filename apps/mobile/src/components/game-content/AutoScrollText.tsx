import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text } from 'react-native';

export function AutoScrollText({
  text,
  textStyle,
  style,
  contentContainerStyle,
  testID,
}: {
  text: string;
  textStyle: object;
  style?: object;
  contentContainerStyle?: object;
  testID?: string;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const offsetRef = useRef(0);
  const directionRef = useRef(1);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    offsetRef.current = 0;
    directionRef.current = 1;
    setScrolling(false);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [text]);

  useEffect(() => {
    if (contentWidth <= 0 || containerWidth <= 0) return;
    const overflow = contentWidth - containerWidth;
    setScrolling((current) => {
      if (current) return overflow > 2;
      return overflow > 8;
    });
  }, [contentWidth, containerWidth]);

  useEffect(() => {
    if (!scrolling || dragging) {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      return;
    }
    const maxOffset = Math.max(0, contentWidth - containerWidth);
    const tick = () => {
      const next = offsetRef.current + directionRef.current * 0.45;
      if (next >= maxOffset) directionRef.current = -1;
      else if (next <= 0) directionRef.current = 1;
      offsetRef.current = Math.max(0, Math.min(next, maxOffset));
      scrollRef.current?.scrollTo({ x: offsetRef.current, animated: false });
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [scrolling, dragging, contentWidth, containerWidth]);

  return (
    <ScrollView
      contentContainerStyle={contentContainerStyle}
      horizontal
      onContentSizeChange={(width) => setContentWidth(width)}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
      onScrollBeginDrag={() => setDragging(true)}
      onScrollEndDrag={(event) => {
        offsetRef.current = event.nativeEvent.contentOffset.x;
        setDragging(false);
        directionRef.current = 1;
      }}
      ref={scrollRef}
      scrollEnabled={scrolling}
      scrollEventThrottle={32}
      showsHorizontalScrollIndicator={false}
      style={style}
      testID={testID}
    >
      <Text numberOfLines={1} style={textStyle}>{text}</Text>
    </ScrollView>
  );
}
