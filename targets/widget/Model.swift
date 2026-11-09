import Foundation

/// 앱이 App Group에 둔 위젯 요약(lib/widgetData.ts의 WidgetPayload)
struct WidgetItem: Codable, Hashable {
  let id: String
  let at: Double
  let end: Double?
  let timed: Bool
  let title: String
  let when: String
  let date: String
  let time: String
}

struct ShiftKind: Codable, Hashable {
  let s: String
  let c: String
}

struct MonthName: Codable, Hashable {
  let y: Int
  let m: Int
  let title: String
}

struct Strings: Codable, Hashable {
  let next: String
  let upcoming: String
  let empty: String
  let more: String
}

struct Payload: Codable, Hashable {
  let from: String
  let shift: [Int]
  let ev: [Int]
  let shifts: [ShiftKind]
  let months: [MonthName]
  let wd: [String]
  let items: [WidgetItem]
  let str: Strings

  static let group = "group.com.danielpark.shared"
  static let dataKey = "sayram.widget"
  static let pageKey = "sayram.widget.page"

  static func load() -> Payload? {
    guard let s = UserDefaults(suiteName: group)?.string(forKey: dataKey), let d = s.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(Payload.self, from: d)
  }

  /// days 배열 첫날(이번 달 1일) 0시
  var fromDate: Date? {
    let p = from.split(separator: "-").compactMap { Int($0) }
    guard p.count == 3 else { return nil }
    return Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
  }

  /// 그날의 days 번호(범위 밖이면 nil)
  func index(of day: Date) -> Int? {
    guard let f = fromDate else { return nil }
    let n = Calendar.current.dateComponents([.day], from: f, to: Calendar.current.startOfDay(for: day)).day ?? -1
    return n >= 0 && n < ev.count ? n : nil
  }

  /// 지금 기준 다가오는 일정 — 시각 있는 일정은 그 시각이 지나면, 나머지는 그날(기간은 끝나는 날)이 지나면 빠진다. 30일 안
  func upcoming(_ now: Date) -> [WidgetItem] {
    let today = Calendar.current.startOfDay(for: now).timeIntervalSince1970 * 1000
    let until = today + 30 * 86_400_000
    let t = now.timeIntervalSince1970 * 1000
    return items.filter { ($0.timed ? $0.at > t : ($0.end ?? $0.at) >= today) && $0.at < until }
  }

  var hasShifts: Bool { shift.contains { $0 >= 0 } }
}

/// 위젯 고르는 화면의 이름·설명(9개 언어). 위젯 안 문구는 앱이 요약에 담아 보낸다
enum L {
  static var lang: String {
    let p = Locale.preferredLanguages.first ?? "en"
    if p.hasPrefix("zh-Hant") || p.hasPrefix("zh-TW") || p.hasPrefix("zh-HK") { return "zh-Hant" }
    if p.hasPrefix("zh") { return "zh-Hans" }
    return String(p.prefix(2))
  }
  private static func pick(_ t: [String: String]) -> String { t[lang] ?? t["en"]! }

  static var smallName: String { pick(["ko": "다음 일정", "en": "Next schedule", "ja": "次の予定", "zh-Hans": "下一个日程", "zh-Hant": "下一個行程", "es": "Siguiente", "fr": "Suivant", "de": "Als Nächstes", "pt": "Próximo"]) }
  static var smallDesc: String { pick(["ko": "바로 다음 일정을 크게 보여 줘요", "en": "Your next schedule at a glance", "ja": "すぐ次の予定を大きく表示", "zh-Hans": "醒目显示下一个日程", "zh-Hant": "醒目顯示下一個行程", "es": "Tu próxima cita de un vistazo", "fr": "Votre prochain rendez-vous en un coup d’œil", "de": "Ihr nächster Termin auf einen Blick", "pt": "Seu próximo compromisso em destaque"]) }
  static var mediumName: String { pick(["ko": "다가오는 일정", "en": "Upcoming", "ja": "これからの予定", "zh-Hans": "即将到来", "zh-Hant": "即將到來", "es": "Próximos", "fr": "À venir", "de": "Demnächst", "pt": "Próximos"]) }
  static var mediumDesc: String { pick(["ko": "다가오는 일정과 말하기 버튼", "en": "Upcoming schedules and a mic button", "ja": "これからの予定と話すボタン", "zh-Hans": "即将到来的日程和语音按钮", "zh-Hant": "即將到來的行程和語音按鈕", "es": "Próximas citas y botón de micrófono", "fr": "Rendez-vous à venir et bouton micro", "de": "Anstehende Termine und Mikrofon-Taste", "pt": "Próximos compromissos e botão de microfone"]) }
  static var largeName: String { pick(["ko": "이번 달과 일정", "en": "Month and schedules", "ja": "今月と予定", "zh-Hans": "本月与日程", "zh-Hant": "本月與行程", "es": "Mes y citas", "fr": "Mois et rendez-vous", "de": "Monat und Termine", "pt": "Mês e compromissos"]) }
  static var largeDesc: String { pick(["ko": "근무가 보이는 이번 달 달력과 다가오는 일정", "en": "This month with shifts, plus upcoming schedules", "ja": "勤務が見える今月のカレンダーとこれからの予定", "zh-Hans": "显示班次的本月日历和即将到来的日程", "zh-Hant": "顯示班次的本月月曆和即將到來的行程", "es": "Este mes con turnos y las próximas citas", "fr": "Ce mois avec les postes et les rendez-vous à venir", "de": "Dieser Monat mit Schichten und anstehenden Terminen", "pt": "Este mês com turnos e os próximos compromissos"]) }
  static var openApp: String { pick(["ko": "세이람을 열어 주세요", "en": "Open SayRam", "ja": "SayRamを開いてください", "zh-Hans": "请打开 SayRam", "zh-Hant": "請開啟 SayRam", "es": "Abre SayRam", "fr": "Ouvrez SayRam", "de": "SayRam öffnen", "pt": "Abra o SayRam"]) }
}
