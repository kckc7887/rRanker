/**
 * Rizline 谱面确认资源准备：
 * 取得当前发布清单、下载谱面与音频字节、校验完整性与取消。
 * 路径与目标的纯解析在 domain/rizline-chart-preview；本模块只负责 I/O 编排。
 */

import {
  resolveRizlineChartPreviewBundle,
  type RizlineChartPreviewAsset,
  type RizlineChartPreviewBundle,
  type RizlineChartPreviewResourceRead,
  type RizlineChartPreviewTarget,
} from '@/domain/rizline-chart-preview';
import { ProviderError } from '@/providers/errors';
import { requestBytes } from '@/providers/http-json';
import type { RizlineRelease } from '@/services/rizline-resources';
import { verifyResourceBytes } from '@/services/verified-release';

/** 谱面确认资源读取超时：谱面与音频均为长文件。 */
export const RIZLINE_CHART_PREVIEW_READ_TIMEOUT_MS = 120_000;

/**
 * 资源端口：发布清单会话与资源字节读取。
 * 注入端口即可在 React Native 之外测试资源准备，无需替换 fetch 或资源单例。
 */
export type RizlineChartPreviewResourcePort = {
  withRelease<T>(action: (release: RizlineRelease) => Promise<T>, signal?: AbortSignal): Promise<T>;
  readBytes(asset: RizlineChartPreviewAsset, index: number, signal?: AbortSignal): Promise<Uint8Array>;
};

/** 默认端口：发布清单走共享 Rizline 资源单例，字节走公共请求执行器（单次尝试，读请求不自动重试）。 */
export async function defaultRizlineChartPreviewResourcePort(): Promise<RizlineChartPreviewResourcePort> {
  // 资源单例按调用时机解析，核心模块因此不静态依赖存储与平台模块，端口测试无需替换环境。
  const { rizlineResources } = await import('@/services/rizline-resources');
  return {
    withRelease: (action, signal) => rizlineResources.withRelease(action, signal),
    readBytes: (asset, index, signal) => requestBytes({
      baseUrl: '',
      path: asset.url,
      fetcher: fetch,
      signal,
      totalAttempts: 1,
      timeoutMs: RIZLINE_CHART_PREVIEW_READ_TIMEOUT_MS,
      label: 'Rizline 谱面确认',
      diagnosticScenario: index === 0 ? 'chart' : 'music',
      error: (status) => new ProviderError('network', `Rizline 资源请求失败：${status}`, true),
    }),
  };
}

export type RizlineChartPreviewResourceLoader = (
  target: RizlineChartPreviewTarget,
  signal: AbortSignal,
  read?: RizlineChartPreviewResourceRead,
) => Promise<RizlineChartPreviewBundle>;

/** 按端口装配资源准备：端口之外的依赖在函数体内逐次读取，便于测试观察调用。 */
export function createRizlineChartPreviewResourceLoader(
  port: RizlineChartPreviewResourcePort,
): RizlineChartPreviewResourceLoader {
  return async function loadRizlineChartPreviewResources(target, signal, read) {
    return port.withRelease(async (release) => {
      const bundle = resolveRizlineChartPreviewBundle(release, target);
      for (const [index, asset] of [bundle.chart, bundle.music].entries()) {
        const bytes = read
          ? await read(asset, index)
          : await port.readBytes(asset, index, signal);
        await verifyResourceBytes(
          bytes,
          asset,
          index === 0 ? 'Rizline 谱面校验失败' : 'Rizline 音频校验失败',
        );
        if (signal.aborted) throw signal.reason;
      }
      return bundle;
    }, signal);
  };
}

/** 默认装配：应用运行时入口。 */
export const loadRizlineChartPreviewResources: RizlineChartPreviewResourceLoader = async (
  target,
  signal,
  read,
) => createRizlineChartPreviewResourceLoader(await defaultRizlineChartPreviewResourcePort())(
  target,
  signal,
  read,
);
