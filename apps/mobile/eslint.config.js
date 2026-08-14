// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      'assets/maimai-chart-preview/player.js',
      'src/features/maimai-chart-preview/engine/**',
      'src/features/maimai-chart-preview/webview-player/**',
    ],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'react-native',
          importNames: ['Alert'],
          message: '请使用 @/components/AppNotification 提供的全局顶部通知。',
        }],
      }],
      // metro.config.js 已把 glsl 加入 assetExts（RPE 特效预设 shader 随包分发），
      // 与上游规则的「允许 Metro 资源扩展名」语义对齐。
      '@typescript-eslint/no-require-imports': ['warn', {
        allow: [
          '\\.(aac|aiff|avif|bmp|caf|db|gif|glsl|heic|html|jpeg|jpg|json|m4a|m4v|mov|mp3|mp4|mpeg|mpg|otf|pdf|png|psd|svg|ttf|wav|webm|webp|xml|yaml|yml|zip)$',
        ],
      }],
    },
  },
]);
