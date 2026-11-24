package com.danielpark.mallo.alarm

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS(lib/nativeAlarm.ts)에 노출되는 Expo 모듈. Android 전용.
 * 모든 함수는 동기 Function — AlarmManager 호출은 수 ms고, 원장 디스크 쓰기는 AlarmStore가 워커로 미룬다.
 */
class MalloAlarmModule : Module() {
    private val context: Context
        get() = (appContext.reactContext ?: throw Exceptions.ReactContextLost()).applicationContext

    override fun definition() = ModuleDefinition {
        Name("MalloAlarm")

        // 앱이 켜져 있을 때 알람 알림을 누르면 새 인텐트로 들어온다 → 일정 ID를 받아 두고 JS에 알린다
        Events("onOpenRecord")
        OnNewIntent { intent ->
            takeOpenRecordId(intent)?.let {
                pendingOpenRecordId = it
                sendEvent("onOpenRecord", mapOf("recordId" to it))
            }
        }

        // 울리는 중에 앱 아이콘·최근 앱·알람 알림(7002)으로 앱이 앞으로 오면 울림 화면을 다시 띄운다.
        // 홈 버튼 등으로 울림 화면이 가려지면 일반 화면만 보여 끌 곳을 못 찾았다(사용자 보고 "알람이 숨어 버림").
        // 앱이 앞에 있을 때라 백그라운드 실행 제한에 걸리지 않는다. 울림 화면은 singleInstance라 이미 있으면 그대로 앞으로 온다.
        OnActivityEntersForeground { showRingScreenIfRinging() }

        /** 알람 알림을 눌러 열린 일정 ID를 한 번만 돌려준다(꺼져 있다가 열렸으면 시작 인텐트에서 읽는다). 없으면 null */
        Function("consumeOpenRecordId") { ->
            appContext.currentActivity?.intent?.let { takeOpenRecordId(it) }?.let { pendingOpenRecordId = it }
            val id = pendingOpenRecordId
            pendingOpenRecordId = null
            // 앱이 꺼져 있다가 울리는 중에 열린 경우(아이콘·알림 탭) OnActivityEntersForeground가 모듈이 생기기 전의 첫 화면을
            // 놓칠 수 있다 → JS가 시작 때 이 함수를 부르는 시점에 한 번 더 울림 화면을 띄운다(이미 떠 있으면 그대로 앞으로).
            showRingScreenIfRinging()
            id
        }

        /** key = Expo 식별자와 동일(mallo_<recordId>_<slot>). 같은 키로 다시 부르면 덮어쓴다. */
        Function("schedule") { key: String, recordId: String, triggerAtMs: Double, title: String, body: String, soundOn: Boolean, vibOn: Boolean, tone: String ->
            val e = AlarmStore.Entry(
                key = key, recordId = recordId, triggerAtMs = triggerAtMs.toLong(),
                title = title, body = body, soundOn = soundOn, vibOn = vibOn,
                tone = tone.ifEmpty { AlarmTones.DEFAULT },
            )
            AlarmScheduling.arm(context, e)
            AlarmStore.put(context, e)
        }

        Function("cancel") { keys: List<String> ->
            AlarmScheduling.cancelKeys(context, keys)
        }

        Function("cancelByRecordId") { recordId: String ->
            if (AlarmService.currentRinging?.recordId == recordId) AlarmService.stop(context, recordId)
            AlarmScheduling.cancelByRecordId(context, recordId)
        }

        Function("cancelAll") {
            AlarmScheduling.cancelAll(context)
        }

        /** 울리는 중이면 멈춘다(남은 슬롯도 정리). recordId를 모르면 현재 울리는 것. */
        Function("stopRinging") { recordId: String? ->
            AlarmService.stop(context, recordId ?: AlarmService.currentRinging?.recordId)
        }

        Function("getRingingRecordId") { -> AlarmService.currentRinging?.recordId }

        Function("canScheduleExact") { -> AlarmScheduling.canScheduleExact(context) }

        /** Android 12에서 사용자가 정확 알람 권한을 꺼둔 경우 설정 화면으로 보낸다(13+는 USE_EXACT_ALARM으로 불필요). */
        Function("openExactAlarmSettings") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    context.startActivity(
                        Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
                            .apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
                    )
                } catch (_: Exception) {}
            }
        }

        /** "다른 앱 위에 표시" — 화면이 켜진 채 다른 앱을 쓰는 중에도 전체화면 울림 팝업을 띄우려면 필요 */
        Function("canDrawOverlays") { ->
            Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
        }

        /** Android 14+: 전체 화면 알림(잠금·화면 꺼짐 때 울림 화면을 띄우는 길) 허용 여부. 13 이하는 설치 때 자동 허용 */
        Function("canUseFullScreenIntent") { ->
            if (Build.VERSION.SDK_INT >= 34) {
                try {
                    (context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).canUseFullScreenIntent()
                } catch (_: Exception) { true }
            } else true
        }

        /** Android 14+: 전체 화면 알림 허용 화면으로 보낸다(없는 기기는 앱 알림 설정으로) */
        Function("openFullScreenIntentSettings") {
            var opened = false
            if (Build.VERSION.SDK_INT >= 34) {
                try {
                    context.startActivity(
                        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
                            .apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
                    )
                    opened = true
                } catch (_: Exception) {}
            }
            if (!opened) try {
                context.startActivity(
                    Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                        .apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
                )
            } catch (_: Exception) {}
        }

        Function("requestOverlayPermission") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    context.startActivity(
                        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
                            .apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
                    )
                } catch (_: Exception) {}
            }
        }

        /** 네이티브 울림 화면·알림 버튼 글자를 앱 언어에 맞춘다(언어가 정해지거나 바뀔 때 JS가 호출) */
        Function("setLabels") { stop: String, snooze: String, ringing: String, app: String ->
            AlarmLabels.save(context, stop, snooze, ringing, app)
        }

        // [VOICE_ALARM] 보류된 기능 (setVoice/clearVoices)
        /** "내 목소리" 알람: 이 일정이 울릴 때 쓸 녹음 파일. path가 비면 기본 알람음으로 되돌린다. */
        Function("setVoice") { recordId: String, path: String ->
            AlarmVoice.set(context, recordId, path)
        }

        Function("clearVoices") {
            AlarmVoice.clear(context)
        }

        /** 디버그/검증용: 원장에 남은 예약 키 목록 */
        Function("listScheduled") { ->
            AlarmStore.all(context).map { mapOf("key" to it.key, "recordId" to it.recordId, "at" to it.triggerAtMs.toDouble()) }
        }
    }

    private fun showRingScreenIfRinging() {
        val activity = appContext.currentActivity ?: return
        val i = AlarmRingActivity.ringingIntent(activity) ?: return
        try { activity.startActivity(i) } catch (e: Exception) { e.printStackTrace() }
    }

    /** 일정 ID를 꺼내고 인텐트에서 지운다 — 화면 회전 등으로 같은 인텐트를 다시 읽어도 또 열리지 않게 */
    private fun takeOpenRecordId(intent: Intent): String? {
        val id = intent.getStringExtra(AlarmScheduling.EXTRA_OPEN_RECORD_ID) ?: return null
        intent.removeExtra(AlarmScheduling.EXTRA_OPEN_RECORD_ID)
        // 최근 앱 목록에서 다시 열면 시스템이 처음 인텐트를 그대로 다시 준다 → 옛 알람 일정을 또 열지 않는다
        if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return null
        // 그 알람이 아직 울리는 중이면 JS에 넘기지 않는다. JS는 받으면 "본 것"으로 보고 울림을 끄고 상세를 여는데,
        // 울리는 중에는 울림 화면(OnActivityEntersForeground)에서 사용자가 끄기·5분 후를 직접 고르게 한다.
        // 울림이 끝난 뒤(다음 슬롯 대기 중)에 누른 것은 예전처럼 넘겨 남은 재알림 취소 + 상세 열기.
        if (AlarmService.currentRinging?.recordId == id) return null
        return id
    }

    companion object {
        @Volatile private var pendingOpenRecordId: String? = null
    }
}
