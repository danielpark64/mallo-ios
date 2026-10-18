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
  // iOS: 이름이 언어별로 바뀐다는 표시(LSHasLocalizedDisplayName)
  config = withInfoPlist(config, (config) => {
    config.modResults.LSHasLocalizedDisplayName = true;
    return config;
  });
  // iOS 한국어 이름은 app.json "locales"(locales/ko.json)가 맡는다 — Expo 기본 기능이 lproj를 Xcode 프로젝트에 등록까지 한다.
  // (예전엔 여기서 ko.lproj 파일만 만들고 프로젝트에 등록하지 않아 iOS 홈 화면에 "SayRam"으로 나왔다 — 2026-10-18)
  return config;
}

module.exports = withLocalizedAppName;
