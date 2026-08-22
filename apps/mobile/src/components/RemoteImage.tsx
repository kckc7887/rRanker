import { Image, type ImageProps } from 'expo-image';

export type RemoteImageProps = ImageProps;
const supportsNativeCachePolicy = typeof Image.clearDiskCache === 'function';

/** 远程展示图片统一只进入内存，避免曲库与高清曲绘在磁盘无界累积。 */
export function RemoteImage(props: RemoteImageProps) {
  return <Image {...props} cachePolicy={supportsNativeCachePolicy ? 'memory' : props.cachePolicy} />;
}
