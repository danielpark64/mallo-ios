package com.danielpark.mallo.alarm

import android.content.Intent

/**
 * 울림 카드에 보여 줄 "일정 정보"(1.2.3). 울린 시각이 아니라 **일정 시각**과 **몇 분 전 알림인지**를 카드에 보여 주려고
 * 예약(JS) → 원장(AlarmStore) → 발화 인텐트 → 서비스 → 울림 화면 → 스누즈 재예약까지 그대로 들고 다닌다.
 *
 *  - eventAtMs : 일정 시각(ms). 0이면 모름(versionCode 10 이전 예약) → 띠 없이 울린 시각을 일정 시간으로 보여 준다.
 *  - leadMin   : 미리 알림 분. 0 = 정각, 30 = 30분 전, 1440 = 하루 전. -1 = 모름.
 *  - snoozed   : "5분 후 다시"로 다시 울리는 것인지 — 띠를 "다시 알림"으로 바꾼다(정각 5분 뒤에 "지금"이라 하면 틀리므로).
 *  - content   : 일정 내용 원문. 미리 알림의 알림 본문은 "30분 뒤 · 치과"처럼 앞말이 붙어 있어 카드에는 원문을 쓴다. 비면 본문.
 */
data class RingMeta(
    val eventAtMs: Long = 0L,
    val leadMin: Int = -1,
    val snoozed: Boolean = false,
    val content: String = "",
) {
    val known: Boolean get() = eventAtMs > 0L

    fun putTo(i: Intent): Intent = i.apply {
        putExtra(EXTRA_EVENT_AT, eventAtMs)
        putExtra(EXTRA_LEAD_MIN, leadMin)
        putExtra(EXTRA_SNOOZED, snoozed)
        putExtra(EXTRA_CONTENT, content)
    }

    companion object {
        const val EXTRA_EVENT_AT = "eventAtMs"
        const val EXTRA_LEAD_MIN = "leadMin"
        const val EXTRA_SNOOZED = "snoozed"
        const val EXTRA_CONTENT = "content"
        val NONE = RingMeta()

        /** 인텐트에 일정 정보가 실려 있으면 꺼내고, 없으면 null(호출자가 다른 출처로 대신한다) */
        fun from(i: Intent?): RingMeta? {
            if (i == null || !i.hasExtra(EXTRA_EVENT_AT)) return null
            return RingMeta(
                eventAtMs = i.getLongExtra(EXTRA_EVENT_AT, 0L),
                leadMin = i.getIntExtra(EXTRA_LEAD_MIN, -1),
                snoozed = i.getBooleanExtra(EXTRA_SNOOZED, false),
                content = i.getStringExtra(EXTRA_CONTENT) ?: "",
            )
        }
    }
}
