import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { useCachedTabActive } from '@/components/CachedTabScreen';

export function useFlowingProgress(enabled: boolean, duration: number): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current;
  const tabActive = useCachedTabActive();
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduceMotion(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    progress.setValue(0);
    if (!enabled || !tabActive || reduceMotion) return;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.linear,
      isInteraction: false,
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [duration, enabled, progress, reduceMotion, tabActive]);
  return progress;
}
