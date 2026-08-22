import { Image as NativeImage, type ImageProps as NativeImageProps } from 'react-native';
import { Image as ExpoImage, type ImageProps as ExpoImageProps } from 'expo-image';

const supportsNativeCachePolicy = typeof ExpoImage.clearDiskCache === 'function';

/** 兼容原 RN.Image Host Tree 的远程图片入口；原生运行时切到 expo-image 内存策略。 */
export function RemoteNativeImage({ resizeMode, ...props }: NativeImageProps) {
  if (!supportsNativeCachePolicy) return <NativeImage {...props} resizeMode={resizeMode} />;
  return (
    <ExpoImage
      {...(props as unknown as ExpoImageProps)}
      cachePolicy="memory"
      contentFit={resizeMode === 'stretch'
        ? 'fill'
        : resizeMode === 'center'
          ? 'none'
          : resizeMode === 'repeat'
            ? 'cover'
            : resizeMode}
    />
  );
}
