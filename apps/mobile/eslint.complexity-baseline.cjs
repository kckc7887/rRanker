/**
 * 历史文件的圈复杂度上限，等于该文件当前最高函数。
 * 新文件使用 eslint.config.js 的默认门槛。
 * 已被本表覆盖的文件里，新函数也不能超过该文件的现值。
 */
module.exports = [
  {
    files: [
      'src/features/osu-chart-preview/webview-player/engine/parsers/BeatmapParser.ts',
    ],
    rules: { complexity: ['error', 107] },
  },
  {
    files: [
      'src/features/osu-chart-preview/webview-player/engine/renderer/HitObjectRenderer.ts',
      'src/features/osu-chart-preview/webview-player/engine/utils/hitJudge.ts',
    ],
    rules: { complexity: ['error', 81] },
  },
  {
    files: [
      'app/best-image.tsx',
    ],
    rules: { complexity: ['error', 73] },
  },
  {
    files: [
      'src/features/osu-chart-preview/webview-player/engine/utils/modDifficulty.ts',
    ],
    rules: { complexity: ['error', 67] },
  },
  {
    files: [
      'app/\\(tabs\\)/\\(overview\\)/index.tsx',
      'src/features/maimai-best-image/build-maimai-best-image-html.ts',
    ],
    rules: { complexity: ['error', 64] },
  },
  {
    files: [
      'src/screens/TufScreens.tsx',
    ],
    rules: { complexity: ['error', 52] },
  },
  {
    files: [
      'app/library/index.tsx',
    ],
    rules: { complexity: ['error', 50] },
  },
  {
    files: [
      'src/components/chunithm/ChunithmSongDetail.tsx',
      'src/screens/PhigrosBestImageScreen.tsx',
    ],
    rules: { complexity: ['error', 49] },
  },
  {
    files: [
      'src/features/osu-chart-preview/webview-player/engine/renderer/JudgementRenderer.ts',
    ],
    rules: { complexity: ['error', 48] },
  },
  {
    files: [
      'src/features/osu-chart-preview/webview-player/engine-audio/hitsoundSchedule.ts',
      'src/features/osu-chart-preview/webview-player/storyboard.ts',
      'src/screens/PhiraScreens.tsx',
    ],
    rules: { complexity: ['error', 46] },
  },
  {
    files: [
      'src/features/osu-chart-preview/webview-player/engine/rulesets/taiko/hitJudge.ts',
    ],
    rules: { complexity: ['error', 44] },
  },
  {
    files: [
      'src/screens/ChunithmBestImageScreen.tsx',
    ],
    rules: { complexity: ['error', 42] },
  },
  {
    files: [
      'src/components/MaimaiFilterBar.tsx',
      'src/features/osu-chart-preview/webview-player/engine/utils/scoreProcessor.ts',
    ],
    rules: { complexity: ['error', 41] },
  },
  {
    files: [
      'app/tools/strength-analysis.tsx',
      'src/features/osu-chart-preview/webview-player/engine/rulesets/taiko/Playfield.ts',
      'src/providers/http-json.ts',
    ],
    rules: { complexity: ['error', 39] },
  },
  {
    files: [
      'app/songs/\\[songId\\].tsx',
      'app/tools/push-rks.tsx',
    ],
    rules: { complexity: ['error', 34] },
  },
  {
    files: [
      'app/\\(tabs\\)/records/index.tsx',
      'src/features/osu-chart-preview/webview-player/engine/rulesets/catch/Playfield.ts',
      'src/services/upload-maimai-target-write.ts',
    ],
    rules: { complexity: ['error', 33] },
  },
  {
    files: [
      'src/components/phigros/PhigrosFilterBar.tsx',
      'src/domain/random-charts.ts',
      'src/features/phigros-chart-preview/chart-preview-input.ts',
    ],
    rules: { complexity: ['error', 32] },
  },
  {
    files: [
      'src/components/phigros/PhigrosSongDetail.tsx',
      'src/features/phigros-chart-preview/webview-player/rpe-core.ts',
      'src/services/score-hub-http.ts',
    ],
    rules: { complexity: ['error', 31] },
  },
  {
    files: [
      'src/features/chart-preview-shared/chart-preview-screen-shell.tsx',
      'src/features/phigros-chart-preview/webview-player/rpe-renderer.ts',
    ],
    rules: { complexity: ['error', 30] },
  },
  {
    files: [
      'src/features/osu-chart-preview/webview-player/engine/rulesets/mania/hitJudge.ts',
      'src/hooks/use-overview-sync.ts',
    ],
    rules: { complexity: ['error', 29] },
  },
  {
    files: [
      'src/components/GamePickerSheet.tsx',
      'src/domain/phigros-strength-analysis.ts',
      'src/features/osu-chart-preview/webview-player/engine/renderer/FollowpointRenderer.ts',
      'src/features/osu-chart-preview/webview-player/events.ts',
      'src/screens/MuseDashScreens.tsx',
      'src/services/remote-image-cache.ts',
    ],
    rules: { complexity: ['error', 28] },
  },
  {
    files: [
      'src/components/UploadDataSheet.tsx',
      'src/components/osu/OsuSongDetail.tsx',
      'src/services/score-hub-poll.ts',
    ],
    rules: { complexity: ['error', 27] },
  },
  {
    files: [
      'app/diagnostics.tsx',
      'src/domain/game-data.ts',
      'src/state/session-store.ts',
      'tests/consumer-copy-policy.test.ts',
    ],
    rules: { complexity: ['error', 26] },
  },
  {
    files: [
      'app/\\(tabs\\)/search/index.tsx',
      'src/components/game-content/SmsLoginPanel.tsx',
      'src/features/osu-chart-preview/webview-player/engine/rulesets/mania/Playfield.ts',
      'src/services/lxns-upload.ts',
    ],
    rules: { complexity: ['error', 25] },
  },
  {
    files: [
      'app/tools/chunithm-rating.tsx',
      'src/components/game-content/GameScoreCard.tsx',
      'src/features/osu-chart-preview/webview-player/engine/rulesets/taiko/scoreProcessor.ts',
      'src/features/toolbox/random-charts-preferences.ts',
      'src/screens/OsuScreens.tsx',
      'src/services/transfer-maimai-from-lxns.ts',
    ],
    rules: { complexity: ['error', 24] },
  },
  {
    files: [
      'src/components/phira/PhiraFilterBar.tsx',
      'src/domain/runtime-log.ts',
      'src/features/best-image/use-best-image-export.ts',
      'src/features/osu-chart-preview/webview-player/engine/rulesets/taiko/index.ts',
      'src/hooks/use-upload-qr-input.ts',
      'src/providers/http-cookies.ts',
      'src/providers/lxns-oauth-request.ts',
    ],
    rules: { complexity: ['error', 23] },
  },
  {
    files: [
      'src/components/RemoteImage.tsx',
      'src/features/best-image/application-best-image-card.ts',
      'src/features/best-image/best-image-screen-shell.tsx',
      'src/features/chart-download-shared/use-chart-package-download.ts',
      'src/features/osu-chart-preview/webview-player/builtin-skin.ts',
      'src/features/osu-chart-preview/webview-player/engine/rulesets/catch/scoreProcessor.ts',
      'src/features/phigros-chart-preview/webview-player/main.ts',
      'src/services/diving-fish-upload.ts',
    ],
    rules: { complexity: ['error', 22] },
  },
  {
    files: [
      'app/songs/chart-preview.tsx',
      'app/tools/tolerance.tsx',
      'src/components/game-content/GameSongRow.tsx',
      'src/services/lxns-account-binding.ts',
    ],
    rules: { complexity: ['error', 21] },
  }
];
