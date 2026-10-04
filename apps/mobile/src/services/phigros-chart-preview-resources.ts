import {
  resolvePhigrosChartPreviewAssetBundle,
  resolvePhigrosChartPreviewVariants,
  type PhigrosChartPreviewBundle,
  type PhigrosChartPreviewResourceRead,
  type PhigrosChartPreviewTarget,
} from '@/domain/phigros-chart-preview';
import { phigrosResources, verifyPhigrosResource } from '@/services/phigros-resources';

const READ_TIMEOUT_MS = 60_000;
const RESOURCE_KINDS = ['chart', 'music', 'illustration'] as const;

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
  read?: PhigrosChartPreviewResourceRead,
): Promise<PhigrosChartPreviewResources> {
  return phigrosResources.withRelease(async release => {
    const bundle = resolvePhigrosChartPreviewAssetBundle({ ...release, target });
    const bytes: Uint8Array[] = [];
    for (const [index, asset] of [bundle.chart, bundle.music, bundle.illustration].entries()) {
      asset.url = phigrosResources.assetUrl(release, phigrosResources.asset(release, asset.path));
      const data = read
        ? await read(asset, index)
        : await phigrosResources.bytes(asset.url, signal, READ_TIMEOUT_MS, RESOURCE_KINDS[index]);
      await verifyPhigrosResource(data, asset);
      if (signal.aborted) throw signal.reason;
      bytes.push(data);
    }
    return { bundle, chart: bytes[0]!, music: bytes[1]!, illustration: bytes[2]! };
  }, signal);
}
