import ExpoModulesCore
import UIKit

// 세이람 ↔ 교대알람 기기 안 공유 — iOS(App Group "group.com.danielpark.shared").
// 두 앱이 같은 공유 폴더를 직접 읽고 쓴다. 파일을 읽어도 상대 앱이 실행되지 않으므로(Android와 달리)
// 넣어 주기(push)·가져오기(pull) 없이 열 때 바로 읽으면 된다 — 부하 없음.
//   <공유 폴더>/sayram/events.json·config.json     — 세이람이 쓴다(교대알람이 읽음)
//   <공유 폴더>/alarmapp/shifts.json·config.json   — 교대알람이 쓴다(세이람이 읽음)
// JS(lib/siblingShare.ts)는 Android와 같은 함수 이름을 쓴다.
public class SayramShareModule: Module {
  private static let groupId = "group.com.danielpark.shared"
  private static let mine = "sayram"
  private static let sibling = "alarmapp"
  private static let ownNames: Set<String> = ["events", "config"]
  private static let siblingNames: Set<String> = ["shifts", "config"]

  private func dir(_ who: String) -> URL? {
    guard let base = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.groupId) else { return nil }
    let d = base.appendingPathComponent(who, isDirectory: true)
    try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
    return d
  }

  public func definition() -> ModuleDefinition {
    Name("SayramShare")

    // 내 데이터 쓰기(임시 파일에 쓰고 바꿔치기 — 상대가 반쯤 쓴 파일을 읽지 않게)
    Function("writeOwn") { (name: String, json: String) in
      guard Self.ownNames.contains(name), let d = self.dir(Self.mine) else { return }
      try? json.data(using: .utf8)?.write(to: d.appendingPathComponent("\(name).json"), options: .atomic)
    }

    // 교대알람이 쓴 데이터 읽기
    Function("readInbox") { (name: String) -> String? in
      guard Self.siblingNames.contains(name), let d = self.dir(Self.sibling) else { return nil }
      return try? String(contentsOf: d.appendingPathComponent("\(name).json"), encoding: .utf8)
    }

    // iOS는 공유 폴더를 직접 읽으니 넣어 주기가 필요 없다
    AsyncFunction("pushToSibling") { (_: String, _: String) -> String in
      return "same"
    }

    // 가져오기 = 공유 폴더 읽기(상대 앱을 깨우지 않는다)
    AsyncFunction("pullToInbox") { (_: String, name: String) -> String? in
      guard Self.siblingNames.contains(name), let d = self.dir(Self.sibling) else { return nil }
      return try? String(contentsOf: d.appendingPathComponent("\(name).json"), encoding: .utf8)
    }

    // 교대알람 설치 여부 — 교대알람의 URL scheme(alarmapp://)을 열 수 있는지(Info.plist LSApplicationQueriesSchemes에 alarmapp).
    // canOpenURL은 메인 스레드에서만 — JS 스레드가 메인을 무한정 기다리지 않게 최대 0.3초만 기다린다(드문 교착 방지).
    // 시간이 지나면 공유 폴더의 교대알람 파일(<그룹>/alarmapp/config.json)이 있는지로 대신 판단.
    Function("isInstalled") { (pkg: String) -> Bool in
      guard pkg == "com.danielpark.alarmapp", let url = URL(string: "alarmapp://") else { return false }
      if Thread.isMainThread { return UIApplication.shared.canOpenURL(url) }
      var result = false
      let done = DispatchSemaphore(value: 0)
      DispatchQueue.main.async {
        result = UIApplication.shared.canOpenURL(url)
        done.signal()
      }
      if done.wait(timeout: .now() + 0.3) == .timedOut {
        // 시간 안에 못 물어봤으면 공유 폴더에 교대알람 파일이 있는지로 대신 판단한다
        // (JS가 실행당 한 번만 묻고 기억하므로, 잘못된 false로 그 실행 내내 공유가 끊기지 않게)
        guard let d = self.dir(Self.sibling) else { return false }
        return FileManager.default.fileExists(atPath: d.appendingPathComponent("config.json").path)
      }
      return result
    }
  }
}
