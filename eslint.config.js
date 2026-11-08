const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    files: ['plugins/games/*/src/index.ts', 'plugins/providers/*/src/index.ts', 'plugins/providers/*/src/credential.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    settings: {
      'import/resolver': {
        typescript: { project: require('node:path').join(__dirname, 'apps/mobile/tsconfig.json') },
      },
    },
    ignores: [
      'apps/mobile/dist/*',
      'plugins/shared/chart-simai/src/features/simai-chart-preview/engine/**',
      'plugins/shared/chart-simai/src/features/simai-chart-preview/webview-player/**',
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/globals': 'off',
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'react-native',
          importNames: ['Alert'],
          message: '请使用 @rranker/sdk/components/AppNotification 提供的全局顶部通知。',
        }],
      }],
    },
  },
]);
