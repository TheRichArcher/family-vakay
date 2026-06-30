module.exports = {
  preset: 'jest-expo/ios',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    "node_modules/(?!(@react-native/.*|react-native|@react-navigation/.*|@sentry/.*|react-navigation|react-native-.*|@unimodules/.*|unimodules|sentry-expo|native-base|@firebase/.*|firebase|expo($|/.+)|expo-modules-core|expo-.*|@expo/.*|@react-native-community/datetimepicker)/)"
  ],
  // The 'jest-expo' preset should handle transformation of node_modules,
  // so a custom transformIgnorePatterns may not be needed.
  // If you encounter issues, you may need to add a pattern here.
  
  // By using the 'jest-expo' preset, we can likely remove the manual
  // moduleFileExtensions list as well, as it provides good defaults.

  // Use default testMatch from preset; remove custom testRegex to avoid conflict
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/__mocks__/fileMock.js',
    '^firebase/(.*)$': '<rootDir>/__mocks__/firebase-$1.js',
    '^firebase$': '<rootDir>/__mocks__/firebase.js',
    '^uuid$': '<rootDir>/__mocks__/uuid.js',
  },
}; 