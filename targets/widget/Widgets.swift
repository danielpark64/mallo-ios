import AppIntents
import SwiftUI
import WidgetKit

// ─── 타임라인: 지금 + 다음 24시간 안의 일정 시각마다 + 자정 ─────────────────────
// 시간이 지나면 위젯이 스스로 지난 일정을 빼고 오늘 표시를 옮긴다. 일정이 바뀌면 앱이 바로 다시 그리게 한다.
// 주기적 갱신(폴링)은 없다.
struct Entry: TimelineEntry {
  let date: Date
  let payload: Payload?
  let page: Int
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry { Entry(date: Date(), payload: nil, page: 0) }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    completion(Entry(date: Date(), payload: Payload.load(), page: currentPage()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    let now = Date()
    let p = Payload.load()
    let page = currentPage()
    let midnight = Calendar.current.startOfDay(for: now).addingTimeInterval(86_400)
    var dates: [Date] = [now]
    if let p {
      let t = now.timeIntervalSince1970 * 1000
      let times = p.items.filter { $0.timed && $0.at > t }.map { Date(timeIntervalSince1970: $0.at / 1000 + 1) }
      dates += times.filter { $0 < midnight }.prefix(30)
    }
    dates.append(midnight.addingTimeInterval(1))
    completion(Timeline(entries: dates.map { Entry(date: $0, payload: p, page: page) }, policy: .atEnd))
  }

  private func currentPage() -> Int { UserDefaults(suiteName: Payload.group)?.integer(forKey: Payload.pageKey) ?? 0 }
}

// ─── ▲▼ 목록 넘기기 (iOS 17+ 인터랙티브 위젯) ─────────────────────────────────
@available(iOS 17.0, *)
struct PageIntent: AppIntent {
  static var title: LocalizedStringResource = "Page"
  static var isDiscoverable: Bool = false
  // 더하기가 아니라 갈 쪽 번호를 받는다 — 여러 번 눌러도 마지막 쪽을 넘지 않게(그리는 쪽에서도 다시 자른다)
  @Parameter(title: "Page") var page: Int
  init() {}
  init(page: Int) { self.page = page }
  func perform() async throws -> some IntentResult {
    UserDefaults(suiteName: Payload.group)?.set(max(0, page), forKey: Payload.pageKey)
    return .result()
  }
}

// ─── 색: 밝은·어두운 화면 ───────────────────────────────────────────────────────
enum Pal {
  static func dyn(_ light: UInt32, _ dark: UInt32) -> Color {
    Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
  }
  static let bg = dyn(0xFFFFFF, 0x1C1D24)
  static let text = dyn(0x1C1D24, 0xF2F2F5)
  static let sub = dyn(0x6B6E7A, 0x9A9AA5)
  static let accent = dyn(0xE25555, 0xEF6464)
  static let blue = dyn(0x2F6FE0, 0x7AA7FF)
  static let divider = dyn(0xE3E4EA, 0x3A3B46)
  static let button = dyn(0xEEEFF3, 0x2C2E3A)
  static let mic = Color(UIColor(hex: 0xEF6464))
}

extension UIColor {
  convenience init(hex: UInt32) {
    self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
  }
  /// "#RRGGBB" (근무 색)
  convenience init?(hexString: String) {
    var s = hexString
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
    self.init(hex: v)
  }
}

// ─── 링크: mallo://widget?… (lib/widget.ts parseWidgetUrl) ───────────────────
enum Links {
  static let app = URL(string: "mallo://")!
  static let mic = URL(string: "mallo://widget?a=mic")!
  static func record(_ id: String) -> URL {
    URL(string: "mallo://widget?id=" + (id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? id))!
  }
  static func day(_ d: Date) -> URL {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
    return URL(string: String(format: "mallo://widget?d=%04d-%02d-%02d", c.year!, c.month!, c.day!))!
  }
}

// 위젯 바탕: iOS 17부터는 containerBackground를 써야 여백·바탕이 맞는다
extension View {
  @ViewBuilder func widgetBg() -> some View {
    if #available(iOS 17.0, *) {
      self.containerBackground(Pal.bg, for: .widget)
    } else {
      self.padding(14).background(Pal.bg)
    }
  }
}

