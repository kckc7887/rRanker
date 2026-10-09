import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Image, type ImageProps } from 'expo-image';
import { scheduleIdleTask } from '@/state/app-lifecycle';
import {
  acquireRemoteImageOriginal,
  cacheCompressedRemoteImage,
  findCompressedRemoteImage,
  invalidateCompressedRemoteImage,
  normalizeRemoteImageSource,
  supportsCompressedRemoteImageCache,
  type CompressedRemoteImageResult,
  type RemoteImageCacheProfile,
  type RemoteImageOriginal,
} from '@/services/remote-image-cache';

export type RemoteImageCacheMode = RemoteImageCacheProfile | 'native' | 'none';

export type RemoteImageProps = Omit<ImageProps, 'cachePolicy'> & (
  | { cacheProfile: RemoteImageCacheProfile; gameId: string }
  | { cacheProfile?: 'native' | 'none'; gameId?: never }
);

const supportsCompressedCache = supportsCompressedRemoteImageCache();
const RemoteImagePersistenceContext = createContext(true);
const RemoteImageActivityContext = createContext(true);

export function RemoteImageActivityScope({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const parentActive = useContext(RemoteImageActivityContext);
  return (
    <RemoteImageActivityContext.Provider value={parentActive && active}>
      {children}
    </RemoteImageActivityContext.Provider>
  );
}

export function RemoteImagePersistenceScope({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  return (
    <RemoteImagePersistenceContext.Provider value={enabled}>
      {children}
    </RemoteImagePersistenceContext.Provider>
  );
}

export function RemoteImage({
  cacheProfile,
  gameId,
  onDisplay,
  onError,
  source,
  ...props
}: RemoteImageProps) {
  const mode = cacheProfile ?? 'native';
  const tabActive = useContext(RemoteImageActivityContext);
  const persistenceEnabled = useContext(RemoteImagePersistenceContext);
  const active = tabActive;
  const normalized = useMemo(() => normalizeRemoteImageSource(source), [source]);
  const requestKey = normalized && gameId && (mode === 'thumbnail' || mode === 'artwork')
    ? `${gameId}|${mode}|${normalized.stableIdentity}`
    : null;
  const sourceIdentity = normalized?.stableIdentity ?? null;
  const requestSource = useMemo(() => {
    if (sourceIdentity === null) return null;
    if (!sourceIdentity.startsWith('{')) return sourceIdentity;
    return JSON.parse(sourceIdentity) as { uri: string; cacheKey?: string; headers?: Record<string, string> };
  }, [sourceIdentity]);
  const releaseRef = useRef<(() => void) | undefined>(undefined);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const activeRequestKeyRef = useRef<string | null>(null);
  const [resolved, setResolved] = useState<CompressedRemoteImageResult | null>(null);
  const [phase, setPhase] = useState<'checking' | 'cached' | 'remote' | 'cached-fallback' | 'failed'>('checking');
  const [remoteDisplayed, setRemoteDisplayed] = useState(false);
  const [originalRequestKey, setOriginalRequestKey] = useState<string | null>(null);
  const [original, setOriginal] = useState<RemoteImageOriginal | null>(null);

  useEffect(() => {
    if (!requestKey || (mode !== 'thumbnail' && mode !== 'artwork')) return undefined;
    activeRequestKeyRef.current = requestKey;
    releaseRef.current?.();
    releaseRef.current = undefined;
    setResolved(null);
    setPhase('checking');
    setRemoteDisplayed(false);
    setOriginalRequestKey(null);
    setOriginal(null);
    let cancelled = false;
    void findCompressedRemoteImage(requestSource, { gameId: gameId!, profile: mode })
      .then((result) => {
        if (cancelled) {
          result?.release?.();
          return;
        }
        if (!result) {
          setOriginalRequestKey(requestKey);
          setPhase('remote');
          return;
        }
        releaseRef.current = result.release;
        setResolved(result);
        setPhase('cached');
      })
      .catch(() => {
        if (!cancelled) {
          setOriginalRequestKey(requestKey);
          setPhase('remote');
        }
      });
    return () => {
      cancelled = true;
      activeRequestKeyRef.current = null;
      releaseRef.current?.();
      releaseRef.current = undefined;
    };
  }, [gameId, mode, requestKey, requestSource]);

  useEffect(() => {
    if (!supportsCompressedCache || !requestKey || originalRequestKey !== requestKey) return;
    const controller = new AbortController();
    let acquired: RemoteImageOriginal | null = null;
    void acquireRemoteImageOriginal(requestSource, gameId!, controller.signal).then(result => {
      if (controller.signal.aborted) { void result.release().catch(() => undefined); return; }
      acquired = result;
      setOriginal(result);
    }).catch(error => {
      if (controller.signal.aborted) return;
      setPhase('failed');
      onErrorRef.current?.({ error: error instanceof Error ? error.message : String(error) });
    });
    return () => {
      controller.abort();
      void acquired?.release().catch(() => undefined);
    };
  }, [gameId, originalRequestKey, requestKey, requestSource]);

  useEffect(() => {
    if (!requestKey
      || (mode !== 'thumbnail' && mode !== 'artwork')
      || !active
      || !persistenceEnabled
      || !remoteDisplayed
      || resolved) return undefined;
    const controller = new AbortController();
    const cancelTask = scheduleIdleTask(() => {
      if (controller.signal.aborted) return;
      void cacheCompressedRemoteImage(requestSource, { gameId: gameId!, profile: mode }, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) { result?.release?.(); return; }
          if (!result) return;
          releaseRef.current = result.release;
          setResolved(result);
        })
        .catch(() => undefined);
    });
    return () => { cancelTask(); controller.abort(); };
  }, [active, gameId, mode, persistenceEnabled, remoteDisplayed, requestKey, resolved, requestSource]);

  if (!supportsCompressedCache && (mode === 'thumbnail' || mode === 'artwork')) {
    return <Image {...props} cachePolicy="memory" onDisplay={onDisplay} onError={onError} source={source} />;
  }

  if (mode === 'none' || mode === 'native' || !requestKey) {
    return (
      <Image
        {...props}
        cachePolicy={mode === 'none' ? 'none' : 'memory-disk'}
        onDisplay={onDisplay}
        onError={onError}
        source={source}
      />
    );
  }

  const requestReady = activeRequestKeyRef.current === requestKey;
  const showingRemote = phase === 'remote';
  const showingCached = phase === 'cached' || phase === 'cached-fallback';
  return (
    <Image
      {...props}
      cachePolicy={showingRemote ? 'memory' : 'none'}
      onDisplay={() => {
        if (phase === 'cached') {
          setPhase('remote');
          return;
        }
        if (phase === 'remote') {
          setRemoteDisplayed(true);
          onDisplay?.();
        }
      }}
      onError={(event) => {
        if (showingCached && resolved) {
          void invalidateCompressedRemoteImage(resolved.cacheKey);
          releaseRef.current?.();
          releaseRef.current = undefined;
          setResolved(null);
          if (phase === 'cached') {
            setOriginalRequestKey(requestKey);
            setPhase('remote');
          }
          else onError?.(event);
          return;
        }
        if (showingRemote && resolved) {
          setPhase('cached-fallback');
          return;
        }
        onError?.(event);
      }}
      source={!requestReady || phase === 'checking' || phase === 'failed'
        ? null
        : showingCached
          ? resolved?.source ?? null
          : originalRequestKey === requestKey
            ? original ? { ...normalized?.source, uri: original.fileUri } : null
            : source}
    />
  );
}
