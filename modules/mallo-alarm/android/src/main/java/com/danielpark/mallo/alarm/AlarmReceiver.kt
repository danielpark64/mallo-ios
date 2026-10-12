package com.danielpark.mallo.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/** AlarmManager 발화 → 같은 슬롯 Expo 예약 취소 → 울림 서비스 시작 */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val key = intent.getStringExtra(AlarmScheduling.EXTRA_KEY) ?: return
        val recordId = intent.getStringExtra(AlarmScheduling.EXTRA_RECORD_ID) ?: ""

        // 네이티브가 제때 울렸으니 보조 경로(Expo, T+유예)는 필요 없다 — 중복 알림 방지.
        ExpoTwin.cancelScheduled(context, listOf(key))
        AlarmStore.remove(context, listOf(key))

        val svc = Intent(context, AlarmService::class.java).apply {
            action = AlarmService.ACTION_RING
            putExtras(intent)
            putExtra(AlarmScheduling.EXTRA_RECORD_ID, recordId)
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(svc)
            else context.startService(svc)
        } catch (e: Exception) { e.printStackTrace() }
    }
}
