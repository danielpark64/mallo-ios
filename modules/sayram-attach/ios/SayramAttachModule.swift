import ExpoModulesCore
import ImageIO
import Photos
import PhotosUI
import QuickLook
import QuickLookThumbnailing
import UIKit
import UniformTypeIdentifiers

// 일정에 사진·파일 첨부 — iOS.
// 원본을 앱 안으로 복사하지 않고 위치만 저장한다(저장 공간을 쓰지 않는다).
//   사진: "ph:<사진 보관함 id>" — 보려면 사진 접근 권한이 필요하다
//   파일: "bm:<보안 북마크 base64>" — 파일 앱의 그 파일을 다시 열 수 있는 열쇠
// JS(lib/attachments.ts)는 Android와 같은 함수 이름을 쓴다.
public class SayramAttachModule: Module {
  private var photoDelegate: PhotoPickDelegate?
  private var fileDelegate: FilePickDelegate?
  private var previewSource: PreviewSource?

  public func definition() -> ModuleDefinition {
    Name("SayramAttach")

    // 사진 접근 권한 상태: "authorized" / "limited" / "denied" / "notDetermined"
    // .readWrite 는 "읽기+쓰기"가 아니라 **사진 보관함 접근 수준**의 이름이다.
    // PHAccessLevel 에는 .addOnly(추가만)와 .readWrite 둘뿐이라 사진을 읽으려면 .readWrite 를 쓴다
    // (.readOnly 는 없다 — 2026-11-14 그렇게 고쳤다가 빌드가 깨졌다).
    // 실제로 사진을 바꾸거나 지우는 코드는 없고, Info.plist 도 NSPhotoLibraryUsageDescription 하나만 쓴다.
    Function("photoAccess") { () -> String in
      Self.accessName(PHPhotoLibrary.authorizationStatus(for: .readWrite))
    }

    AsyncFunction("pick") { (kind: String, limit: Int, promise: Promise) in
      if kind == "photo" {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
          DispatchQueue.main.async {
            guard status == .authorized || status == .limited else {
              promise.resolve(["denied": true, "items": []])
              return
            }
            self.presentPhotoPicker(limit: limit, limited: status == .limited, promise: promise)
          }
        }
      } else {
        DispatchQueue.main.async { self.presentFilePicker(limit: limit, promise: promise) }
      }
    }

    AsyncFunction("thumbnail") { (ref: String, px: Int, promise: Promise) in
      let size = CGFloat(min(max(px, 32), 512))
      if let asset = Self.asset(ref) {
        Self.requestImage(asset, side: size, mode: .aspectFill) { img in promise.resolve(img.flatMap { Self.dataUri($0, 0.8) }) }
      } else if let url = Self.resolveBookmark(ref) {
        let ok = url.startAccessingSecurityScopedResource()
        let req = QLThumbnailGenerator.Request(fileAt: url, size: CGSize(width: size, height: size), scale: 1, representationTypes: .thumbnail)
        QLThumbnailGenerator.shared.generateBestRepresentation(for: req) { rep, _ in
          if ok { url.stopAccessingSecurityScopedResource() }
          promise.resolve(rep.flatMap { Self.dataUri($0.uiImage, 0.8) })
        }
      } else {
        promise.resolve(nil)
      }
    }

    AsyncFunction("loadImage") { (ref: String, px: Int, promise: Promise) in
      let side = CGFloat(min(max(px, 256), 2400))
      if let asset = Self.asset(ref) {
        Self.requestImage(asset, side: side, mode: .aspectFit) { img in promise.resolve(img.flatMap { Self.dataUri($0, 0.85) }) }
      } else if let url = Self.resolveBookmark(ref) {
        // 파일 앱에서 고른 사진: 원본 전체를 올리지 않고 긴 변 side로 줄여 읽는다(방향도 맞춤)
        let ok = url.startAccessingSecurityScopedResource()
        defer { if ok { url.stopAccessingSecurityScopedResource() } }
        let opts: [CFString: Any] = [
          kCGImageSourceCreateThumbnailFromImageAlways: true,
          kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceThumbnailMaxPixelSize: side,
        ]
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
              let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { promise.resolve(nil); return }
        promise.resolve(Self.dataUri(UIImage(cgImage: cg), 0.85))
      } else {
        promise.resolve(nil)
      }
    }

    AsyncFunction("exists") { (ref: String) -> Bool in
      if ref.hasPrefix("ph:") { return Self.asset(ref) != nil }
      guard let url = Self.resolveBookmark(ref) else { return false }
      let ok = url.startAccessingSecurityScopedResource()
      defer { if ok { url.stopAccessingSecurityScopedResource() } }
      return FileManager.default.fileExists(atPath: url.path)
    }

    // 파일: 앱 안 미리보기(Quick Look) — 거기서 공유 버튼으로 다른 앱에서도 열 수 있다
    AsyncFunction("open") { (ref: String, _: String?, promise: Promise) in
      DispatchQueue.main.async {
        guard let url = Self.resolveBookmark(ref),
              let vc = self.appContext?.utilities?.currentViewController() else { promise.resolve(false); return }
        let source = PreviewSource(url: url) { [weak self] in self?.previewSource = nil }
        self.previewSource = source
        let ql = QLPreviewController()
        ql.dataSource = source
        ql.delegate = source
        vc.present(ql, animated: true)
        promise.resolve(true)
      }
    }

