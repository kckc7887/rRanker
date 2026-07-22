const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('css')) {
  config.resolver.assetExts.push('css');
}

module.exports = config;
