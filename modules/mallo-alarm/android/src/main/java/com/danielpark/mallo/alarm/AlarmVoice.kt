package com.danielpark.mallo.alarm

import android.content.Context

// [VOICE_ALARM] 보류된 기능 — 상용에서는 JS(lib/voiceAlarm.ts VOICE_ALARM.enabled=false)가 경로를 넣지 않아 항상 비어 있다.
/**
 * "내 목소리" 알람: 일정(recordId)마다 알람 소리로 쓸 녹음 파일 경로를 적어 둔다.
 *
 * 예약 원장(AlarmStore)과 따로 두는 이유 — 소리는 슬롯(정각·+1분·미리 알림·스누즈)이 아니라 일정 단위로
 * 정해지고, 스누즈·부팅 복구처럼 네이티브가 스스로 다시 거는 예약도 같은 소리를 써야 하기 때문이다.
 * 울릴 때 AlarmService가 여기서 찾아보고, 없거나 파일을 못 읽으면(잠금해제 전 등) 기본 알람음으로 울린다.
 */
object AlarmVoice {
    private const val PREFS = "MalloAlarmVoice"

    private fun prefs(context: Context) =
        context.applicationContext.createDeviceProtectedStorageContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** path가 비면 지운다. recordId는 일정 id(미리 알림의 "#preN" 꼬리 없이). */
    fun set(context: Context, recordId: String, path: String) {
        val base = AlarmScheduling.baseRecordId(recordId)
        if (base.isEmpty()) return
        prefs(context).edit().apply {
            if (path.isEmpty()) remove(base) else putString(base, path.removePrefix("file://"))
        }.apply()
    }

    fun get(context: Context, recordId: String): String? =
        prefs(context).getString(AlarmScheduling.baseRecordId(recordId), null)?.takeIf { it.isNotEmpty() }

    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
    }
}
