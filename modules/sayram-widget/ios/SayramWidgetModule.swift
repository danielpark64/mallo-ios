import ExpoModulesCore
import WidgetKit

/// JS(lib/widget.ts)에서 위젯 요약을 받아 App Group에 두고 위젯(targets/widget)을 다시 그리게 한다.
/// 같은 내용이면 아무것도 안 한다 — 앱이 앞으로 올 때마다 불러도 위젯을 괜히 다시 그리지 않게.
public class SayramWidgetModule: Module {
  static let group = "group.com.danielpark.shared"
  static let dataKey = "sayram.widget"
  static let pageKey = "sayram.widget.page"

  public func definition() -> ModuleDefinition {
    Name("SayramWidget")

    AsyncFunction("setData") { (json: String) in
      guard let d = UserDefaults(suiteName: Self.group) else { return }
      if d.string(forKey: Self.dataKey) == json { return }
      d.set(json, forKey: Self.dataKey)
      d.set(0, forKey: Self.pageKey) // 내용이 바뀌면 목록은 첫 쪽부터
      WidgetCenter.shared.reloadAllTimelines()
    }

    // iOS는 최근 앱에서 다시 열어도 옛 링크가 다시 오지 않는다
    Function("launchedFromHistory") { () -> Bool in false }
  }
}
