import ExpoModulesCore
import Foundation

// 새 버전 안내(교대알람 1.6.3에서 그대로 가져옴, 세이람 1.2.3) — JS(lib/appUpdateNative.ts)가 쓰는 함수. Android(AppUpdateModule.kt)와 같은 이름:
//  getInstalledVersion()  — 깔린 판 { version: CFBundleShortVersionString, build: CFBundleVersion }
//  getRegion()            — 기기 지역(2글자, 예 "KR") — App Store 조회의 country. 기기 안에서만 읽는다
// 조회(itunes lookup)는 JS가 한다. 이 모듈은 어디에도 접속하지 않는다. 앱에 묶인 값이 없어 다른 앱에 그대로 복사한다.
public class AppUpdateModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppUpdate")

    Function("getInstalledVersion") { () -> [String: String] in
      let info = Bundle.main.infoDictionary ?? [:]
      return [
        "version": info["CFBundleShortVersionString"] as? String ?? "",
        "build": info["CFBundleVersion"] as? String ?? "",
      ]
    }

    Function("getRegion") { () -> String? in
      if #available(iOS 16, *) {
        return Locale.current.region?.identifier
      }
      return Locale.current.regionCode
    }
  }
}
