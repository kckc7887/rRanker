const { initializePlugins } = require('@rranker/sdk');
const { plugins } = require('./src/plugins');
initializePlugins(plugins);
require('expo-router/entry');
