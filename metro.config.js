const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs');
config.resolver.blockList = [
  /api\/\.venv\/.*/,
  /api\/venv\/.*/,
];

module.exports = config;
