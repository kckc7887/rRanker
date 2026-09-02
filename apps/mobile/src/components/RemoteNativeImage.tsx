import { Image as NativeImage, type ImageProps as NativeImageProps } from 'react-native';
import { Image as ExpoImage, type ImageProps as ExpoImageProps } from 'expo-image';
import { RemoteImage, type RemoteImageCacheMode } from '@/components/RemoteImage';

const supportsNativeCachePolicy = typeof ExpoImage.clearDiskCache === 'function';

export type RemoteNativeImageProps = NativeImageProps & (
  | { cacheProfile: Extract<RemoteImageCacheMode, 'thumbnail' | 'artwork'>; gameId: string }
  | { cacheProfile?: Extract<RemoteImageCacheMode, 'native' | 'none'>; gameId?: never }
);

/** 保留 RN.Image 调用形态；原生运行时统一走共享远程图片入口。 */
export function RemoteNativeImage({ cacheProfile, gameId, resizeMode, ...props }: RemoteNativeImageProps) {
  if (!supportsNativeCachePolicy) return <NativeImage {...props} resizeMode={resizeMode} />;
  const contentFit = resizeMode === 'stretch'
    ? 'fill'
    : resizeMode === 'center'
      ? 'none'
      : resizeMode === 'repeat'
        ? 'cover'
        : resizeMode;
  if ((cacheProfile === 'thumbnail' || cacheProfile === 'artwork') && gameId) {
    return (
      <RemoteImage
        {...(props as unknown as ExpoImageProps)}
        cacheProfile={cacheProfile}
        contentFit={contentFit}
        gameId={gameId}
      />
    );
  }
  return (
    <RemoteImage
      {...(props as unknown as ExpoImageProps)}
      cacheProfile={cacheProfile as 'native' | 'none' | undefined}
      contentFit={contentFit}
    />
  );
}
