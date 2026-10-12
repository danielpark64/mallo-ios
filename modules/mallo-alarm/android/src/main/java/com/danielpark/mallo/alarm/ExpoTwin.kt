package com.danielpark.mallo.alarm

import android.content.Context
import expo.modules.notifications.service.NotificationsService

/**
 * 이중 알람에서 Expo 쪽 "쌍둥이" 알림 정리.
 *
 * JS는 슬롯마다 네이티브 예약(정확, T)과 Expo 예약(보조, T+유예)을 같은 식별자로 함께 건다.
 * 네이티브가 제때 울리면 여기서 같은 식별자의 Expo 예약을 지워 중복 알림을 막고,
 * 네이티브가 어떤 이유로 못 울리면(권한 철회·OEM 제한) Expo 예약이 유예 뒤에 그대로 울린다.
 *
 * expo-notifications의 NotificationsService는 리시버라 어떤 프로세스 상태에서도 브로드캐스트로
 * 동작한다. 실패해도(모듈 구조 변경 등) 알람 자체는 울려야 하므로 전부 삼킨다.
 */
object ExpoTwin {
    fun cancelScheduled(context: Context, identifiers: Collection<String>) {
        if (identifiers.isEmpty()) return
        try { NotificationsService.removeScheduledNotifications(context, identifiers) } catch (_: Throwable) {}
    }

    fun dismissPresented(context: Context, identifiers: Collection<String>) {
        if (identifiers.isEmpty()) return
        try { NotificationsService.dismiss(context, identifiers.toTypedArray()) } catch (_: Throwable) {}
    }

    /** 일정 하나의 Expo 슬롯 3개를 예약·표시 모두 정리 */
    fun clearRecord(context: Context, recordId: String) {
        val ids = (0..2).map { AlarmScheduling.expoKey(recordId, it) }
        cancelScheduled(context, ids)
        dismissPresented(context, ids)
    }
}
