// 알람 소리 고르기(1.2.0): 고른 소리 CAF 6개를 **iOS 앱 번들에만** 넣는다.
// expo-notifications 플러그인의 sounds 목록에 넣으면 Android res/raw에도 같은 CAF가 복사돼
// (Android는 IMA4 CAF를 못 틀고, 이름이 같은 네이티브 m4a를 덮어써 버린다) iOS 전용으로 따로 둔다.
// Android 소리는 modules/mallo-alarm/android/src/main/res/raw/snd_*.m4a 에 있다.
// iOS 알림·AlarmKit 소리는 앱 번들 안 파일만, 30초 이하여야 한다(넘으면 기본 소리로 울림).
const { withXcodeProject } = require('@expo/config-plugins');
const { setNotificationSounds } = require('expo-notifications/plugin/build/withNotificationsIOS');

module.exports = function withIosAlarmSounds(config, { sounds = [] } = {}) {
  return withXcodeProject(config, (cfg) => {
    cfg.modResults = setNotificationSounds(cfg.modRequest.projectRoot, {
      sounds,
      project: cfg.modResults,
      projectName: cfg.modRequest.projectName,
    });
    return cfg;
  });
};
