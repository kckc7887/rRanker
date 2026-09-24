// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const complexityBaseline = require('./eslint.complexity-baseline.cjs');

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
      // 新文件的圈复杂度门槛。历史文件见 eslint.complexity-baseline.cjs，上限是该文件当前最高函数。
      complexity: ['error', 20],
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'react-native',
          importNames: ['Alert'],
          message: '请使用 @/components/AppNotification 提供的全局顶部通知。',
        }],
      }],
    },
  },
  ...complexityBaseline,
]);
