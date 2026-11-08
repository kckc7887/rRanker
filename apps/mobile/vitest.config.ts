import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root,
  define: { __DEV__: false },
  resolve: {
    alias: {
      '@': resolve(root, 'src'),
      'expo/fetch': resolve(root, 'tests/expo-fetch-shim.ts'),
      'expo/fetch.js': resolve(root, 'tests/expo-fetch-shim.ts'),
      'expo-secure-store': resolve(root, 'tests/expo-secure-store-shim.ts'),
      'expo-sqlite/kv-store': resolve(root, 'tests/expo-sqlite-kv-store-shim.ts'),
      'expo-sqlite': resolve(root, 'tests/expo-sqlite-shim.ts'),
      'expo-crypto': resolve(root, 'tests/expo-crypto-shim.ts'),
      'expo-constants': resolve(root, 'tests/expo-constants-shim.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/**/*.native.test.ts'],
    setupFiles: ['tests/plugin-setup.ts'],
    server: { deps: { inline: [/@rranker\//] } },
  },
});
