import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useCachedTabActive } from '@rranker/sdk/components/CachedTabScreen';
import { useAppLifecycle } from '@rranker/sdk/state/app-lifecycle';
import { useReducedMotion } from '@rranker/sdk/hooks/use-reduced-motion';

export function useFlowingProgress(enabled: boolean, duration: number): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current;
  const tabActive = useCachedTabActive();
  const { foregroundReady } = useAppLifecycle();
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    progress.setValue(0);
    if (!enabled || !tabActive || !foregroundReady || reduceMotion) return;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.linear,
      isInteraction: false,
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [duration, enabled, foregroundReady, progress, reduceMotion, tabActive]);
  return progress;
}
