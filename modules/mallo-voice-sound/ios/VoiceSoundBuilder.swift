// [VOICE_ALARM] 보류된 기능 — 지금은 앱에 링크되지 않는다(README.md 참고)
import AVFoundation
import Foundation

/// 녹음(m4a 등)을 iOS 로컬 알림 소리로 쓸 수 있는 wav 로 바꾸는 순수 변환 로직.
/// Expo 에 의존하지 않으므로 macOS 에서도 그대로 컴파일해 검증할 수 있다.
///
/// 출력: 모노 · Int16 Linear PCM · 44100Hz · 전체 28초 이하
/// 구성: [알람음 앞 3초(끝 0.2초 페이드아웃)] + [목소리] + [0.6초 무음] + [목소리 한 번 더]
enum VoiceSoundBuilder {
  static let sampleRate: Double = 44100
  /// iOS 알림 소리 한도는 30초 — 여유를 두고 28초로 자른다.
  static let maxTotalSec: Double = 28
  static let introSec: Double = 3
  static let introFadeSec: Double = 0.2
  static let gapSec: Double = 0.6
  static let defaultVoiceSec: Double = 10
  /// 목소리 피크 정규화 목표와 증폭 상한(조용한 녹음의 잡음까지 키우지 않도록).
  static let targetPeak: Float = 0.9
  static let maxGain: Float = 8
  /// 목소리 앞뒤 딸깍 소리를 막는 짧은 페이드.
  static let edgeFadeSec: Double = 0.01

  enum BuildError: LocalizedError {
    case emptyVoice
    case convert(String)

    var errorDescription: String? {
      switch self {
      case .emptyVoice: return "녹음에서 소리를 읽지 못했습니다"
      case .convert(let m): return "소리 변환 실패: \(m)"
      }
    }
  }

  /// voiceURL 의 앞부분으로 알림 소리를 만들어 outURL 에 쓴다(있으면 덮어씀).
  /// introURL 이 nil 이거나 읽지 못하면 목소리만 넣는다.
  /// 돌려주는 값은 만들어진 소리의 길이(초).
  @discardableResult
  static func build(voiceURL: URL, introURL: URL?, outURL: URL, maxVoiceSec: Double) throws -> Double {
    // 1) 알람음 앞부분(실패해도 목소리만으로 계속)
    var intro: [Float] = []
    if let introURL, let s = try? decodeMono(url: introURL, maxSec: introSec) {
      intro = s
      normalize(&intro)  // 원본 알람음이 작게 녹음돼 있어(피크 0.125) 목소리와 같은 크기로 맞춘다
      fadeOut(&intro, seconds: introFadeSec)
    }
    let introLen = Double(intro.count) / sampleRate

    // 2) 목소리 — 전체가 28초를 넘지 않도록 길이 상한을 다시 계산
    let requested = (maxVoiceSec.isFinite && maxVoiceSec > 0) ? maxVoiceSec : defaultVoiceSec
    let budget = max(0.5, (maxTotalSec - introLen - gapSec) / 2)
    let voiceSec = min(requested, budget)
    var voice = try decodeMono(url: voiceURL, maxSec: voiceSec)
    if voice.isEmpty { throw BuildError.emptyVoice }
    normalize(&voice)
    fadeIn(&voice, seconds: edgeFadeSec)
    fadeOut(&voice, seconds: edgeFadeSec)

    // 3) 이어 붙이기
    let gap = [Float](repeating: 0, count: Int(gapSec * sampleRate))
    var all: [Float] = []
    all.reserveCapacity(intro.count + voice.count * 2 + gap.count)
    all.append(contentsOf: intro)
    all.append(contentsOf: voice)
    all.append(contentsOf: gap)
    all.append(contentsOf: voice)
    let maxFrames = Int(maxTotalSec * sampleRate)
    if all.count > maxFrames { all.removeLast(all.count - maxFrames) }

    try writeWav(all, to: outURL)
    return Double(all.count) / sampleRate
  }

  // MARK: - 디코딩

