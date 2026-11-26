import ExpoModulesCore
import Foundation
import SwiftUI
#if canImport(AlarmKit)
import AlarmKit
import ActivityKit
#endif

// iOS 26+ AlarmKit 예약 — 무음·집중 모드에서도 시계 앱처럼 전체 화면으로 울린다(교대알람 fcc8938에서 옮김).
// 경로 결정은 JS(lib/alarmkitRoute.ts), 호출은 lib/alarmkit.ts(직렬 큐) → lib/notifications.ts만 부른다.
// 원장: UserDefaults "sayram_alarmkit_ledger_v1" = [예약 UUID: ["key": 슬롯 식별자, "recordId": …, "base": 원래 일정 id, "snz": "1"(JS 스누즈 슬롯만)]]
// ⚠️ 메타데이터 타입 이름은 위젯 확장(targets/widget/AlarmLiveActivity.swift)과 반드시 같아야 한다.
// [5분 후 다시](1.2.4): snoozeMin을 주면 울림 화면에 두 번째 버튼이 붙고, 누르면 시스템이 그 분만큼 카운트다운한 뒤 다시 울린다
// (교대알람 AlarmappAlarmKitModule.swift에서 옮김). 카운트다운 중에도 같은 예약 UUID라 원장으로 취소된다(cancelForRecord·cancelKeys).

struct ScheduleOptions: Record {
  @Field var id: String = ""
  @Field var key: String = ""
  @Field var recordId: String = ""
  @Field var baseRecordId: String = ""
  @Field var fireMs: Double = 0
  @Field var title: String = ""
  @Field var stopText: String = ""
  // 앱 번들 소리 파일 이름(alarm_long.wav 또는 고른 소리 snd_<id>.caf). 비면 기본 소리
  @Field var sound: String = ""
  // [5분 후 다시] 버튼 글자·간격(분). 0이면 버튼 없음(끄기만)
  @Field var snoozeText: String = ""
  @Field var snoozeMin: Int = 0
  // JS가 "5분 후 다시"로 다시 건 슬롯인지 — 재동기화(cancelAll)가 지우지 않고 남긴다(1.2.4 버그 31)
  @Field var snooze: Bool = false
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct SayramAlarmMetadata: AlarmMetadata {}
#endif

private let ledgerKey = "sayram_alarmkit_ledger_v1"
private func loadLedger() -> [String: [String: String]] {
  UserDefaults.standard.dictionary(forKey: ledgerKey) as? [String: [String: String]] ?? [:]
}
private func saveLedger(_ l: [String: [String: String]]) { UserDefaults.standard.set(l, forKey: ledgerKey) }

public class SayramAlarmKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SayramAlarmKit")

