module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['react-native-gesture-handler/jestSetup.js', '<rootDir>/tests/native-layout-shim.js', '<rootDir>/tests/plugin-setup.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.tsx', '<rootDir>/tests/**/*.native.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo/fetch$': '<rootDir>/tests/expo-fetch-shim.ts',
    '^expo-secure-store$': '<rootDir>/tests/expo-secure-store-shim.ts',
    '^expo-sqlite/kv-store$': '<rootDir>/tests/expo-sqlite-kv-store-shim.ts',
    '^expo-crypto$': '<rootDir>/tests/expo-crypto-shim.ts',
    '\\.css$': '<rootDir>/tests/asset-module-stub.js',
    '^react-native-qrcode-svg$': '<rootDir>/tests/react-native-qrcode-svg-stub.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|@rranker/.*|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|@noble/ciphers/.*|react-navigation|@react-navigation/.*|native-base|standard-navigation|react-native-svg|react-native-qrcode-svg)',
  ],
};
