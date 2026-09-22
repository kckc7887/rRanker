// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      'assets/maimai-chart-preview/player.js',
      'src/features/simai-chart-preview/engine/**',
      'src/features/simai-chart-preview/webview-player/**',
    ],
    rules: {
      // 当前已检查源码的最高圈复杂度。只拒绝比它更高的新函数。
      complexity: ['error', 107],
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'react-native',
          importNames: ['Alert'],
          message: '请使用 @/components/AppNotification 提供的全局顶部通知。',
        }],
      }],
    },
  },
]);
