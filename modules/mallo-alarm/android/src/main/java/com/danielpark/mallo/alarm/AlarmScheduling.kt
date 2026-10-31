package com.danielpark.mallo.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * 예약/취소를 한 곳에서만 한다 — JS 예약(MalloAlarmModule)·부팅 복구(BootReceiver)·스누즈(AlarmService)가
 * 각자 intent를 조립하면 extra 하나만 어긋나도 재현이 어려운 버그가 된다.
 *
 * setAlarmClock을 1순위로 쓴다(교대알람과 동일). "알람시계" 전용 API라 Doze·배터리 최적화와 무관하게
 * 정확한 시각에 발화가 보장되고, 상태바에 다음 알람 아이콘이 표시된다. 정확 알람 권한이 없으면
 * (Android 12에서 사용자가 끈 경우) SecurityException이 나므로 setExactAndAllowWhileIdle →
 * setAndAllowWhileIdle 순으로 내려간다 — 늦게라도 울리는 쪽이 안 울리는 쪽보다 낫다.
 */
object AlarmScheduling {
    const val EXTRA_KEY = "key"
    const val EXTRA_RECORD_ID = "recordId"
    /** 알람 알림을 눌러 앱을 열 때 실어 보내는 일정 ID — 앱이 받아 그 일정 상세 화면을 연다 */
    const val EXTRA_OPEN_RECORD_ID = "malloOpenRecordId"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    const val EXTRA_SOUND_ON = "soundOn"
    const val EXTRA_VIB_ON = "vibOn"

    fun buildAlarmIntent(context: Context, e: AlarmStore.Entry): Intent =
        Intent(context, AlarmReceiver::class.java).apply {
            putExtra(EXTRA_KEY, e.key)
            putExtra(EXTRA_RECORD_ID, e.recordId)
            putExtra(EXTRA_TITLE, e.title)
            putExtra(EXTRA_BODY, e.body)
            putExtra(EXTRA_SOUND_ON, e.soundOn)
            putExtra(EXTRA_VIB_ON, e.vibOn)
        }

    fun arm(context: Context, e: AlarmStore.Entry) {
        val pi = PendingIntent.getBroadcast(
            context, e.requestCode, buildAlarmIntent(context, e),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        schedule(context, am, e.triggerAtMs, pi)
    }

    fun schedule(context: Context, am: AlarmManager, triggerAt: Long, operation: PendingIntent) {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: Intent(Intent.ACTION_MAIN).apply { setPackage(context.packageName) }
        val showIntent = PendingIntent.getActivity(
            context, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        try {
            am.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAt, showIntent), operation)
            return
        } catch (_: SecurityException) { /* 정확 알람 권한 없음 → 아래로 */ }
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, operation)
        } catch (_: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, operation)
        }
    }

    fun canScheduleExact(context: Context): Boolean {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
    }

    /** 키 하나의 AlarmManager 예약만 내린다(원장은 호출자가 정리). */
    fun disarm(context: Context, key: String) {
        val pi = PendingIntent.getBroadcast(
            context, key.hashCode(), Intent(context, AlarmReceiver::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_NO_CREATE
        ) ?: return
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pi)
        pi.cancel()
    }

    /**
     * 키 목록 취소. 각 키가 속한 일정(recordId)의 다른 슬롯(스누즈 포함)도 함께 내린다 — JS는
     * 저장해둔 Expo 식별자 3개만 알고 네이티브 스누즈 슬롯(`_z*`)은 모르기 때문이다.
     */
    fun cancelKeys(context: Context, keys: Collection<String>) {
        val expanded = LinkedHashSet<String>(keys)
        for (k in keys) {
            val rid = AlarmStore.get(context, k)?.recordId ?: recordIdFromKey(k) ?: continue
            // 일정 단위 정리: 정각 슬롯("id")뿐 아니라 미리 알림("id#pre30")과 그 스누즈까지 같이 내린다
            val base = baseRecordId(rid)
            for (e in AlarmStore.all(context)) {
                if (e.recordId == base || e.recordId.startsWith("$base#")) expanded.add(e.key)
            }
        }
        for (k in expanded) disarm(context, k)
        AlarmStore.remove(context, expanded)
    }

    fun cancelByRecordId(context: Context, recordId: String) {
        val keys = AlarmStore.byRecordId(context, recordId).map { it.key }
        for (k in keys) disarm(context, k)
        // 원장에 없더라도 기본 슬롯 3개는 내려본다(원장이 깨졌을 때 대비).
        for (slot in 0..2) disarm(context, expoKey(recordId, slot))
        AlarmStore.remove(context, keys)
    }

    fun cancelAll(context: Context) {
        for (e in AlarmStore.all(context)) disarm(context, e.key)
        AlarmStore.clear(context)
    }

    /** Expo 식별자 규칙(lib/notifications.ts와 동일): mallo_<recordId>_<slot> */
    fun expoKey(recordId: String, slot: Int) = "mallo_${recordId}_$slot"
    fun snoozeKey(recordId: String, slot: Int) = "mallo_${recordId}_z$slot"

    fun recordIdFromKey(key: String): String? {
        if (!key.startsWith("mallo_")) return null
        val cut = key.lastIndexOf('_')
        if (cut <= 6) return null
        val id = key.substring(6, cut)
        val tail = key.substring(cut + 1)
        // 미리 알림 키 mallo_<id>_pre<N> → recordId "<id>#pre<N>" (lib/reminders.ts preRecordId와 동일 규칙)
        if (tail.startsWith("pre")) return "$id#$tail"
        return id
    }

    /** "id#pre30" → "id" */
    fun baseRecordId(recordId: String): String = recordId.substringBefore('#')
    fun isPreRecordId(recordId: String): Boolean = recordId.contains("#pre")
}
