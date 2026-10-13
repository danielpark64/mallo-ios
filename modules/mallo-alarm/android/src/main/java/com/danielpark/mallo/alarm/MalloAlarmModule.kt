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

        /** key = Expo 식별자와 동일(mallo_<recordId>_<slot>). 같은 키로 다시 부르면 덮어쓴다. */
        Function("schedule") { key: String, recordId: String, triggerAtMs: Double, title: String, body: String, soundOn: Boolean, vibOn: Boolean ->
            val e = AlarmStore.Entry(
                key = key, recordId = recordId, triggerAtMs = triggerAtMs.toLong(),
                title = title, body = body, soundOn = soundOn, vibOn = vibOn,
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
}
