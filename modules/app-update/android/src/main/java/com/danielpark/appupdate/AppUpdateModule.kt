package com.danielpark.appupdate

import android.os.Build
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// 새 버전 안내(교대알람 1.6.3에서 그대로 가져옴, 세이람 1.2.3) — JS(lib/appUpdateNative.ts)가 쓰는 함수. iOS(AppUpdateModule.swift)와 같은 이름:
//  getInstalledVersion()  — 깔린 판 { version: versionName, build: versionCode }
//  getPlayUpdate()        — Play 스토어 앱에 물어본 스토어 판 { availability, versionCode }. Play 없음·Play에서 안 받은 판·실패는 null
// 앱이 직접 인터넷에 접속하지 않는다(Play 스토어 앱이 확인). 화면(창)은 띄우지 않는다 — 띄울지는 JS가 정한다.
class AppUpdateModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("AppUpdate")

    Function("getInstalledVersion") {
      try {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
        mapOf("version" to (info.versionName ?: ""), "build" to code.toString())
      } catch (_: Exception) {
        null
      }
    }

    // 실패는 전부 null(조용히) — 예외를 JS로 던지지 않는다
    AsyncFunction("getPlayUpdate") { promise: Promise ->
      try {
        AppUpdateManagerFactory.create(context).appUpdateInfo
          .addOnSuccessListener { info ->
            promise.resolve(mapOf("availability" to info.updateAvailability(), "versionCode" to info.availableVersionCode()))
          }
          .addOnFailureListener { promise.resolve(null) }
      } catch (_: Exception) {
        promise.resolve(null)
      }
    }
  }
}
