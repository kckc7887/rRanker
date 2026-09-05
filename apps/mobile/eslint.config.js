// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      'assets/maimai-chart-preview/player.js',
      'src/features/maimai-chart-preview/engine/**',
      'src/features/maimai-chart-preview/webview-player/**',
    ],
    rules: {
      // Keep compiler adoption diagnostics visible without changing the
      // established Hooks correctness checks during the SDK migration.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/globals': 'warn',
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
