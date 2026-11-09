// 세이람 홈 화면 위젯(iOS WidgetKit 확장). @bacons/apple-targets가 빌드 때 Xcode 타깃으로 붙인다.
// 데이터는 앱이 App Group(group.com.danielpark.shared)에 둔 요약(lib/widgetData.ts)만 읽는다. 설계: docs/WIDGET_PLAN.md
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'SayramWidget',
  displayName: 'SayRam',
  bundleIdentifier: '.widget',
  // 앱과 같은 최소 버전. ▲▼ 넘기기 버튼만 iOS 17 이상
  deploymentTarget: '16.4',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents'],
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
