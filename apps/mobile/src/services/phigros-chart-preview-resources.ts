/**
 * Phigros 谱面确认资源准备：
 * 读取对象存储当前发布版本、解析目标资产的最终 URL、下载谱面/音乐/曲绘字节并校验。
 * 路径与目标的纯解析在 domain/phigros-chart-preview；本模块只负责 I/O 编排。
 */

import { PHIGROS_OSS_BASE } from '@/domain/account-avatar';
import {
  resolvePhigrosChartPreviewAssetBundle,
  resolvePhigrosChartPreviewVariants,
  type PhigrosChartPreviewBundle,
  type PhigrosChartPreviewResourceRead,
  type PhigrosChartPreviewTarget,
} from '@/domain/phigros-chart-preview';
import { phigrosResources, PhigrosResourceService, type PhigrosRelease, verifyPhigrosResource } from '@/services/phigros-resources';

/** 谱面确认资源读取超时：谱面、音乐与曲绘均为大文件。 */
export const PHIGROS_CHART_PREVIEW_READ_TIMEOUT_MS = 60_000;

const RESOURCE_KINDS = ['chart', 'music', 'illustration'] as const;
export type PhigrosChartPreviewResourceKind = (typeof RESOURCE_KINDS)[number] | 'resource';

/**
 * 资源端口：发布清单会话、资产最终 URL 与字节读取。
 * 注入端口即可在 React Native 之外测试资源准备，无需替换 fetch 或对象存储单例。
 */
export type PhigrosChartPreviewResourcePort = {
  /** 对象存储根路径，决定解析出的资产 URL。 */
  readonly ossBase: string;
  withRelease<T>(action: (release: PhigrosRelease) => Promise<T>, signal?: AbortSignal, check?: boolean): Promise<T>;
  resolveAssetUrl(release: PhigrosRelease, path: string): string;
  readBytes(url: string, signal: AbortSignal | undefined, kind: PhigrosChartPreviewResourceKind): Promise<Uint8Array>;
};

/** 按对象存储根路径装配资源端口；默认根路径复用共享单例，其它根路径单独装配。 */
export function createPhigrosChartPreviewResourcePort(ossBase: string = PHIGROS_OSS_BASE): PhigrosChartPreviewResourcePort {
  const resources = ossBase === PHIGROS_OSS_BASE ? phigrosResources : new PhigrosResourceService(ossBase);
  return {
    ossBase,
    withRelease: (action, signal, check) => resources.withRelease(action, signal, check),
    resolveAssetUrl: (release, path) => resources.assetUrl(release, resources.asset(release, path)),
    readBytes: (url, signal, kind) => resources.bytes(url, signal, PHIGROS_CHART_PREVIEW_READ_TIMEOUT_MS, kind),
  };
}

export type PhigrosChartPreviewResources = {
  bundle: PhigrosChartPreviewBundle;
  chart: Uint8Array;
  music: Uint8Array;
  illustration: Uint8Array;
};

export type PhigrosChartPreviewResourceLoader = {
  loadBundle(target: PhigrosChartPreviewTarget, signal: AbortSignal): Promise<PhigrosChartPreviewBundle>;
  loadVariants(target: PhigrosChartPreviewTarget, signal: AbortSignal): Promise<number[]>;
  load(
    target: PhigrosChartPreviewTarget,
    signal: AbortSignal,
    read?: PhigrosChartPreviewResourceRead,
  ): Promise<PhigrosChartPreviewResources>;
};

/** 按端口装配资源准备：端口之外的依赖在函数体内逐次读取，便于测试观察调用。 */
export function createPhigrosChartPreviewResourceLoader(
  port: PhigrosChartPreviewResourcePort,
): PhigrosChartPreviewResourceLoader {
  return {
    loadBundle: (target, signal) => port.withRelease(
      async (release) => resolvePhigrosChartPreviewAssetBundle({ ...release, target, ossBase: port.ossBase }),
      signal,
    ),

    loadVariants: (target, signal) => port.withRelease(
      async (release) => resolvePhigrosChartPreviewVariants(release.manifest.assets, target),
      signal,
    ),

    load: (target, signal, read) => port.withRelease(async (release) => {
      const bundle = resolvePhigrosChartPreviewAssetBundle({ ...release, target, ossBase: port.ossBase });
      const bytes: Uint8Array[] = [];
      for (const [index, asset] of [bundle.chart, bundle.music, bundle.illustration].entries()) {
        asset.url = port.resolveAssetUrl(release, asset.path);
        const data = read
          ? await read(asset, index)
          : await port.readBytes(asset.url, signal, RESOURCE_KINDS[index] ?? 'resource');
        await verifyPhigrosResource(data, asset);
        if (signal.aborted) throw signal.reason;
        bytes.push(data);
      }
      return { bundle, chart: bytes[0]!, music: bytes[1]!, illustration: bytes[2]! };
    }, signal),
  };
}

const defaultLoader = createPhigrosChartPreviewResourceLoader(createPhigrosChartPreviewResourcePort());

export const loadPhigrosChartPreviewVariants: PhigrosChartPreviewResourceLoader['loadVariants'] =
  (target, signal) => defaultLoader.loadVariants(target, signal);

export const loadPhigrosChartPreviewResources: PhigrosChartPreviewResourceLoader['load'] =
  (target, signal, read) => defaultLoader.load(target, signal, read);

/** 读取对象存储当前发布版本，定位目标歌曲的谱面、音乐与曲绘资源。 */
export function loadPhigrosChartPreviewBundle(
  target: PhigrosChartPreviewTarget,
  signal: AbortSignal,
  ossBase: string = PHIGROS_OSS_BASE,
): Promise<PhigrosChartPreviewBundle> {
  return createPhigrosChartPreviewResourceLoader(createPhigrosChartPreviewResourcePort(ossBase))
    .loadBundle(target, signal);
}
