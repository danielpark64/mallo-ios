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

    // ── 울림 카드(1.2.3) ──
    /** JS lib/ringCard.ts ringCardLabels()의 키와 같아야 한다 */
    val RING_KEYS = listOf("now", "again", "pre", "pre10", "pre30", "pre60", "pre1440", "today", "tomorrow", "stopShort", "lang")
    private const val RING_PREFIX = "ring_"

    fun saveRing(context: Context, labels: Map<String, String>) {
        val ed = AlarmStore.prefs(context).edit()
        for (k in RING_KEYS) labels[k]?.let { ed.putString(RING_PREFIX + k, it) }
        ed.apply()
    }

    private fun ring(context: Context, key: String): String? =
        try { AlarmStore.prefs(context).getString(RING_PREFIX + key, null)?.takeIf { it.isNotBlank() } } catch (_: Exception) { null }

    fun stopShort(context: Context) = ring(context, "stopShort") ?: "끄기"
    fun today(context: Context) = ring(context, "today") ?: "오늘"
    fun tomorrow(context: Context) = ring(context, "tomorrow") ?: "내일"
    /** 앱 언어 태그(ko·en·ja·zh-Hans …). 넘겨받지 못했으면 null → 기기 언어 */
    fun lang(context: Context) = ring(context, "lang")

    /**
     * 카드 위 띠 글자와 정각 여부. 일정 정보를 모르면(옛 예약) null = 띠 없음.
     * 스누즈로 다시 울리면 "다시 알림"(정각 5분 뒤에 "지금 · 일정 시간"이라 하면 틀리므로).
     * 미리 알림은 JS가 넘겨 둔 "30분 전 알림" 등. 목록에 없는 분이면 한국어로 직접 만든다(언어를 못 맞추면 "미리 알림").
     */
    fun band(context: Context, meta: RingMeta): Pair<String, Boolean>? {
        if (!meta.known || meta.leadMin < 0) return null
        if (meta.snoozed) return (ring(context, "again") ?: "다시 알림") to false
        if (meta.leadMin == 0) return (ring(context, "now") ?: "지금 · 일정 시간") to true
        ring(context, "pre${meta.leadMin}")?.let { return it to false }
        // 라벨을 받은 적이 있는데(언어가 정해짐) 이 분만 없으면 그 언어의 "미리 알림"
        ring(context, "pre")?.let { return it to false }
        return koreanLead(meta.leadMin) to false
    }

    private fun koreanLead(m: Int): String = when {
        m == 1440 -> "하루 전 알림"
        m == 2880 -> "이틀 전 알림"
        m % 1440 == 0 -> "${m / 1440}일 전 알림"
        m >= 60 && m % 60 == 0 -> "${m / 60}시간 전 알림"
        else -> "${m}분 전 알림"
    }
}
