import { fetch as expoFetch } from 'expo/fetch';
import {
  resolveRizlineChartPreviewBundle,
  type RizlineChartPreviewBundle,
  type RizlineChartPreviewResourceRead,
  type RizlineChartPreviewTarget,
} from '@/domain/rizline-chart-preview';
import { ProviderError } from '@/providers/errors';
import { requestBytes } from '@/providers/http-json';
import { rizlineResources } from '@/services/rizline-resources';
import { verifyResourceBytes } from '@/services/verified-release';

const READ_TIMEOUT_MS = 120_000;

export function loadRizlineChartPreviewResources(
  target: RizlineChartPreviewTarget,
  signal: AbortSignal,
  read?: RizlineChartPreviewResourceRead,
): Promise<RizlineChartPreviewBundle> {
  return rizlineResources.withRelease(async release => {
    const bundle = resolveRizlineChartPreviewBundle(release, target);
    for (const [index, asset] of [bundle.chart, bundle.music].entries()) {
      const bytes = read ? await read(asset, index) : await requestBytes({
        baseUrl: '', path: asset.url, fetcher: expoFetch as unknown as typeof fetch,
        signal, totalAttempts: 1, timeoutMs: READ_TIMEOUT_MS,
        label: 'Rizline 谱面确认', diagnosticScenario: index === 0 ? 'chart' : 'music',
        error: status => new ProviderError('network', `Rizline 资源请求失败：${status}`, true),
      });
      await verifyResourceBytes(bytes, asset, index === 0 ? 'Rizline 谱面校验失败' : 'Rizline 音频校验失败');
      if (signal.aborted) throw signal.reason;
    }
    return bundle;
  }, signal);
}
