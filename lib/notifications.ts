import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldShowInForeground: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true, allowCriticalAlerts: true },
  });
  return status === 'granted';
}

export async function registerNotificationCategories() {
  await Notifications.setNotificationCategoryAsync('alarm', [
    {
      identifier: 'stop',
      buttonTitle: '알람 끄기',
      options: { isDestructive: false, isAuthenticationRequired: false },
    },
    ...(Platform.OS === 'android'
      ? [{ identifier: 'snooze', buttonTitle: '5분 후', options: { isDestructive: false, isAuthenticationRequired: false } }]
      : []),
  ]);
}

const SOUND = Platform.OS === 'ios' ? 'alarm_long.wav' : 'alarm_long.wav';

/**
 * 지정 시각에 알람 예약 (main + +1분 + +2분 반복 슬롯).
 * 반환값: 등록된 notification identifier 배열 (취소에 사용).
 */
export async function scheduleAlarm(
  recordId: string,
  content: string,
  at: Date
): Promise<string[]> {
  if (at.getTime() <= Date.now()) return [];

  const ids: string[] = [];
  const base: Notifications.NotificationContentInput = {
    title: '말로',
    body: content,
    sound: SOUND,
    categoryIdentifier: 'alarm',
    data: { recordId },
  };

  // 메인 + +1분 + +2분 슬롯
  for (const offset of [0, 1, 2]) {
    const fireAt = new Date(at.getTime() + offset * 60 * 1000);
    try {
      const id = await Notifications.scheduleNotificationAsync({
        identifier: `mallo_${recordId}_${offset}`,
        content: { ...base, data: { recordId, slotOffset: offset } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
        },
      });
      ids.push(id);
    } catch (e) {
      console.warn(`알림 등록 실패 (offset ${offset}):`, e);
    }
  }
  return ids;
}

/** 레코드에 연결된 알람 알림 전부 취소 */
export async function cancelAlarm(notifIds: string[]): Promise<void> {
  await Promise.all(
    notifIds.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
    )
  );
}

/** recordId로 예약된 알림 전부 취소 (response handler용) */
export async function cancelAlarmByRecordId(recordId: string): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => (n.content.data as any)?.recordId === recordId)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {}))
  );
}
