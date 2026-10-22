import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { captureResourceWrites, resourceWriteGeneration, subscribeResourceWrites } from '@/services/snapshot-cache-utils';
import { providerErrorToUserMessage } from '@/providers/errors';
import { retryBestImagePreparation, type BestImageAssetSession } from './load-best-image-session';

export function useBestImageAssets<T>({ session, key, prepare }: {
  session: BestImageAssetSession;
  key: string | null;
  prepare: (signal: AbortSignal) => Promise<T>;
}) {
  const lifecycle = useAppLifecycle();
  const generation = useSyncExternalStore(
    useCallback((notify) => subscribeResourceWrites(session.game, notify), [session.game]),
    useCallback(() => resourceWriteGeneration(session.game), [session.game]),
  );
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    session: BestImageAssetSession; key: string; generation: number; attempt: number;
    data: T | null; ready: boolean; error: string | null;
  } | null>(null);
  const current = result?.session === session && result.key === key
    && result.generation === generation && result.attempt === attempt ? result : null;
  const ready = current?.ready ?? false;

  useEffect(() => {
    if (!lifecycle.foregroundReady || key === null || ready || session.disposed) return;
    const controller = new AbortController();
    const assertCurrent = captureResourceWrites(session.game, controller.signal);
    const load = prepareRef.current;
    const identity = { session, key, generation, attempt };
    setResult({ ...identity, data: null, ready: false, error: null });
    void retryBestImagePreparation(session, controller.signal, async () => {
      const data = await load(controller.signal);
      assertCurrent();
      return data;
    }, (error) => {
      if (!controller.signal.aborted) setResult({ ...identity, data: null, ready: false,
        error: providerErrorToUserMessage(error, '素材准备失败，正在自动重试。') });
    }).then((data) => {
      if (!controller.signal.aborted && !session.disposed) setResult({ ...identity, data, ready: true, error: null });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [session, key, generation, attempt, ready, lifecycle.foregroundReady, lifecycle.foregroundGeneration]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { data: current?.data ?? null, ready, error: current?.error ?? null, retry };
}
