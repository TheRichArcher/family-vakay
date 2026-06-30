const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const webpack = require('webpack');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync({
    ...env,
    babel: {
      dangerouslyAddModulePathsToTranspile: ['@react-native-community/datetimepicker']
    }
  }, argv);

  // Add the DefinePlugin to handle environment variables
  // This makes `process.env.EXPO_PUBLIC_API_URL` available in the code for the web build
  config.plugins.push(
    new webpack.DefinePlugin({
      'process.env.EXPO_PUBLIC_API_URL': JSON.stringify(process.env.EXPO_PUBLIC_API_URL || 'https://family-vk-app-backend.onrender.com'),
      'process.env.DEEPLINK_BASE_URL': JSON.stringify(process.env.DEEPLINK_BASE_URL || ''),
      'process.env.QR_BASE_URL': JSON.stringify(process.env.QR_BASE_URL || '')
    })
  );

  // Customize the config before returning it.
  config.resolve.alias = {
    ...config.resolve.alias,
    'react-native$': 'react-native-web'
  };

  // Enable source maps for better debugging
  config.devtool = 'source-map';

  // Ensure proper module resolution
  config.resolve.extensions = ['.web.js', '.web.jsx', '.web.ts', '.web.tsx', '.js', '.jsx', '.ts', '.tsx'];

  return config;
}; 