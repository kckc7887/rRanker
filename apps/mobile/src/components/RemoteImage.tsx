import { Image, type ImageProps } from 'expo-image';

export type RemoteImageProps = ImageProps;
const supportsNativeCachePolicy = typeof Image.clearDiskCache === 'function';

/** 远程展示图片默认只进入内存，避免曲库与高清曲绘在磁盘无界累积；仅显式传 cachePolicy="none" 的调用方（如个性化页曲绘预览）完全跳过缓存。 */
export function RemoteImage(props: RemoteImageProps) {
  const { cachePolicy, ...rest } = props;
  const resolvedCachePolicy = supportsNativeCachePolicy
    ? (cachePolicy === 'none' ? 'none' : 'memory')
    : cachePolicy;
  return <Image {...rest} cachePolicy={resolvedCachePolicy} />;
}