    // iOS는 반납할 권한이 없다(사진 id·북마크는 저장된 글자일 뿐)
    Function("release") { (_: String) in }
  }

  // MARK: 고르기

  private func presentPhotoPicker(limit: Int, limited: Bool, promise: Promise) {
    guard let vc = appContext?.utilities?.currentViewController() else { promise.resolve(["items": []]); return }
    var config = PHPickerConfiguration(photoLibrary: .shared())
    config.filter = .images
    config.selectionLimit = min(max(limit, 1), 10)
    let delegate = PhotoPickDelegate { [weak self] results in
      self?.photoDelegate = nil
      let ids = results.compactMap { $0.assetIdentifier }
      let found = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
      var byId: [String: PHAsset] = [:]
      found.enumerateObjects { a, _, _ in byId[a.localIdentifier] = a }
      var items: [[String: Any?]] = []
      var hidden = 0
      for id in ids {
        guard let a = byId[id] else { hidden += 1; continue } // '선택한 사진만' 허용에 없는 사진은 나중에 못 열어 넣지 않는다
        let name = PHAssetResource.assetResources(for: a).first?.originalFilename ?? ""
        items.append(["ref": "ph:\(id)", "kind": "photo", "name": name, "size": nil, "mime": "image/jpeg"])
      }
      promise.resolve(["items": items, "hidden": hidden, "limited": limited])
    }
    photoDelegate = delegate
    let picker = PHPickerViewController(configuration: config)
    picker.delegate = delegate
    picker.presentationController?.delegate = delegate // 아래로 쓸어 닫아도 끝나게
    vc.present(picker, animated: true)
  }

  private func presentFilePicker(limit: Int, promise: Promise) {
    guard let vc = appContext?.utilities?.currentViewController() else { promise.resolve(["items": []]); return }
    // asCopy: false — 원본 위치를 그대로 연다(앱 안에 사본을 만들지 않는다)
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.item], asCopy: false)
    picker.allowsMultipleSelection = limit > 1
    let delegate = FilePickDelegate { [weak self] urls in
      self?.fileDelegate = nil
      var items: [[String: Any?]] = []
      for url in urls.prefix(min(max(limit, 1), 10)) {
        let ok = url.startAccessingSecurityScopedResource()
        defer { if ok { url.stopAccessingSecurityScopedResource() } }
        guard let bm = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) else { continue }
        let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey])
        items.append([
          "ref": "bm:" + bm.base64EncodedString(),
          "kind": (values?.contentType?.conforms(to: .image) ?? false) ? "photo" : "file",
          "name": url.lastPathComponent,
          "size": values?.fileSize.map { Double($0) },
          "mime": values?.contentType?.preferredMIMEType,
        ])
      }
      promise.resolve(["items": items])
    }
    fileDelegate = delegate
    picker.delegate = delegate
    picker.presentationController?.delegate = delegate // 아래로 쓸어 닫아도 끝나게
    vc.present(picker, animated: true)
  }

  // MARK: 도우미

  private static func accessName(_ s: PHAuthorizationStatus) -> String {
    switch s {
    case .authorized: return "authorized"
    case .limited: return "limited"
    case .notDetermined: return "notDetermined"
    default: return "denied"
    }
  }

  private static func asset(_ ref: String) -> PHAsset? {
    guard ref.hasPrefix("ph:") else { return nil }
    return PHAsset.fetchAssets(withLocalIdentifiers: [String(ref.dropFirst(3))], options: nil).firstObject
  }

  static func resolveBookmark(_ ref: String) -> URL? {
    guard ref.hasPrefix("bm:"), let data = Data(base64Encoded: String(ref.dropFirst(3))) else { return nil }
    var stale = false
    return try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
  }

  // iCloud에만 있는 사진은 시스템 사진 앱이 내려받아 준다(세이람이 직접 통신하지 않는다)
  private static func requestImage(_ asset: PHAsset, side: CGFloat, mode: PHImageContentMode, done: @escaping (UIImage?) -> Void) {
    let opts = PHImageRequestOptions()
    opts.deliveryMode = .highQualityFormat
    opts.resizeMode = .fast
    opts.isNetworkAccessAllowed = true
    PHImageManager.default().requestImage(for: asset, targetSize: CGSize(width: side, height: side), contentMode: mode, options: opts) { img, _ in
      done(img)
    }
  }

  private static func dataUri(_ img: UIImage, _ q: CGFloat) -> String? {
    guard let d = img.jpegData(compressionQuality: q) else { return nil }
    return "data:image/jpeg;base64," + d.base64EncodedString()
  }
}

// 결과는 한 번만 돌려준다(고르기·취소·쓸어 닫기 중 먼저 온 것)
final class PhotoPickDelegate: NSObject, PHPickerViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
  private var done: (([PHPickerResult]) -> Void)?
  init(done: @escaping ([PHPickerResult]) -> Void) { self.done = done }
  private func finish(_ r: [PHPickerResult]) { let d = done; done = nil; d?(r) }
  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    finish(results)
  }
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { finish([]) }
}

final class FilePickDelegate: NSObject, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  private var done: (([URL]) -> Void)?
  init(done: @escaping ([URL]) -> Void) { self.done = done }
  private func finish(_ r: [URL]) { let d = done; done = nil; d?(r) }
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { finish(urls) }
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finish([]) }
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) { finish([]) }
}

// Quick Look 미리보기 동안만 그 파일 열람을 연다(닫으면 닫는다)
final class PreviewSource: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
  private let url: URL
  private let accessing: Bool
  private let onClose: () -> Void
  init(url: URL, onClose: @escaping () -> Void) {
    self.url = url
    self.accessing = url.startAccessingSecurityScopedResource()
    self.onClose = onClose
  }
  func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
  func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { url as NSURL }
  func previewControllerDidDismiss(_ controller: QLPreviewController) {
    if accessing { url.stopAccessingSecurityScopedResource() }
    onClose()
  }
}
