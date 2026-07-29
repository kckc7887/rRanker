import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useCachedTabActive } from '@/components/CachedTabScreen';

export function useFlowingProgress(enabled: boolean, duration: number): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current;
  const tabActive = useCachedTabActive();
  useEffect(() => {
    progress.setValue(0);
    if (!enabled || !tabActive) return;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [duration, enabled, progress, tabActive]);
  return progress;
}
