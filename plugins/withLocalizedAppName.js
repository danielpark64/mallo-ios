const fs = require('fs');
const path = require('path');
const { withDangerousMod, withInfoPlist } = require('@expo/config-plugins');

// 홈 화면 앱 이름을 기기 언어에 따라 다르게 보여준다: 기본 "SayRam", 한국어 기기 "세이람".
// (스토어 이름과 별개. 번들 ID·패키지명은 그대로)
const NAMES = { ko: '세이람' };

function withLocalizedAppName(config) {
  // Android: res/values-<lang>/strings.xml 의 app_name
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const res = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res');
      for (const [lang, name] of Object.entries(NAMES)) {
        const dir = path.join(res, `values-${lang}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, 'strings.xml'),
          `<resources>\n  <string name="app_name">${name}</string>\n</resources>\n`
        );
      }
      return config;
    },
  ]);
  // iOS: <lang>.lproj/InfoPlist.strings + LSHasLocalizedDisplayName
  config = withInfoPlist(config, (config) => {
    config.modResults.LSHasLocalizedDisplayName = true;
    return config;
  });
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const appDir = path.join(config.modRequest.platformProjectRoot, config.modRequest.projectName);
      for (const [lang, name] of Object.entries(NAMES)) {
        const dir = path.join(appDir, `${lang}.lproj`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, 'InfoPlist.strings'),
          `CFBundleDisplayName = "${name}";\nCFBundleName = "${name}";\n`
        );
      }
      return config;
    },
  ]);
  return config;
}

module.exports = withLocalizedAppName;
