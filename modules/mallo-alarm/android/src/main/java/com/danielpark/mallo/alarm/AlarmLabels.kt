package com.danielpark.mallo.alarm

import android.content.Context

/**
 * 네이티브 울림 화면·알림에 쓰는 글자. 앱 언어 설정(9개 언어)은 JS에만 있으므로, JS가 언어가 정해질 때마다
 * setLabels()로 넘겨 둔 값을 device-protected 저장소에서 읽는다(잠금해제 전·앱 미기동 상태에서도 필요).
 * 한 번도 넘겨받지 못했으면 한국어 기본값.
 */
object AlarmLabels {
    private const val K_STOP = "label_stop"
    private const val K_SNOOZE = "label_snooze"
    private const val K_RINGING = "label_ringing"
    private const val K_APP = "label_app"

    fun save(context: Context, stop: String, snooze: String, ringing: String, app: String) {
        AlarmStore.prefs(context).edit()
            .putString(K_STOP, stop).putString(K_SNOOZE, snooze)
            .putString(K_RINGING, ringing).putString(K_APP, app)
            .apply()
    }

    private fun get(context: Context, key: String, fallback: String): String =
        try { AlarmStore.prefs(context).getString(key, null)?.takeIf { it.isNotBlank() } ?: fallback } catch (_: Exception) { fallback }

    fun stop(context: Context) = get(context, K_STOP, "알람 끄기")
    fun snooze(context: Context) = get(context, K_SNOOZE, "5분 후 다시")
    fun ringing(context: Context) = get(context, K_RINGING, "알람이 울리는 중")
    fun app(context: Context) = get(context, K_APP, "세이람")
}
