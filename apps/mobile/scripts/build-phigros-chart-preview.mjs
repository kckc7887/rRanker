import { buildPreview } from './lib/build-preview.mjs';

await buildPreview('phigros-chart-preview', 'phigros-chart-preview', '<!--PHIGROS_CHART_PREVIEW_CONFIG-->',
  '<script src="./player.js"></script>');