  /// 파일 앞 maxSec 초를 모노 Float32 44100Hz 로 읽는다.
  static func decodeMono(url: URL, maxSec: Double) throws -> [Float] {
    let file = try AVAudioFile(forReading: url)
    let srcFormat = file.processingFormat
    guard srcFormat.sampleRate > 0, srcFormat.channelCount > 0 else {
      throw BuildError.convert("알 수 없는 입력 형식")
    }
    guard let dstFormat = AVAudioFormat(
      commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: 1, interleaved: false)
    else { throw BuildError.convert("출력 형식 생성 실패") }
    guard let converter = AVAudioConverter(from: srcFormat, to: dstFormat) else {
      throw BuildError.convert("변환기 생성 실패")
    }

    let wantFrames = Int(maxSec * sampleRate)
    // 입력에서 읽을 최대 프레임 수(리샘플러 여유분 포함)
    var srcRemaining = AVAudioFramePosition(maxSec * srcFormat.sampleRate) + 4096
    let chunk: AVAudioFrameCount = 16384
    var out: [Float] = []
    out.reserveCapacity(wantFrames)
    var readError: Error?
    var ended = false

    while out.count < wantFrames {
      guard let dst = AVAudioPCMBuffer(pcmFormat: dstFormat, frameCapacity: chunk) else {
        throw BuildError.convert("버퍼 생성 실패")
      }
      var convError: NSError?
      let status = converter.convert(to: dst, error: &convError) { _, outStatus in
        if ended || srcRemaining <= 0 || file.framePosition >= file.length {
          ended = true
          outStatus.pointee = .endOfStream
          return nil
        }
        let n = AVAudioFrameCount(min(AVAudioFramePosition(chunk), srcRemaining))
        guard let src = AVAudioPCMBuffer(pcmFormat: srcFormat, frameCapacity: n) else {
          ended = true
          outStatus.pointee = .endOfStream
          return nil
        }
        do {
          try file.read(into: src, frameCount: n)
        } catch {
          readError = error
          ended = true
          outStatus.pointee = .endOfStream
          return nil
        }
        if src.frameLength == 0 {
          ended = true
          outStatus.pointee = .endOfStream
          return nil
        }
        srcRemaining -= AVAudioFramePosition(src.frameLength)
        outStatus.pointee = .haveData
        return src
      }
      if let readError { throw readError }
      if status == .error { throw convError ?? BuildError.convert("변환 중 오류") }
      let n = Int(dst.frameLength)
      if n > 0, let ch = dst.floatChannelData {
        out.append(contentsOf: UnsafeBufferPointer(start: ch[0], count: n))
      }
      if status == .endOfStream || (n == 0 && ended) { break }
    }
    if out.count > wantFrames { out.removeLast(out.count - wantFrames) }
    return out
  }

  // MARK: - 가공

  /// 피크를 targetPeak 로 맞춘다(증폭은 maxGain 배까지, 줄이는 쪽은 제한 없음).
  static func normalize(_ s: inout [Float]) {
    var peak: Float = 0
    for v in s where v.isFinite { peak = max(peak, abs(v)) }
    guard peak > 0.0001 else { return }  // 사실상 무음이면 잡음만 키우게 되므로 그대로 둔다
    let gain = min(maxGain, targetPeak / peak)
    for i in s.indices {
      let v = s[i].isFinite ? s[i] * gain : 0
      s[i] = max(-1, min(1, v))
    }
  }

  static func fadeOut(_ s: inout [Float], seconds: Double) {
    let n = min(s.count, Int(seconds * sampleRate))
    guard n > 1 else { return }
    let start = s.count - n
    for i in 0..<n { s[start + i] *= Float(n - 1 - i) / Float(n - 1) }
  }

  static func fadeIn(_ s: inout [Float], seconds: Double) {
    let n = min(s.count, Int(seconds * sampleRate))
    guard n > 1 else { return }
    for i in 0..<n { s[i] *= Float(i) / Float(n - 1) }
  }

  // MARK: - wav 쓰기

  /// 모노 Int16 Linear PCM wav(표준 44바이트 헤더)를 원자적으로 쓴다.
  static func writeWav(_ samples: [Float], to url: URL) throws {
    let dataBytes = samples.count * 2
    var d = Data(capacity: 44 + dataBytes)
    func u32(_ v: UInt32) { var x = v.littleEndian; withUnsafeBytes(of: &x) { d.append(contentsOf: $0) } }
    func u16(_ v: UInt16) { var x = v.littleEndian; withUnsafeBytes(of: &x) { d.append(contentsOf: $0) } }
    let rate = UInt32(sampleRate)
    d.append(contentsOf: Array("RIFF".utf8)); u32(UInt32(36 + dataBytes))
    d.append(contentsOf: Array("WAVE".utf8))
    d.append(contentsOf: Array("fmt ".utf8)); u32(16)
    u16(1)            // PCM
    u16(1)            // 모노
    u32(rate)
    u32(rate * 2)     // 초당 바이트
    u16(2)            // 블록 정렬
    u16(16)           // 비트 깊이
    d.append(contentsOf: Array("data".utf8)); u32(UInt32(dataBytes))
    var pcm = [Int16](repeating: 0, count: samples.count)
    for i in samples.indices {
      let v = max(-1, min(1, samples[i].isFinite ? samples[i] : 0))
      pcm[i] = Int16((v * 32767).rounded()).littleEndian
    }
    pcm.withUnsafeBytes { d.append(contentsOf: $0) }
    try d.write(to: url, options: .atomic)
  }
}
