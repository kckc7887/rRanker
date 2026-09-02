import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, type ImageProps } from 'expo-image';
import {
  invalidateCompressedRemoteImage,
  loadCompressedRemoteImage,
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
  onError,
  source,
  ...props
}: RemoteImageProps) {
  const mode = resolveRemoteImageCacheMode(cacheProfile, cachePolicy);
  const normalized = useMemo(() => normalizeRemoteImageSource(source), [source]);
  const requestKey = normalized && gameId && (mode === 'thumbnail' || mode === 'artwork')
    ? `${gameId}|${mode}|${normalized.stableIdentity}`
    : null;
  const releaseRef = useRef<(() => void) | undefined>(undefined);
  const [resolved, setResolved] = useState<CompressedRemoteImageResult | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    releaseRef.current?.();
    releaseRef.current = undefined;
    setResolved(null);
    setFallback(false);
    if (!requestKey || (mode !== 'thumbnail' && mode !== 'artwork')) return undefined;
    let cancelled = false;
    void loadCompressedRemoteImage(source, { gameId: gameId!, profile: mode })
      .then((result) => {
        if (cancelled) {
          result?.release?.();
          return;
        }
        if (!result) {
          setFallback(true);
          return;
        }
        releaseRef.current = result.release;
        setResolved(result);
      })
      .catch(() => {
        if (!cancelled) setFallback(true);
      });
    return () => {
      cancelled = true;
      releaseRef.current?.();
      releaseRef.current = undefined;
    };
  }, [gameId, mode, requestKey, source]);

  if (!supportsNativeCachePolicy) {
    return (
      <Image
        {...props}
        cachePolicy={cachePolicy}
        onError={onError}
        source={source}
      />
    );
  }

  if (!supportsCompressedCache && (mode === 'thumbnail' || mode === 'artwork')) {
    return <Image {...props} cachePolicy="memory" onError={onError} source={source} />;
  }

  if (mode === 'none' || mode === 'native' || !requestKey || fallback) {
    return (
      <Image
        {...props}
        cachePolicy={mode === 'none' ? 'none' : fallback ? 'memory' : 'memory-disk'}
        onError={onError}
        source={source}
      />
    );
  }

  return (
    <Image
      {...props}
      cachePolicy="none"
      onError={() => {
        if (!resolved) return;
        void invalidateCompressedRemoteImage(resolved.cacheKey);
        releaseRef.current?.();
        releaseRef.current = undefined;
        setFallback(true);
      }}
      source={resolved?.source ?? null}
    />
  );
}
