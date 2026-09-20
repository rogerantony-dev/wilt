const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);

/**
 * PanelUI components probe for optional native packages behind guarded
 * `require` calls (platform sheets via @expo/ui, blur via expo-blur, keyboard
 * avoidance via react-native-keyboard-controller). Wilt installs none of them,
 * and Metro resolves every `require` at bundle time, so unresolvable optional
 * modules become empty modules here and the guards fall through as designed.
 */
const OPTIONAL_MODULES = ["react-native-keyboard-controller", "expo-blur", "@expo/ui"];

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
  } catch (error) {
    const optional = OPTIONAL_MODULES.some((m) => moduleName === m || moduleName.startsWith(`${m}/`));
    if (optional) return { type: "empty" };
    throw error;
  }
};

// Uniwind compiles Tailwind classes at bundle time, so it must be the outermost wrapper.
module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
});
