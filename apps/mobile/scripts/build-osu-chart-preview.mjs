import { buildPreview } from './lib/build-preview.mjs';
import { osuPreviewLicenseBanner } from './lib/osu-preview-build.mjs';

await buildPreview('osu-chart-preview', 'osu-chart-preview', '<!--OSU_CHART_PREVIEW_CONFIG-->',
  '<script src="./audio-data.js"></script>\n  <script src="./player.js"></script>', {
    licenseBanner: osuPreviewLicenseBanner(),
  });
