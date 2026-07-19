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
  await Notifications.setNotificationCategoryAsync(
    'alarm',
    [
      {
        identifier: 'stop',
        buttonTitle: '알람 끄기',
        options: { isDestructive: false, isAuthenticationRequired: false, opensAppToForeground: true },
      },
      {
        identifier: 'snooze',
        buttonTitle: '5분 후 다시',
        options: { isDestructive: false, isAuthenticationRequired: false, opensAppToForeground: true },
      },
    ],
    // iOS: 워치/배너에서 스와이프로 닫기만 해도 응답 이벤트가 오도록 (재알림 취소 누락 방지)
    { customDismissAction: true }
  );
}

const SOUND = Platform.OS === 'ios' ? 'alarm_long.wav' : 'alarm_long.wav';

/**
 * 지정 시각에 알람 예약 (main + +1분 + +2분 반복 슬롯).
 * 반환값: 등록된 notification identifier 배열 (취소에 사용).
 */
export async function scheduleAlarm(
  recordId: string,
  content: string,
  at: Date,
  mode: 'both' | 'sound' | 'vibe' = 'both'
): Promise<string[]> {
  if (at.getTime() <= Date.now()) return [];

  const ids: string[] = [];
  const base: Notifications.NotificationContentInput = {
    title: '말로',
    body: content,
    // iOS: sound 있으면 자동 진동, sound 없으면 무진동
    // both/sound → alarm_long.wav (iOS는 소리+진동 자동), vibe → 무음(배너만)
    sound: mode === 'vibe' ? undefined : SOUND,
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

/**
 * 앱 시작 시 전체 알람 재동기화.
 * - 삭제된 일정의 잔여 알림 정리 (전부 취소 후 재등록)
 * - iOS 로컬 알림 64개 제한 대응: 가까운 일정부터 예산(60개) 안에서만 등록
 */
export async function resyncAlarms(
  records: Array<{
    id: string;
    content: string;
    transcript: string;
    scheduleAt: number | null;
    hasTime: boolean;
    alarmMode?: 'both' | 'sound' | 'vibe';
  }>
): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = Date.now();
    const future = records
      .filter((r) => r.hasTime && r.scheduleAt != null && r.scheduleAt > now)
      .sort((a, b) => (a.scheduleAt ?? 0) - (b.scheduleAt ?? 0));
    let budget = 60; // 64개 한도에서 여유분 확보
    for (const r of future) {
      if (budget < 3) break;
      const ids = await scheduleAlarm(
        r.id,
        r.content || r.transcript,
        new Date(r.scheduleAt!),
        r.alarmMode ?? 'both'
      );
      budget -= ids.length;
    }
  } catch (e) {
    console.warn('알람 재동기화 실패:', e);
  }
}
