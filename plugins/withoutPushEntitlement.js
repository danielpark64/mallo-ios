/**
 * expo-notifications 플러그인은 iOS에 `aps-environment`(원격 푸시) entitlement를
 * 무조건 넣는다. 말로는 로컬 알림(알람)만 쓰고 원격 푸시는 쓰지 않는데,
 * 무료 개인 개발자 팀은 Push Notifications capability를 서명할 수 없어
 * 프로비저닝 단계에서 빌드가 막힌다.
 *
 * expo-notifications가 이 값을 두 곳에 남기므로 둘 다 지운다:
 *   1) config.ios.entitlements — 정적 설정. 기록 시점에 plist로 병합된다.
 *   2) modResults — entitlements plist mod 결과.
 * (1)만 지우면 mod가 다시 넣고, (2)만 지우면 병합되며 되살아난다.
 *
 * app.json plugins 배열에서 expo-notifications 뒤에 두어야 한다.
 * prebuild를 다시 돌려도 유지된다.
 * 원격 푸시를 쓰게 되면 이 플러그인을 빼고 유료 계정으로 서명할 것.
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

const KEY = 'aps-environment';

module.exports = function withoutPushEntitlement(config) {
  if (config.ios && config.ios.entitlements) {
    delete config.ios.entitlements[KEY];
  }
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults[KEY];
    return cfg;
  });
};
