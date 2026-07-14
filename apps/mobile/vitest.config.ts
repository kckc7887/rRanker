import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(process.cwd(), 'src'),
      'expo/fetch': resolve(process.cwd(), 'tests/expo-fetch-shim.ts'),
      'expo-secure-store': resolve(process.cwd(), 'tests/expo-secure-store-shim.ts'),
      'expo-crypto': resolve(process.cwd(), 'tests/expo-crypto-shim.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
