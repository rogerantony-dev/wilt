module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // react-native-worklets/plugin must be listed last (required by Reanimated 4).
    plugins: ["react-native-worklets/plugin"],
  };
};
