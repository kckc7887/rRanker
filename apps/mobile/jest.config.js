const path = require('node:path');

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/tests/idle-callback-shim.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.tsx'],
  modulePaths: [path.join(path.dirname(require.resolve('expo/package.json')), 'node_modules')],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo/fetch$': '<rootDir>/tests/expo-fetch-shim.ts',
    '^expo-secure-store$': '<rootDir>/tests/expo-secure-store-shim.ts',
    '^expo-crypto$': '<rootDir>/tests/expo-crypto-shim.ts',
    '\\.css$': '<rootDir>/tests/asset-module-stub.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|standard-navigation|react-navigation|@react-navigation/.*|native-base|react-native-svg)',
  ],
};
