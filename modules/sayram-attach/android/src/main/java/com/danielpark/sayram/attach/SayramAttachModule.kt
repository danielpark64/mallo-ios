package com.danielpark.sayram.attach

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ContentResolver
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Base64
import android.util.Size
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream

// JS 쪽(lib/attachments.ts)이 쓰는 함수:
//  pick(kind, max)       — "photo": 시스템 사진 선택기 / "file": 문서 선택기. 고른 항목의 위치·이름·크기·종류를 돌려준다
//                          원본은 복사하지 않고 영구 열람 권한(takePersistableUriPermission)만 받아 둔다
//  thumbnail(ref, px)    — 작은 미리보기(JPEG data URI). 메모리에서만 만들고 디스크에 남기지 않는다. 원본이 없으면 null
//  loadImage(ref, px)    — 크게 보기용 사진(긴 변 px). 역시 메모리에서만
//  open(ref, mime)       — 다른 앱으로 열기(파일). 열 앱이 없으면 false
//  release(ref)          — 첨부를 뺄 때 영구 권한 반납(앱당 개수 제한이 있다)
class SayramAttachModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)
  private val resolver: ContentResolver get() = context.contentResolver
  private var pending: Promise? = null
  private var pendingKind = "photo"

  override fun definition() = ModuleDefinition {
    Name("SayramAttach")

    AsyncFunction("pick") { kind: String, max: Int, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) { promise.resolve(EMPTY); return@AsyncFunction }
      // 앞선 고르기가 끝나지 않았으면 빈 결과로 닫는다(두 번 눌림)
      pending?.resolve(EMPTY)
      pending = promise
      pendingKind = kind
      val n = max.coerceIn(1, 10)
      // 사진도 문서 선택기(ACTION_OPEN_DOCUMENT)를 쓴다. Android 13+의 시스템 사진 선택기
      // (MediaStore.ACTION_PICK_IMAGES)가 더 예쁘지만, 그 선택기가 주는 주소는 **영구 권한을 받을 수 없어**
      // (takePersistableUriPermission이 SecurityException) 앱을 다시 열면 못 읽는다 —
      // 원본을 복사하지 않고 위치만 저장하는 세이람 방식과 맞지 않아 쓰지 않는다(2026-11-14).
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = if (kind == "photo") "image/*" else "*/*"
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, n > 1)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
      }
      try {
        activity.startActivityForResult(intent, REQ_PICK)
      } catch (_: ActivityNotFoundException) {
        pending = null
        promise.resolve(EMPTY)
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQ_PICK) return@OnActivityResult
      val promise = pending ?: return@OnActivityResult
      pending = null
      val data = payload.data
      if (payload.resultCode != Activity.RESULT_OK || data == null) {
        promise.resolve(EMPTY)
        return@OnActivityResult
      }
      val uris = mutableListOf<Uri>()
      data.clipData?.let { c -> for (i in 0 until c.itemCount) c.getItemAt(i).uri?.let(uris::add) }
      if (uris.isEmpty()) data.data?.let(uris::add)
      val out = uris.distinct().mapNotNull { uri ->
        // 영구 권한을 못 받으면 앱을 다시 열었을 때 못 읽으니 첨부하지 않는다
        val kept = try {
          resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
          true
        } catch (_: Exception) { false }
        if (!kept) null else describe(uri)
      }
      // 영구 권한을 못 받아 뺀 개수 — JS가 안내한다
      promise.resolve(mapOf("items" to out, "hidden" to (uris.distinct().size - out.size)))
    }

    AsyncFunction("thumbnail") { ref: String, px: Int ->
      val uri = parse(ref) ?: return@AsyncFunction null
      val size = px.coerceIn(32, 512)
      val bmp = try {
        if (Build.VERSION.SDK_INT >= 29) resolver.loadThumbnail(uri, Size(size, size), null)
        else decode(uri, size)
      } catch (_: Exception) {
        // 문서 제공자가 썸네일을 못 만들면(사진이 아닌 파일 등) 사진일 때만 직접 줄여 본다
        if (resolver.getType(uri)?.startsWith("image/") == true) runCatching { decode(uri, size) }.getOrNull() else null
      } ?: return@AsyncFunction null
      toDataUri(bmp, 80)
    }

    AsyncFunction("loadImage") { ref: String, px: Int ->
      val uri = parse(ref) ?: return@AsyncFunction null
      val bmp = runCatching { decode(uri, px.coerceIn(256, 2400)) }.getOrNull() ?: return@AsyncFunction null
      toDataUri(bmp, 85)
    }

    // 원본이 아직 있고 읽을 수 있는지(지워졌거나 권한이 없어졌으면 false)
    AsyncFunction("exists") { ref: String ->
      val uri = parse(ref) ?: return@AsyncFunction false
      try {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { it.moveToFirst() } ?: false
      } catch (_: Exception) { false }
    }

    Function("open") { ref: String, mime: String? ->
      val uri = parse(ref) ?: return@Function false
      val activity = appContext.currentActivity ?: return@Function false
      val type = mime?.takeIf { it.isNotBlank() } ?: resolver.getType(uri) ?: "*/*"
      val view = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, type)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      try {
        activity.startActivity(Intent.createChooser(view, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
        true
      } catch (_: Exception) { false }
    }

    Function("release") { ref: String ->
      val uri = parse(ref) ?: return@Function
      try { resolver.releasePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) {}
    }
  }

  private fun parse(ref: String): Uri? = if (ref.startsWith("content://")) Uri.parse(ref) else null

  private fun describe(uri: Uri): Map<String, Any?> {
    var name: String? = null
    var size: Long? = null
    try {
      resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
        if (c.moveToFirst()) {
          val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          val si = c.getColumnIndex(OpenableColumns.SIZE)
          if (ni >= 0 && !c.isNull(ni)) name = c.getString(ni)
          if (si >= 0 && !c.isNull(si)) size = c.getLong(si)
        }
      }
    } catch (_: Exception) {}
    val mime = resolver.getType(uri)
    val kind = if (pendingKind == "photo" || mime?.startsWith("image/") == true) "photo" else "file"
    return mapOf("ref" to uri.toString(), "kind" to kind, "name" to (name ?: ""), "size" to size?.toDouble(), "mime" to mime)
  }

  // 긴 변이 px쯤 되게 줄여 읽는다(원본 전체를 메모리에 올리지 않게). API 28+는 사진 방향(EXIF)도 맞춰 준다
  private fun decode(uri: Uri, px: Int): Bitmap? {
    if (Build.VERSION.SDK_INT >= 28) {
      val src = ImageDecoder.createSource(resolver, uri)
      return ImageDecoder.decodeBitmap(src) { dec, info, _ ->
        val w = info.size.width
        val h = info.size.height
        val longest = maxOf(w, h)
        if (longest > px) {
          val r = px.toFloat() / longest
          dec.setTargetSize(maxOf(1, (w * r).toInt()), maxOf(1, (h * r).toInt()))
        }
        dec.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
      }
    }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= px) sample *= 2
    return resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
  }

  private fun toDataUri(bmp: Bitmap, quality: Int): String {
    val out = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)
    bmp.recycle()
    return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }

  companion object {
    private const val REQ_PICK = 47031
    private val EMPTY = mapOf("items" to emptyList<Map<String, Any?>>())
  }
}