// ─── 작게: 바로 다음 일정 ─────────────────────────────────────────────────────
struct SmallView: View {
  let entry: Entry
  var body: some View {
    let list = entry.payload?.upcoming(entry.date) ?? []
    VStack(alignment: .leading, spacing: 2) {
      Text(entry.payload?.str.next ?? L.smallName).font(.system(size: 12)).foregroundColor(Pal.accent)
      if let first = list.first {
        Text(first.date).font(.system(size: 13)).foregroundColor(Pal.sub).lineLimit(1).padding(.top, 6)
        Text(first.time).font(.system(size: 20, weight: .bold)).foregroundColor(Pal.blue).lineLimit(1).minimumScaleFactor(0.7)
        Text(first.title).font(.system(size: 15)).foregroundColor(Pal.text).lineLimit(2)
        let day = Calendar.current.startOfDay(for: Date(timeIntervalSince1970: first.at / 1000))
        let more = list.dropFirst().filter { Calendar.current.startOfDay(for: Date(timeIntervalSince1970: $0.at / 1000)) == day }.count
        if more > 0, let p = entry.payload {
          Text(p.str.more.replacingOccurrences(of: "{n}", with: String(more))).font(.system(size: 12)).foregroundColor(Pal.sub).padding(.top, 2)
        }
      } else {
        Text(entry.payload?.str.empty ?? L.openApp).font(.system(size: 14)).foregroundColor(Pal.sub).padding(.top, 8)
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .widgetBg()
    .widgetURL(list.first.map { Links.record($0.id) } ?? Links.app)
  }
}

// ─── 목록 한 줄 ─────────────────────────────────────────────────────────────
struct ItemRow: View {
  let item: WidgetItem
  var body: some View {
    Link(destination: Links.record(item.id)) {
      HStack(spacing: 8) {
        Text(item.when).font(.system(size: 13)).foregroundColor(Pal.sub).lineLimit(1).fixedSize()
        Text(item.title).font(.system(size: 13.5)).foregroundColor(item.end != nil ? Pal.blue : Pal.text).lineLimit(1)
        Spacer(minLength: 0)
      }
      .frame(height: 21)
    }
  }
}

// ─── 중간: 일정 4개 + 마이크 ─────────────────────────────────────────────────
struct MediumView: View {
  let entry: Entry
  var body: some View {
    let list = entry.payload?.upcoming(entry.date) ?? []
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text(entry.payload?.str.upcoming ?? L.mediumName).font(.system(size: 12)).foregroundColor(Pal.accent).padding(.bottom, 2)
        if list.isEmpty {
          Text(entry.payload?.str.empty ?? L.openApp).font(.system(size: 14)).foregroundColor(Pal.sub).padding(.top, 4)
        }
        ForEach(list.prefix(4), id: \.self) { ItemRow(item: $0) }
        Spacer(minLength: 0)
      }
      Link(destination: Links.mic) {
        Image(systemName: "mic.fill").font(.system(size: 24)).foregroundColor(.white)
          .frame(width: 56, height: 56).background(Circle().fill(Pal.mic))
      }
    }
    .widgetBg()
    .widgetURL(Links.app)
  }
}

// ─── 크게: 이번 달(근무 첫 글자 + 일정 점) + 넘겨 보는 목록 ──────────────────────
struct LargeView: View {
  let entry: Entry

