package com.danielpark.sayram.share

import android.content.Context
import java.io.File

// 공유용 파일 자리(앱 내부, 다른 앱은 직접 못 읽는다):
//  files/share/<이름>.json         — 내가 내놓는 것(events·config). 상대가 처음 한 번 가져갈 때(query) 쓴다
//  files/share/inbox/<이름>.json   — 상대가 넣어 준 것(shifts·config). 앱이 열릴 때 여기만 읽는다 → 상대 앱을 깨우지 않는다
//  files/share/pushed/<이름>.json  — 마지막으로 상대에게 넣어 준 내용. 같으면 다시 넣지 않는다(상대를 깨우지 않게)
object ShareFiles {
  /** 내가 내놓는 이름 */
  val NAMES = setOf("events", "config")
  /** 상대(교대알람)가 넣어 줄 수 있는 이름 */
  val INBOX_NAMES = setOf("shifts", "config")
  /** 한 번에 받는 최대 크기(근무표 1년치는 수 KB) */
  const val MAX_BYTES = 256 * 1024

  private fun dir(context: Context, sub: String?): File {
    val base = File(context.filesDir, "share")
    return (if (sub == null) base else File(base, sub)).apply { mkdirs() }
  }

  fun file(context: Context, name: String): File = File(dir(context, null), "$name.json")
  fun inboxFile(context: Context, name: String): File = File(dir(context, "inbox"), "$name.json")
  fun pushedFile(context: Context, name: String): File = File(dir(context, "pushed"), "$name.json")

  /** 임시 파일에 쓰고 바꿔치기 — 읽는 쪽이 반쯤 쓴 파일을 보지 않게 */
  fun atomicWrite(f: File, text: String) {
    val tmp = File(f.parentFile, f.name + ".tmp")
    tmp.writeText(text)
    tmp.renameTo(f)
  }

  fun write(context: Context, name: String, json: String) {
    if (name !in NAMES) return
    atomicWrite(file(context, name), json)
  }

  fun read(context: Context, name: String): String? {
    if (name !in NAMES) return null
    val f = file(context, name)
    return if (f.exists()) f.readText() else null
  }

  fun writeInbox(context: Context, name: String, json: String): Boolean {
    if (name !in INBOX_NAMES || json.length > MAX_BYTES) return false
    atomicWrite(inboxFile(context, name), json)
    return true
  }

  fun readInbox(context: Context, name: String): String? {
    if (name !in INBOX_NAMES) return null
    val f = inboxFile(context, name)
    return if (f.exists()) f.readText() else null
  }
}
