import { buildPreview } from './lib/build-preview.mjs';

for (const rpe of [false, true]) {
  await buildPreview('phigros-chart-preview', 'phigros-chart-preview', '<!--PHIGROS_CHART_PREVIEW_CONFIG-->',
    '<script src="./player.js"></script>', {
      scriptFile: rpe ? 'rpe.bundle' : 'player.bundle', define: { RPE_PLAYER: String(rpe) },
    });
}