  var body: some View {
    let p = entry.payload
    let cal = Calendar.current
    let now = entry.date
    let comps = cal.dateComponents([.year, .month, .day], from: now)
    let first = cal.date(from: DateComponents(year: comps.year, month: comps.month, day: 1))!
    let lead = cal.component(.weekday, from: first) - 1
    let days = cal.range(of: .day, in: .month, for: first)!.count
    let weeks = (lead + days + 6) / 7
    let shifts = p?.hasShifts ?? false
    // 6주짜리 달은 목록 2개, 근무표가 없으면 칸이 낮아져 4개
    let perPage = weeks == 6 ? (shifts ? 2 : 3) : (shifts ? 3 : 4)
    let list = p?.upcoming(now) ?? []
    let pages = max(1, (list.count + perPage - 1) / perPage)
    let page = min(entry.page, pages - 1)
    let title = p?.months.first { $0.y == comps.year && $0.m == comps.month }?.title ?? "\(comps.year!).\(comps.month!)"
    let wd = p?.wd ?? ["S", "M", "T", "W", "T", "F", "S"]

    VStack(spacing: 0) {
      HStack {
        Link(destination: Links.app) {
          Text(title).font(.system(size: 15, weight: .bold)).foregroundColor(Pal.accent).lineLimit(1)
        }
        Spacer()
        Link(destination: Links.mic) {
          Image(systemName: "mic.fill").font(.system(size: 17)).foregroundColor(Pal.mic).frame(width: 30, height: 26)
        }
      }
      HStack(spacing: 0) {
        ForEach(0..<7, id: \.self) { i in
          Text(i < wd.count ? wd[i] : "").font(.system(size: 11))
            .foregroundColor(i == 0 ? Pal.accent : i == 6 ? Pal.blue : Pal.sub).frame(maxWidth: .infinity)
        }
      }
      .padding(.vertical, 3)
      VStack(spacing: 0) {
        ForEach(0..<weeks, id: \.self) { w in
          HStack(spacing: 0) {
            ForEach(0..<7, id: \.self) { c in
              let d = w * 7 + c - lead + 1
              if d >= 1 && d <= days {
                let date = cal.date(from: DateComponents(year: comps.year, month: comps.month, day: d))!
                Link(destination: Links.day(date)) {
                  DayCell(day: d, col: c, today: d == comps.day, payload: p, date: date, showSub: shifts || (p?.ev.contains(1) ?? false))
                }
                .frame(maxWidth: .infinity)
              } else {
                Color.clear.frame(maxWidth: .infinity)
              }
            }
          }
          .frame(height: shifts ? 31 : 27)
        }
      }
      Rectangle().fill(Pal.divider).frame(height: 0.5).padding(.top, 4).padding(.bottom, 4)
      HStack(alignment: .top, spacing: 6) {
        VStack(alignment: .leading, spacing: 0) {
          if list.isEmpty {
            Text(p?.str.empty ?? L.openApp).font(.system(size: 13)).foregroundColor(Pal.sub)
          }
          ForEach(Array(list.dropFirst(page * perPage).prefix(perPage)), id: \.self) { ItemRow(item: $0) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if pages > 1 {
          if #available(iOS 17.0, *) {
            VStack(spacing: 2) {
              Button(intent: PageIntent(page: page - 1)) { PageButton(name: "chevron.up", on: page > 0) }.buttonStyle(.plain).disabled(page == 0)
              Text("\(page + 1)/\(pages)").font(.system(size: 10)).foregroundColor(Pal.sub)
              Button(intent: PageIntent(page: page + 1)) { PageButton(name: "chevron.down", on: page < pages - 1) }.buttonStyle(.plain).disabled(page >= pages - 1)
            }
          }
        }
      }
      Spacer(minLength: 0)
    }
    .widgetBg()
  }
}

struct PageButton: View {
  let name: String
  let on: Bool
  var body: some View {
    Image(systemName: name).font(.system(size: 12, weight: .semibold))
      .foregroundColor(on ? Pal.text : Pal.sub.opacity(0.5))
      .frame(width: 26, height: 26).background(Circle().fill(Pal.button))
  }
}

struct DayCell: View {
  let day: Int
  let col: Int
  let today: Bool
  let payload: Payload?
  let date: Date
  let showSub: Bool

  var body: some View {
    VStack(spacing: 1) {
      Text("\(day)").font(.system(size: 12.5, weight: today ? .bold : .regular))
        .foregroundColor(today ? .white : col == 0 ? Pal.accent : col == 6 ? Pal.blue : Pal.text)
        .frame(width: 20, height: 20)
        .background(Circle().fill(today ? Pal.mic : Color.clear))
      if showSub { sub.font(.system(size: 10)).lineLimit(1).frame(height: 10) }
    }
  }

  private var sub: Text {
    guard let p = payload, let i = p.index(of: date) else { return Text(" ") }
    var t = Text("")
    let s = p.shift[i]
    if s >= 0 && s < p.shifts.count {
      let k = p.shifts[s]
      t = t + Text(k.s).foregroundColor(Color(UIColor(hexString: k.c) ?? .gray))
    }
    if p.ev[i] == 1 { t = t + Text("•").foregroundColor(Pal.blue) }
    return t
  }
}

// ─── 위젯 세 종류 ─────────────────────────────────────────────────────────────
struct SmallWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "SayramSmall", provider: Provider()) { SmallView(entry: $0) }
      .configurationDisplayName(L.smallName)
      .description(L.smallDesc)
      .supportedFamilies([.systemSmall])
  }
}

struct MediumWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "SayramMedium", provider: Provider()) { MediumView(entry: $0) }
      .configurationDisplayName(L.mediumName)
      .description(L.mediumDesc)
      .supportedFamilies([.systemMedium])
  }
}

struct LargeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "SayramLarge", provider: Provider()) { LargeView(entry: $0) }
      .configurationDisplayName(L.largeName)
      .description(L.largeDesc)
      .supportedFamilies([.systemLarge])
  }
}

@main
struct SayramWidgets: WidgetBundle {
  var body: some Widget {
    SmallWidget()
    MediumWidget()
    LargeWidget()
  }
}
