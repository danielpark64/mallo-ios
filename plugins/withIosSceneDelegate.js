const { withAppDelegate } = require('@expo/config-plugins');

// Xcode 27은 legacy AppDelegate-window 방식(예전 Expo/RN 기본 템플릿)을 위해 iOS가
// 자동으로 만들어주던 UIScene 호환 셔임을 없앴다. 그 결과 이 앱은 실행하자마자
// 크래시하거나(2026-09-18 최초 발견, EXC_BREAKPOINT) — UIApplicationSceneManifest만
// 추가하고 실제 UIWindowSceneDelegate를 구현 안 하면 — 조용히 exit(0)으로 즉시
// 종료된다(같은 날 재확인). Expo SDK 56엔 아직 공식 수정이 없다
// (https://github.com/expo/expo/issues/46663, #46664).
// react-native-community/template의 UIScene 채택 패턴(PR #251)을 Expo의
// ExpoAppDelegate/ExpoReactNativeFactory 구조에 맞게 이식한다.
function withIosSceneDelegate(config) {
  return withAppDelegate(config, (config) => {
    let contents = config.modResults.contents;
    // 이미 적용된 프로젝트(prebuild를 --clean 없이 다시 돌린 경우)는 건너뛴다 — 두 번 고치려다 실패하던 문제(2026-10-18)
    if (contents.includes('class SceneDelegate')) return config;

    const launchOptionsPropertyAnchor = 'var window: UIWindow?';
    if (!contents.includes(launchOptionsPropertyAnchor)) {
      throw new Error(
        'withIosSceneDelegate: AppDelegate.swift에서 "var window: UIWindow?"를 못 찾음 — Expo 템플릿이 바뀐 것 같다.'
      );
    }
    contents = contents.replace(
      launchOptionsPropertyAnchor,
      `${launchOptionsPropertyAnchor}\n  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?`
    );

    const factoryAssignAnchor = 'reactNativeFactory = factory';
    if (!contents.includes(factoryAssignAnchor)) {
      throw new Error(
        'withIosSceneDelegate: AppDelegate.swift에서 "reactNativeFactory = factory"를 못 찾음 — Expo 템플릿이 바뀐 것 같다.'
      );
    }
    contents = contents.replace(
      factoryAssignAnchor,
      `${factoryAssignAnchor}\n    self.launchOptions = launchOptions`
    );

    const windowCreationBlockRegex =
      /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\(\s*\n\s*withModuleName: "main",\s*\n\s*in: window,\s*\n\s*launchOptions: launchOptions\)\s*\n#endif\n/;
    if (!windowCreationBlockRegex.test(contents)) {
      throw new Error(
        'withIosSceneDelegate: AppDelegate.swift에서 window 생성 블록을 못 찾음 — Expo 템플릿이 바뀐 것 같다.'
      );
    }
    // 윈도우는 이제 SceneDelegate가 만든다 — AppDelegate에서는 factory/delegate만 준비한다.
    contents = contents.replace(windowCreationBlockRegex, '');

    const superCallAnchor =
      'return super.application(application, didFinishLaunchingWithOptions: launchOptions)\n  }';
    if (!contents.includes(superCallAnchor)) {
      throw new Error(
        'withIosSceneDelegate: AppDelegate.swift에서 didFinishLaunchingWithOptions의 super 호출을 못 찾음.'
      );
    }
    contents = contents.replace(
      superCallAnchor,
      `${superCallAnchor}\n\n  // iOS 27+ UIScene lifecycle 필수 — SceneDelegate에 연결 설정을 알려준다.\n  func application(\n    _ application: UIApplication,\n    configurationForConnecting connectingSceneSession: UISceneSession,\n    options: UIScene.ConnectionOptions\n  ) -> UISceneConfiguration {\n    let configuration = UISceneConfiguration(\n      name: "Default Configuration", sessionRole: connectingSceneSession.role)\n    configuration.delegateClass = SceneDelegate.self\n    return configuration\n  }`
    );

    contents += `\n
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene, willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else { return }

    // 콜드 스타트 딥링크 — UIScene 수명주기에선 앱을 띄운 URL이 launchOptions[.url]이 아니라
    // connectionOptions.urlContexts로 온다. RN의 Linking.getInitialURL()은 launchOptions[.url]을
    // 읽으므로 여기서 옮겨 심어 준다(안 하면 mallo:// 링크로 앱을 켜도 JS가 URL을 못 본다).
    var launchOptions = appDelegate.launchOptions ?? [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
    }
    let window = UIWindow(windowScene: windowScene)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
    self.window = window
  }

  // 실행 중 딥링크 — AppDelegate.application(_:open:)은 UIScene 앱에선 호출되지 않는다.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      _ = RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  // 유니버설 링크(https://…) — 같은 이유로 SceneDelegate에서 받아 RN에 넘긴다.
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = RCTLinkingManager.application(UIApplication.shared, continue: userActivity) { _ in }
  }
}
`;

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withIosSceneDelegate;
