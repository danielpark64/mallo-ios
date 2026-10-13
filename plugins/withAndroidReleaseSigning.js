const { withAppBuildGradle } = require('@expo/config-plugins');

// android/ 폴더는 커밋하지 않고 prebuild로 다시 만들기 때문에, 릴리스 서명 설정을 여기서 주입한다.
// android/keystore.properties(커밋 금지)가 있으면 그 업로드 키로 서명하고, 없으면 debug 키로 서명해
// 로컬 테스트 빌드는 지금처럼 계속 된다. (교대알람 android/app/build.gradle 과 같은 방식)
// 값 예시는 store-assets/keystore.properties.example 참고.
function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let src = config.modResults.contents;
    if (src.includes('keystorePropertiesFile')) return config; // 이미 적용됨

    const androidAnchor = /\nandroid \{\n/;
    if (!androidAnchor.test(src)) {
      throw new Error('withAndroidReleaseSigning: build.gradle에서 "android {" 를 못 찾음 — 템플릿이 바뀐 것 같다.');
    }
    src = src.replace(
      androidAnchor,
      `
// 릴리스 서명: android/keystore.properties 가 있으면 그 키로, 없으면 debug 키로(로컬 테스트용) 서명한다.
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
`
    );

    const debugBlock = /(signingConfigs \{\s*debug \{[\s\S]*?\n        \})/;
    if (!debugBlock.test(src)) {
      throw new Error('withAndroidReleaseSigning: signingConfigs.debug 블록을 못 찾음.');
    }
    src = src.replace(
      debugBlock,
      `$1
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }`
    );

    // release 빌드 타입의 signingConfig 만 바꾼다 (debug 빌드 타입은 그대로)
    // buildTypes 안의 release 블록만 겨냥한다 (signingConfigs.release 나 debug 빌드 타입을 건드리지 않게)
    const releaseSigning = /(buildTypes \{[\s\S]*?\n        release \{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!releaseSigning.test(src)) {
      throw new Error('withAndroidReleaseSigning: release 빌드 타입의 signingConfig 를 못 찾음.');
    }
    src = src.replace(
      releaseSigning,
      `$1signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug`
    );

    config.modResults.contents = src;
    return config;
  });
}

module.exports = withAndroidReleaseSigning;
