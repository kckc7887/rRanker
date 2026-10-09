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
import { sha256FileAsync } from '@/utils/resource-integrity';

const READ_TIMEOUT_MS = 120_000;

export function loadRizlineChartPreviewResources(
  target: RizlineChartPreviewTarget,
  signal: AbortSignal,
  read?: RizlineChartPreviewResourceRead,
): Promise<RizlineChartPreviewBundle> {
  return rizlineResources.withRelease(async release => {
    const bundle = resolveRizlineChartPreviewBundle(release, target);
    for (const [index, asset] of [bundle.chart, bundle.music].entries()) {
      const source = read ? await read(asset, index) : await requestBytes({
        baseUrl: '', path: asset.url, fetcher: expoFetch as unknown as typeof fetch,
        signal, totalAttempts: 1, timeoutMs: READ_TIMEOUT_MS,
        label: 'Rizline 谱面确认', diagnosticScenario: index === 0 ? 'chart' : 'music',
        error: status => new ProviderError('network', `Rizline 资源请求失败：${status}`, true),
      });
      if (signal.aborted) throw signal.reason;
      const message = index === 0 ? 'Rizline 谱面校验失败' : 'Rizline 音频校验失败';
      if (source instanceof Uint8Array) {
        await verifyResourceBytes(source, asset, message);
      } else if (source.size !== asset.size || await sha256FileAsync(source.uri) !== asset.sha256.toLowerCase()) {
        throw new ProviderError('upstream_schema', message, true);
      }
      if (signal.aborted) throw signal.reason;
    }
    return bundle;
  }, signal);
}
