import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

let reducedMotion = false;
let generation = 0;
let subscription: ReturnType<typeof AccessibilityInfo.addEventListener> | undefined;
const listeners = new Set<() => void>();
const snapshot = () => reducedMotion;

function publish(value: boolean) {
  if (value === reducedMotion) return;
  reducedMotion = value;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    const current = ++generation;
    let changed = false;
    subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      publish(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (current === generation && !changed) publish(value);
    }).catch(() => undefined);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      generation++;
      subscription?.remove();
      subscription = undefined;
    }
  };
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
