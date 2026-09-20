import { buildPreview } from './lib/build-preview.mjs';

await buildPreview('rizline-chart-preview', 'rizline-chart-preview', '<!--RIZLINE_CHART_PREVIEW_CONFIG-->',
  '<script src="./player.js"></script>');
