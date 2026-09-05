import { useEffect, useMemo } from 'react';
import { beginNavigationTransition } from '@/state/idle-tasks';

export function useNavigationTransitionListeners() {
  const pending = useMemo(() => new Map<string, () => void>(), []);
  useEffect(() => () => {
    for (const finish of pending.values()) finish();
    pending.clear();
  }, [pending]);
  return useMemo(() => ({
    transitionStart(event: { target?: string }) {
      if (!event.target || pending.has(event.target)) return;
      pending.set(event.target, beginNavigationTransition());
    },
    transitionEnd(event: { target?: string }) {
      if (!event.target) return;
      pending.get(event.target)?.();
      pending.delete(event.target);
    },
  }), [pending]);
}
