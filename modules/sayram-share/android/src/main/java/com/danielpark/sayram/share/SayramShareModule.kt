package com.danielpark.sayram.share

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// JS 쪽(lib/siblingShare.ts)이 쓰는 함수:
//  writeOwn(name, json)        — 내 공유 데이터 갱신(events·config)
//  readSibling(authority, name) — 상대 앱 창구에서 읽기(없거나 막히면 null)
//  isInstalled(pkg)            — 우리 앱(com.danielpark.*)이 이 폰에 깔려 있는지(홍보 배너에서 이미 깐 앱은 숨김)
class SayramShareModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("SayramShare")

    Function("writeOwn") { name: String, json: String ->
      ShareFiles.write(context, name, json)
    }

    // 매니페스트 <queries>에 적힌 앱만 보인다(지금은 교대알람). 다른 앱 목록을 훑지 않는다
    Function("isInstalled") { pkg: String ->
      if (!pkg.matches(Regex("^com\\.danielpark\\.[a-z]+$"))) return@Function false
      try {
        context.packageManager.getPackageInfo(pkg, 0)
        true
      } catch (_: Exception) {
        false
      }
    }

    // 비동기: 상대 앱 프로세스가 죽어 있으면 ContentResolver가 그 앱을 띄울 때까지 기다린다 — JS 스레드를 막지 않게
    AsyncFunction("readSibling") { authority: String, name: String ->
      // 상대 앱이 없거나(창구 없음) 우리를 허용하지 않으면 null
      if (!authority.matches(Regex("^com\\.danielpark\\.[a-z]+\\.share$")) || !name.matches(Regex("^[a-z]+$"))) {
        return@AsyncFunction null
      }
      try {
        context.contentResolver.query(Uri.parse("content://$authority/$name"), null, null, null, null)?.use { c ->
          if (c.moveToFirst()) c.getString(0) else null
        }
      } catch (_: Exception) {
        null
      }
    }
  }
}
