package com.danielpark.sayram.widget

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS(lib/widget.ts)에서 위젯 요약을 받아 저장하고 위젯을 바로 다시 그린다 */
class SayramWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SayramWidget")

    // 파일 쓰기·위젯 그리기는 JS 스레드를 막지 않게 비동기로
    AsyncFunction("setData") { json: String ->
      val ctx = appContext.reactContext ?: return@AsyncFunction
      if (!WidgetStore.write(ctx, json)) return@AsyncFunction // 같은 내용이면 다시 그리지 않는다(앞으로 올 때마다 불림)
      WidgetRender.updateAll(ctx)
    }

    // 최근 앱 목록에서 다시 열면 마지막 인텐트(위젯 링크)가 그대로 다시 온다 → JS가 그 링크를 무시하게 알려 준다
    Function("launchedFromHistory") {
      val flags = appContext.currentActivity?.intent?.flags ?: 0
      (flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0
    }
  }
}
