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

export type RemoteImageProps = Omit<ImageProps, 'cachePolicy'> & {
  cacheProfile?: RemoteImageCacheMode;
  /** 兼容既有一次性预览；其它值统一映射到 native。 */
  cachePolicy?: ImageProps['cachePolicy'];
};

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
  onError,
  source,
  ...props
}: RemoteImageProps) {
  const mode = resolveRemoteImageCacheMode(cacheProfile, cachePolicy);
  const normalized = useMemo(() => normalizeRemoteImageSource(source), [source]);
  const requestKey = normalized && (mode === 'thumbnail' || mode === 'artwork')
    ? `${mode}|${normalized.stableIdentity}`
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
    void loadCompressedRemoteImage(source, mode)
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
  }, [mode, requestKey, source]);

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
        cachePolicy={mode === 'none' ? 'none' : 'memory-disk'}
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
