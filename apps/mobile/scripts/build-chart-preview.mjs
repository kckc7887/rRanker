import { buildPreview } from './lib/build-preview.mjs';

await buildPreview('simai-chart-preview', 'maimai-chart-preview', '<!--CHART_PREVIEW_CONFIG-->',
  '<script src="./skin-data.js"></script>\n  <script src="./player.js"></script>');