    Function("isAvailable") { () -> Bool in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) { return true }
      #endif
      return false
    }

    Function("authorizationState") { () -> String in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) { return Self.authString(AlarmManager.shared.authorizationState) }
      #endif
      return "unavailable"
    }

    AsyncFunction("requestAuthorization") { () async -> String in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        let s = (try? await AlarmManager.shared.requestAuthorization()) ?? AlarmManager.shared.authorizationState
        return Self.authString(s)
      }
      #endif
      return "unavailable"
    }

    AsyncFunction("schedule") { (o: ScheduleOptions) async -> Bool in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) { return await Self.schedule(o) }
      #endif
      return false
    }

    // 슬롯 식별자(notifIds)로 취소
    AsyncFunction("cancelKeys") { (keys: [String]) -> Int in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        let want = Set(keys)
        return Self.cancelWhere { want.contains($0["key"] ?? "") }
      }
      #endif
      return 0
    }

    // recordId(정각: 일정 id, 미리 알림: id#pre분)로 취소 — Android cancelByRecordId와 같은 규칙
    AsyncFunction("cancelForRecord") { (recordId: String) -> Int in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        return Self.cancelWhere { $0["recordId"] == recordId }
      }
      #endif
      return 0
    }

    // 원장 + AlarmKit이 알고 있는 이 앱의 예약 전부를 지운다(재동기화). 단 keepBaseRecordIds(남아 있고 결과 표시가 없는 일정)에 속한
    //  - 지금 울리는 중이거나 [5분 후 다시] 카운트다운 중인 것(.scheduled가 아님) — 울림·스누즈가 끊기지 않게
    //  - JS가 "5분 후 다시"로 건 슬롯("snz") — 단 정각 스누즈인데 그 일정이 rearmBaseRecordIds(앞으로의 정각으로 다시 걸림)면 지운다
    // 은 남긴다(1.2.4 버그 31, lib/snoozeKeep.ts와 같은 규칙).
    AsyncFunction("cancelAll") { (keepBaseRecordIds: [String], rearmBaseRecordIds: [String]) -> Int in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        let keep = Set(keepBaseRecordIds)
        let rearm = Set(rearmBaseRecordIds)
        let ledger = loadLedger()
        var kept: [String: [String: String]] = [:]
        var n = 0
        let live = (try? AlarmManager.shared.alarms) ?? []
        var seen = Set<String>()
        for a in live {
          let k = a.id.uuidString
          seen.insert(k)
          if let e = ledger[k], let base = e["base"], keep.contains(base) {
            if a.state != .scheduled { kept[k] = e; continue }
            if e["snz"] == "1" && !(e["recordId"] == base && rearm.contains(base)) { kept[k] = e; continue }
          }
          try? AlarmManager.shared.cancel(id: a.id); n += 1
        }
        for k in ledger.keys where !seen.contains(k) {
          if let u = UUID(uuidString: k) { try? AlarmManager.shared.cancel(id: u) }
        }
        saveLedger(kept)
        return n
      }
      #endif
      return 0
    }

    AsyncFunction("listScheduled") { () -> [[String: Any]] in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        let ledger = loadLedger()
        let live = (try? AlarmManager.shared.alarms) ?? []
        return live.map { a in
          var when: Any = NSNull()
          if case .fixed(let d)? = a.schedule { when = d.timeIntervalSince1970 * 1000 }
          let e = ledger[a.id.uuidString] ?? [:]
          return ["id": a.id.uuidString, "key": e["key"] ?? "", "recordId": e["recordId"] ?? "", "state": "\(a.state)", "when": when]
        }
      }
      #endif
      return []
    }
  }

  #if canImport(AlarmKit)
  @available(iOS 26.0, *)
  static func authString(_ s: AlarmManager.AuthorizationState) -> String {
    switch s {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "denied"
    }
  }

  // 원장에서 조건에 맞는 예약을 AlarmKit·원장 둘 다에서 지운다
  @available(iOS 26.0, *)
  static func cancelWhere(_ match: ([String: String]) -> Bool) -> Int {
    var ledger = loadLedger()
    let ids = ledger.filter { match($0.value) }.map { $0.key }
    for k in ids {
      if let u = UUID(uuidString: k) { try? AlarmManager.shared.cancel(id: u) }
      ledger.removeValue(forKey: k)
    }
    saveLedger(ledger)
    return ids.count
  }

  private static func text(_ s: String) -> LocalizedStringResource {
    LocalizedStringResource(String.LocalizationValue(s))
  }

  @available(iOS 26.0, *)
  static func schedule(_ o: ScheduleOptions) async -> Bool {
    guard AlarmManager.shared.authorizationState == .authorized, let uuid = UUID(uuidString: o.id) else { return false }
    let fire = Date(timeIntervalSince1970: o.fireMs / 1000)
    guard fire > Date() else { return false }

    // 세이람 파랑(lib/colors.ts accent)
    let accent = Color(red: 0x3D / 255.0, green: 0x8B / 255.0, blue: 0xFF / 255.0)
    // [5분 후 다시] = 스누즈 분이 있을 때만. 누르면 시스템이 그 분만큼 카운트다운 뒤 다시 울린다(.countdown) — 교대알람과 같은 구조
    let snoozeButton: AlarmButton? = o.snoozeMin > 0
      ? AlarmButton(text: text(o.snoozeText), textColor: .white, systemImageName: "repeat") : nil
    let behavior: AlarmPresentation.Alert.SecondaryButtonBehavior? = snoozeButton != nil ? .countdown : nil
    let alert: AlarmPresentation.Alert
    if #available(iOS 26.1, *) {
      alert = .init(title: text(o.title), secondaryButton: snoozeButton, secondaryButtonBehavior: behavior)
    } else {
      // iOS 26.0은 끄기 버튼을 직접 줘야 한다(26.1부터 시스템이 그린다)
      let stop = AlarmButton(text: text(o.stopText), textColor: .white, systemImageName: "stop.circle")
      alert = .init(title: text(o.title), stopButton: stop, secondaryButton: snoozeButton, secondaryButtonBehavior: behavior)
    }
    // 카운트다운 중에는 잠금 화면·Dynamic Island에 남은 시간이 보인다(targets/widget/AlarmLiveActivity.swift)
    let presentation = snoozeButton != nil
      ? AlarmPresentation(alert: alert, countdown: .init(title: text(o.title)))
      : AlarmPresentation(alert: alert)
    let attributes = AlarmAttributes<SayramAlarmMetadata>(
      presentation: presentation, metadata: SayramAlarmMetadata(), tintColor: accent)
    let countdown = snoozeButton != nil ? Alarm.CountdownDuration(preAlert: nil, postAlert: TimeInterval(o.snoozeMin * 60)) : nil
    // 소리: 앱 번들 파일 — 기본 alarm_long.wav(expo-notifications 플러그인), 고른 소리 snd_<id>.caf(plugins/withIosAlarmSounds.js)
    // 번들에 없는 이름이면(옛 빌드 등) 기본 소리로 — 소리 없이 울리지 않게
    let soundName = (!o.sound.isEmpty && Bundle.main.url(forResource: o.sound, withExtension: nil) != nil) ? o.sound : "alarm_long.wav"
    let config = AlarmManager.AlarmConfiguration<SayramAlarmMetadata>(
      countdownDuration: countdown, schedule: .fixed(fire), attributes: attributes, sound: .named(soundName))

    // 같은 UUID가 이미 있으면 덮어쓴다(겹쳐 돈 재예약이 같은 슬롯을 두 번 걸지 않게)
    try? AlarmManager.shared.cancel(id: uuid)
    do {
      _ = try await AlarmManager.shared.schedule(id: uuid, configuration: config)
      var ledger = loadLedger()
      var entry = ["key": o.key, "recordId": o.recordId, "base": o.baseRecordId]
      if o.snooze { entry["snz"] = "1" }
      ledger[o.id] = entry
      saveLedger(ledger)
      return true
    } catch {
      NSLog("[AlarmKit] 예약 실패 %@: %@", o.id, String(describing: error))
      return false
    }
  }
  #endif
}
