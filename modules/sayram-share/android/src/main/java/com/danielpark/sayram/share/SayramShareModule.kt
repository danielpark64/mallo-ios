package com.danielpark.sayram.share

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// JS 쪽(lib/siblingShare.ts)이 쓰는 함수:
//  writeOwn(name, json)            — 내 공유 데이터 갱신(events·config). 이 폰 안 파일만 쓴다
//  readInbox(name)                 — 상대가 넣어 준 데이터(shifts·config). 상대 앱을 깨우지 않는다
//  pushToSibling(authority, name)  — 내 데이터가 지난번에 넣어 준 것과 다를 때만 상대 창구에 넣는다(그때만 상대가 깬다)
//  pullToInbox(authority, name)    — 상대 데이터를 직접 가져와 inbox에 저장(처음 한 번·옛 버전 상대일 때만 — 상대가 깬다)
//  isInstalled(pkg)                — 우리 앱(com.danielpark.*)이 깔려 있는지(세이람 실행 때 한 번만 부른다)
//  shareTextTo(pkg, text)          — 일정 보내기: 나라별 메신저(카카오톡·LINE·WeChat·WhatsApp)의 보내기 화면을 글을 채워 연다. 없으면 false(JS가 공유 창을 연다)
class SayramShareModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)
  private val authorityRe = Regex("^com\\.danielpark\\.[a-z]+\\.share$")
  private val nameRe = Regex("^[a-z]+$")
  /** 일정 보내기로 바로 열 수 있는 앱(lib/messenger.ts MESSENGER_PKG와 같게) */
  private val SHARE_TARGETS = setOf("com.kakao.talk", "jp.naver.line.android", "com.tencent.mm", "com.whatsapp")

  override fun definition() = ModuleDefinition {
    Name("SayramShare")

    Function("writeOwn") { name: String, json: String ->
      ShareFiles.write(context, name, json)
    }

    Function("readInbox") { name: String ->
      ShareFiles.readInbox(context, name)
    }

    // 일정 보내기(메신저): ACTION_SEND를 그 앱으로만 보낸다. 사용자가 그 앱에서 받는 사람을 골라 직접 보낸다(자동 발송 없음).
    // 다른 앱 목록을 훑지 않는다 — 열어 보고 없으면(ActivityNotFoundException) false.
    // 네 메신저는 매니페스트 <queries>에도 적어 두었다(기기별 패키지 가시성 차이로 못 여는 일이 없게).
    AsyncFunction("shareTextTo") { pkg: String, text: String, promise: Promise ->
      if (pkg !in SHARE_TARGETS || text.length > 4000) { promise.resolve(false); return@AsyncFunction }
      val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
        setPackage(pkg)
      }
      val activity = appContext.currentActivity
      activity?.runOnUiThread {
        try {
          activity.startActivity(intent)
          promise.resolve(true)
        } catch (_: ActivityNotFoundException) {
          promise.resolve(false)
        } catch (_: Exception) {
          promise.resolve(false)
        }
      } ?: promise.resolve(false)
    }

    // 우리 앱(com.danielpark.*)만 묻는다 — <queries>의 메신저는 여기서 확인하지 않는다. 다른 앱 목록을 훑지 않는다
    Function("isInstalled") { pkg: String ->
      if (!pkg.matches(Regex("^com\\.danielpark\\.[a-z]+$"))) return@Function false
      try {
        context.packageManager.getPackageInfo(pkg, 0)
        true
      } catch (_: Exception) {
        false
      }
    }

    // 결과: "same"(바뀐 것 없음 — 상대를 건드리지 않음) / "pushed" / "fail"(상대 없음·옛 버전·거절)
    AsyncFunction("pushToSibling") { authority: String, name: String ->
      if (!authority.matches(authorityRe) || name !in ShareFiles.NAMES) return@AsyncFunction "fail"
      val mine = ShareFiles.read(context, name) ?: return@AsyncFunction "same"
      val pushed = ShareFiles.pushedFile(context, name)
      // 만든 시각(t)만 다른 같은 내용은 보내지 않는다
      val body = mine.replace(Regex("\"t\":\\d+,?"), "")
      if (pushed.exists() && pushed.readText() == body) return@AsyncFunction "same"
      try {
        val res = context.contentResolver.call(Uri.parse("content://$authority"), "push", name, Bundle().apply { putString("json", mine) })
        if (res?.getBoolean("ok") == true) {
          ShareFiles.atomicWrite(pushed, body)
          "pushed"
        } else "fail"
      } catch (_: Exception) {
        "fail"
      }
    }

    // 비동기: 상대 앱 프로세스가 죽어 있으면 ContentResolver가 그 앱을 띄울 때까지 기다린다 — JS 스레드를 막지 않게
    AsyncFunction("pullToInbox") { authority: String, name: String ->
      if (!authority.matches(authorityRe) || !name.matches(nameRe) || name !in ShareFiles.INBOX_NAMES) {
        return@AsyncFunction null
      }
      try {
        val json = context.contentResolver.query(Uri.parse("content://$authority/$name"), null, null, null, null)?.use { c ->
          if (c.moveToFirst()) c.getString(0) else null
        }
        if (json != null) ShareFiles.writeInbox(context, name, json)
        json
      } catch (_: Exception) {
        null
      }
    }
  }
}
