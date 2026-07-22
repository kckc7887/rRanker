module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo/fetch$': '<rootDir>/tests/expo-fetch-shim.ts',
    '^expo-secure-store$': '<rootDir>/tests/expo-secure-store-shim.ts',
    '^expo-crypto$': '<rootDir>/tests/expo-crypto-shim.ts',
    '\\.css$': '<rootDir>/tests/asset-module-stub.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|native-base|react-native-svg)',
  ],
};
