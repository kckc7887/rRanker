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
import {
  cacheCompressedRemoteImage,
  findCompressedRemoteImage,
  invalidateCompressedRemoteImage,
  normalizeRemoteImageSource,
  supportsCompressedRemoteImageCache,
  type CompressedRemoteImageResult,
  type RemoteImageCacheProfile,
} from '@/services/remote-image-cache';

export type RemoteImageCacheMode = RemoteImageCacheProfile | 'native' | 'none';

type RemoteImageBaseProps = Omit<ImageProps, 'cachePolicy'> & {
  /** 兼容既有一次性预览；其它值统一映射到 native。 */
  cachePolicy?: ImageProps['cachePolicy'];
};

export type RemoteImageProps = RemoteImageBaseProps & (
  | { cacheProfile: RemoteImageCacheProfile; gameId: string }
  | { cacheProfile?: 'native' | 'none'; gameId?: never }
);

const supportsNativeCachePolicy = typeof Image.clearDiskCache === 'function';
const supportsCompressedCache = supportsNativeCachePolicy && supportsCompressedRemoteImageCache();
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

export function resolveRemoteImageCacheMode(
  cacheProfile: RemoteImageCacheMode | undefined,
  cachePolicy: ImageProps['cachePolicy'],
): RemoteImageCacheMode {
  return cacheProfile ?? (cachePolicy === 'none' ? 'none' : 'native');
}

export function RemoteImage({
  cacheProfile,
  cachePolicy,
  gameId,
  onDisplay,
  onError,
  source,
  ...props
}: RemoteImageProps) {
  const mode = resolveRemoteImageCacheMode(cacheProfile, cachePolicy);
  const tabActive = useContext(RemoteImageActivityContext);
  const persistenceEnabled = useContext(RemoteImagePersistenceContext);
  const active = tabActive;
  const normalized = useMemo(() => normalizeRemoteImageSource(source), [source]);
  const requestKey = normalized && gameId && (mode === 'thumbnail' || mode === 'artwork')
    ? `${gameId}|${mode}|${normalized.stableIdentity}`
    : null;
  const releaseRef = useRef<(() => void) | undefined>(undefined);
  const activeRequestKeyRef = useRef<string | null>(null);
  const [resolved, setResolved] = useState<CompressedRemoteImageResult | null>(null);
  const [phase, setPhase] = useState<'checking' | 'cached' | 'remote' | 'cached-fallback'>('checking');
  const [remoteDisplayed, setRemoteDisplayed] = useState(false);

  useEffect(() => {
    if (!requestKey || (mode !== 'thumbnail' && mode !== 'artwork')) return undefined;
    activeRequestKeyRef.current = requestKey;
    releaseRef.current?.();
    releaseRef.current = undefined;
    setResolved(null);
    setPhase('checking');
    setRemoteDisplayed(false);
    let cancelled = false;
    void findCompressedRemoteImage(source, { gameId: gameId!, profile: mode })
      .then((result) => {
        if (cancelled) {
          result?.release?.();
          return;
        }
        if (!result) {
          setPhase('remote');
          return;
        }
        releaseRef.current = result.release;
        setResolved(result);
        setPhase('cached');
      })
      .catch(() => {
        if (!cancelled) setPhase('remote');
      });
    return () => {
      cancelled = true;
      releaseRef.current?.();
      releaseRef.current = undefined;
    };
  }, [gameId, mode, requestKey, source]);

  useEffect(() => {
    if (!requestKey
      || (mode !== 'thumbnail' && mode !== 'artwork')
      || !active
      || !persistenceEnabled
      || !remoteDisplayed
      || resolved) return undefined;
    const controller = new AbortController();
    void cacheCompressedRemoteImage(source, { gameId: gameId!, profile: mode }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || !result) return;
        releaseRef.current = result.release;
        setResolved(result);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [active, gameId, mode, persistenceEnabled, remoteDisplayed, requestKey, resolved, source]);

  if (!supportsNativeCachePolicy) {
    return (
      <Image
        {...props}
        cachePolicy={cachePolicy}
        onDisplay={onDisplay}
        onError={onError}
        source={source}
      />
    );
  }

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
          if (phase === 'cached') setPhase('remote');
          else onError?.(event);
          return;
        }
        if (showingRemote && resolved) {
          setPhase('cached-fallback');
          return;
        }
        onError?.(event);
      }}
      source={!requestReady || phase === 'checking'
        ? null
        : showingCached
          ? resolved?.source ?? null
          : source}
    />
  );
}
