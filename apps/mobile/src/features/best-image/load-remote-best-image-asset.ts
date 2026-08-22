import { loadRemoteImageAsDataUri } from './load-remote-image-data-uri';

/** 兼容导出名：远程素材经任务临时文件转为 data URI，不保留磁盘副本。 */
export async function loadRemoteBestImageAssetDataUri(url: string | null | undefined): Promise<string | null> {
  return loadRemoteImageAsDataUri(url);
}
