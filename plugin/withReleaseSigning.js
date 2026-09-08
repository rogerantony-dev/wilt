const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * Signs local release builds (the APKs on the GitHub releases page) with the
 * Play upload key at ~/.wilt/upload.keystore when it is present, instead of
 * the shared Android debug key. Android developer verification only accepts
 * registered keys for sideloaded apps on certified devices, and the debug key
 * cannot be registered. Machines without the keystore fall back to the debug
 * key, so contributors can still build.
 *
 * The keystore and its password live outside the repo on purpose; see
 * docs/play-listing.md. EAS builds for Play read the same key via
 * credentials.json and do not go through this plugin.
 */
function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;
    if (gradle.includes("wiltUploadKeystore")) return config;

    gradle = gradle.replace(
      /signingConfigs \{\n(\s+)debug \{/,
      (match, indent) =>
        `def wiltUploadKeystore = new File(System.getProperty("user.home"), ".wilt/upload.keystore")\n` +
        `def wiltUploadPassword = new File(System.getProperty("user.home"), ".wilt/upload.password")\n` +
        `def wiltUploadSigning = wiltUploadKeystore.exists() && wiltUploadPassword.exists()\n` +
        `    signingConfigs {\n` +
        `${indent}release {\n` +
        `${indent}    storeFile wiltUploadKeystore\n` +
        `${indent}    storePassword wiltUploadSigning ? wiltUploadPassword.text.trim() : ""\n` +
        `${indent}    keyAlias "upload"\n` +
        `${indent}    keyPassword wiltUploadSigning ? wiltUploadPassword.text.trim() : ""\n` +
        `${indent}}\n` +
        `${indent}debug {`
    );

    // The release buildType: prefer the upload key, keep the debug key as the
    // fallback. Located by position, since "release {" also names the
    // signingConfig injected above.
    const buildTypes = gradle.indexOf("buildTypes {");
    const releaseType = gradle.indexOf("release {", buildTypes);
    const marker = "signingConfig signingConfigs.debug";
    const target = gradle.indexOf(marker, releaseType);
    if (buildTypes < 0 || releaseType < 0 || target < 0) {
      throw new Error("withReleaseSigning: could not find the release buildType in app/build.gradle");
    }
    gradle =
      gradle.slice(0, target) +
      "signingConfig wiltUploadSigning ? signingConfigs.release : signingConfigs.debug" +
      gradle.slice(target + marker.length);

    config.modResults.contents = gradle;
    return config;
  });
}

module.exports = withReleaseSigning;
