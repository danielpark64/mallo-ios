package com.danielpark.sayram.share

import android.content.Context
import java.io.File

// 공유용 파일 자리: 앱 내부 files/share/<이름>.json (다른 앱은 직접 못 읽고 ShareProvider로만)
object ShareFiles {
  /** 내보낼 수 있는 이름 — 이 밖의 경로는 provider가 거절한다 */
  val NAMES = setOf("events", "config")

  fun file(context: Context, name: String): File = File(File(context.filesDir, "share").apply { mkdirs() }, "$name.json")

  fun write(context: Context, name: String, json: String) {
    if (name !in NAMES) return
    val f = file(context, name)
    val tmp = File(f.parentFile, "$name.json.tmp")
    tmp.writeText(json)
    tmp.renameTo(f)
  }

  fun read(context: Context, name: String): String? {
    if (name !in NAMES) return null
    val f = file(context, name)
    return if (f.exists()) f.readText() else null
  }
}
