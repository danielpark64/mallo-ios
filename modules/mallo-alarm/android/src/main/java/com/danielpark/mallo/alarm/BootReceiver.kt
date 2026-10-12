package com.danielpark.mallo.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * 재부팅·앱 교체 후 네이티브 예약 복구. AlarmStore 원장을 그대로 다시 건다.
 * LOCKED_BOOT_COMPLETED(잠금해제 전)도 받는다 — 원장이 device-protected 저장소에 있어 가능.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
            Intent.ACTION_MY_PACKAGE_REPLACED -> Unit
            else -> return
        }
        val appCtx = context.applicationContext
        val pending = goAsync()
        Thread {
            try {
                val now = System.currentTimeMillis()
                for (e in AlarmStore.all(appCtx)) if (e.triggerAtMs > now) AlarmScheduling.arm(appCtx, e)
            } finally {
                pending.finish()
            }
        }.start()
    }
}
