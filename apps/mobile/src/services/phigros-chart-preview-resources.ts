import {
  resolvePhigrosChartPreviewAssetBundle,
  resolvePhigrosChartPreviewVariants,
  type PhigrosChartPreviewBundle,
  type PhigrosChartPreviewResourceRead,
  type PhigrosChartPreviewTarget,
} from '@/domain/phigros-chart-preview';
import { phigrosResources, verifyPhigrosResource } from '@/services/phigros-resources';
import { ProviderError } from '@/providers/errors';
import { sha256FileAsync } from '@/utils/resource-integrity';

export type PhigrosChartPreviewResources = {
  bundle: PhigrosChartPreviewBundle;
  chart: Uint8Array;
  music: Uint8Array;
  illustration: Uint8Array;
};

export function loadPhigrosChartPreviewVariants(
  target: PhigrosChartPreviewTarget,
  signal: AbortSignal,
): Promise<number[]> {
  return phigrosResources.withRelease(async release =>
    resolvePhigrosChartPreviewVariants(release.manifest.assets, target), signal);
}

export function loadPhigrosChartPreviewResources(
  target: PhigrosChartPreviewTarget,
  signal: AbortSignal,
  read: PhigrosChartPreviewResourceRead,
): Promise<PhigrosChartPreviewResources> {
  return phigrosResources.withRelease(async release => {
    const bundle = resolvePhigrosChartPreviewAssetBundle({ ...release, target });
    const bytes: Uint8Array[] = [];
    for (const [index, resource] of [bundle.chart, bundle.music, bundle.illustration].entries()) {
      const asset = { ...resource, url: phigrosResources.assetUrl(release, resource) };
      const source = await read(asset, index);
      if (signal.aborted) throw signal.reason;
      if (source instanceof Uint8Array) {
        await verifyPhigrosResource(source, asset);
      } else if (source.size !== asset.size || await sha256FileAsync(source.uri) !== asset.sha256.toLowerCase()) {
        throw new ProviderError('upstream_schema', 'Phigros 资源校验失败', true);
      }
      if (signal.aborted) throw signal.reason;
      const data = source instanceof Uint8Array ? source : await source.bytes();
      if (signal.aborted) throw signal.reason;
      bytes.push(data);
    }
    return { bundle, chart: bytes[0]!, music: bytes[1]!, illustration: bytes[2]! };
  }, signal);
}
