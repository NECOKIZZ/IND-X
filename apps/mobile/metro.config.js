// Metro: Expo's defaults, plus Privy's packages resolved to their browser
// builds (their Node builds import Node-only modules such as `crypto`).
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const BROWSER_BUILDS = ["jose", "isows", "zustand"];
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveRequest ?? context.resolveRequest;
  if (BROWSER_BUILDS.some((p) => moduleName === p || moduleName.startsWith(`${p}/`))) {
    return resolve({ ...context, unstable_conditionNames: ["browser", "require", "react-native"] }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
