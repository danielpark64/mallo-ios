import ExpoModulesCore
import Foundation

/// 일정 녹음 앞부분(내 목소리)을 iOS 로컬 알림 소리로 만드는 모듈.
/// iOS 알림 소리는 앱 번들 또는 Library/Sounds 안의 30초 이하 wav/caf 만 쓸 수 있어
/// m4a 녹음을 Library/Sounds/<name>.wav 로 변환해 둔다.
public class MalloVoiceSoundModule: Module {
  private static let prefix = "voice_"

  public func definition() -> ModuleDefinition {
    Name("MalloVoiceSound")

    // AsyncFunction 은 메인 스레드가 아닌 백그라운드 큐에서 실행된다.
    AsyncFunction("makeSound") { (srcUri: String, name: String, maxVoiceSec: Double?) -> String in
      let out = try Self.soundURL(name)
      guard let src = Self.fileURL(srcUri), FileManager.default.fileExists(atPath: src.path) else {
        throw VoiceSoundException("녹음 파일을 찾을 수 없습니다: \(srcUri)")
      }
      try FileManager.default.createDirectory(
        at: Self.soundsDir(), withIntermediateDirectories: true)
      let intro = Bundle.main.url(forResource: "alarm_long", withExtension: "wav")
      do {
        try VoiceSoundBuilder.build(
          voiceURL: src, introURL: intro, outURL: out,
          maxVoiceSec: maxVoiceSec ?? VoiceSoundBuilder.defaultVoiceSec)
      } catch {
        throw VoiceSoundException(error.localizedDescription)
      }
      return out.lastPathComponent
    }

    Function("removeSound") { (name: String) in
      guard let url = try? Self.soundURL(name) else { return }
      try? FileManager.default.removeItem(at: url)
    }

    Function("pruneSounds") { (keepNames: [String]) in
      let keep = Set(keepNames)
      let dir = Self.soundsDir()
      let files = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
      for f in files where f.hasPrefix(Self.prefix) && f.hasSuffix(".wav") {
        let base = String(f.dropLast(4))
        if !keep.contains(base) {
          try? FileManager.default.removeItem(at: dir.appendingPathComponent(f))
        }
      }
    }

    Function("hasSound") { (name: String) -> Bool in
      guard let url = try? Self.soundURL(name) else { return false }
      return FileManager.default.fileExists(atPath: url.path)
    }
  }

  private static func soundsDir() -> URL {
    let lib = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
    return lib.appendingPathComponent("Sounds", isDirectory: true)
  }

  /// 이름은 파일 이름으로만 쓰이도록 영문·숫자·_·- 만 허용(경로 탈출 방지).
  private static func soundURL(_ name: String) throws -> URL {
    let ok = !name.isEmpty && name.count <= 120 && name.unicodeScalars.allSatisfy {
      ($0.isASCII && CharacterSet.alphanumerics.contains($0)) || $0 == "_" || $0 == "-"
    }
    guard ok else { throw VoiceSoundException("쓸 수 없는 소리 이름입니다: \(name)") }
    return soundsDir().appendingPathComponent(name + ".wav")
  }

  private static func fileURL(_ uri: String) -> URL? {
    if uri.hasPrefix("file://") { return URL(string: uri) ?? URL(fileURLWithPath: String(uri.dropFirst(7))) }
    if uri.hasPrefix("/") { return URL(fileURLWithPath: uri) }
    return nil
  }
}

internal final class VoiceSoundException: GenericException<String>, @unchecked Sendable {
  override var reason: String { param }
}
