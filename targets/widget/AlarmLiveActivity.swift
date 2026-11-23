import SwiftUI
import WidgetKit
#if canImport(AlarmKit)
import AlarmKit
import ActivityKit

// iOS 26+ AlarmKit 알람의 잠금 화면·Dynamic Island 표시(교대알람 fcc8938에서 옮김).
// Apple 문서: AlarmKit을 쓰는 앱은 위젯 확장에 AlarmAttributes용 ActivityConfiguration을 두어야 한다
// (카운트다운 등 시스템이 Live Activity를 띄울 때 없으면 알람이 닫힐 수 있다). 울림 화면(끄기) 자체는 시스템이 그린다.
// ⚠️ 메타데이터 타입 이름은 앱 모듈(modules/sayram-alarmkit/ios/SayramAlarmKitModule.swift)과 반드시 같아야 한다.
@available(iOS 26.0, *)
struct SayramAlarmMetadata: AlarmMetadata {}

@available(iOS 26.0, *)
struct AlarmLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: AlarmAttributes<SayramAlarmMetadata>.self) { context in
      HStack(spacing: 12) {
        Image(systemName: "alarm.fill").font(.title2).foregroundStyle(context.attributes.tintColor)
        VStack(alignment: .leading, spacing: 2) {
          Text(title(context.attributes, context.state)).font(.headline).lineLimit(1)
          remaining(context.state).font(.title3.monospacedDigit())
        }
        Spacer()
      }
      .padding()
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: "alarm.fill").foregroundStyle(context.attributes.tintColor)
        }
        DynamicIslandExpandedRegion(.center) {
          Text(title(context.attributes, context.state)).lineLimit(1)
        }
        DynamicIslandExpandedRegion(.trailing) {
          remaining(context.state).monospacedDigit()
        }
      } compactLeading: {
        Image(systemName: "alarm.fill").foregroundStyle(context.attributes.tintColor)
      } compactTrailing: {
        remaining(context.state).monospacedDigit().frame(maxWidth: 52)
      } minimal: {
        Image(systemName: "alarm.fill").foregroundStyle(context.attributes.tintColor)
      }
    }
  }

  private func title(_ a: AlarmAttributes<SayramAlarmMetadata>, _ s: AlarmPresentationState) -> LocalizedStringResource {
    switch s.mode {
    case .countdown: return a.presentation.countdown?.title ?? a.presentation.alert.title
    case .paused: return a.presentation.paused?.title ?? a.presentation.alert.title
    default: return a.presentation.alert.title
    }
  }

  @ViewBuilder
  private func remaining(_ s: AlarmPresentationState) -> some View {
    switch s.mode {
    case .countdown(let c):
      Text(timerInterval: Date.now...max(Date.now, c.fireDate), countsDown: true)
    case .alert(let a):
      Text(String(format: "%02d:%02d", a.time.hour, a.time.minute))
    default:
      Text("")
    }
  }
}
#endif
