import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  EXPO_FALLBACK_GRACE_MS,
  cancelAllNativeAlarms,
  cancelNativeAlarms,
  cancelNativeAlarmsByRecordId,
  isNativeAlarmAvailable,
  scheduleNativeAlarm,
} from './nativeAlarm';

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

export type AlarmMode = 'both' | 'sound' | 'vibe';

// Android: 소리/진동은 알림 개별 설정이 아니라 "채널"에 묶이고, 채널은 한 번 만들면 설정이 고정된다.
// 모드별로 채널을 따로 두고 예약 시 channelId로 고른다. (채널 없이 예약하면 기본 채널로 가서
// 커스텀 알람음·최대 중요도가 적용되지 않는다.) iOS에서는 no-op.
const ANDROID_CHANNEL: Record<AlarmMode, string> = {
  both: 'alarm_both',
  sound: 'alarm_sound',
  vibe: 'alarm_vibe',
};

export async function registerAndroidChannels() {
  if (Platform.OS !== 'android') return;
  const common = {
    importance: Notifications.AndroidImportance.MAX,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM },
  };
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL.both, {
      ...common,
      name: '일정 알람 (소리+진동)',
      sound: 'alarm_long.wav',
      enableVibrate: true,
      vibrationPattern: [0, 500, 300, 500],
    });
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL.sound, {
      ...common,
      name: '일정 알람 (소리)',
      sound: 'alarm_long.wav',
      enableVibrate: false,
      vibrationPattern: null,
    });
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL.vibe, {
      ...common,
      name: '일정 알람 (진동)',
      sound: null,
      enableVibrate: true,
      vibrationPattern: [0, 500, 300, 500],
    });
  } catch (e) {
    console.warn('알림 채널 등록 실패:', e);
  }
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

const SOUND = 'alarm_long.wav';

/**
 * 지정 시각에 알람 예약 (main + +1분 + +2분 반복 슬롯).
 * 반환값: 등록된 notification identifier 배열 (취소에 사용). 네이티브 예약 키도 같은 문자열이다.
 *
 * Android 이중 알람: 슬롯마다 네이티브 AlarmManager(정확, T)와 Expo(보조, T+유예)를 같은 식별자로
 * 함께 건다. 네이티브가 울리면 리시버가 같은 식별자의 Expo 예약을 지워 중복을 막고, 네이티브가
 * 못 울린 경우에만 Expo가 유예 뒤 대신 울린다. iOS·네이티브 미빌드 환경은 Expo 단일 경로 그대로.
 */
export async function scheduleAlarm(
  recordId: string,
  content: string,
  at: Date,
  mode: AlarmMode = 'both'
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
  const useNative = isNativeAlarmAvailable();

  // 메인 + +1분 + +2분 슬롯
  for (const offset of [0, 1, 2]) {
    const fireAt = new Date(at.getTime() + offset * 60 * 1000);
    const identifier = `mallo_${recordId}_${offset}`;
    const nativeArmed =
      useNative &&
      scheduleNativeAlarm({ key: identifier, recordId, at: fireAt, title: '말로', body: content, mode });
    try {
      const id = await Notifications.scheduleNotificationAsync({
        identifier,
        content: { ...base, data: { recordId, slotOffset: offset } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: nativeArmed ? new Date(fireAt.getTime() + EXPO_FALLBACK_GRACE_MS) : fireAt,
          // Android: 모드별 채널로 소리/진동 결정 (iOS는 무시됨)
          channelId: ANDROID_CHANNEL[mode],
        },
      });
      ids.push(id);
    } catch (e) {
      console.warn(`알림 등록 실패 (offset ${offset}):`, e);
      // Expo 등록이 실패해도 네이티브는 걸렸으니 취소용 식별자는 남긴다
      if (nativeArmed) ids.push(identifier);
    }
  }
  return ids;
}

/** 레코드에 연결된 알람 알림 전부 취소 */
export async function cancelAlarm(notifIds: string[]): Promise<void> {
  cancelNativeAlarms(notifIds); // Android: 네이티브 슬롯(같은 키) + 그 일정의 스누즈 슬롯
  await Promise.all(
    notifIds.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
    )
  );
}

/** recordId로 예약된 알림 전부 취소 (response handler용) */
export async function cancelAlarmByRecordId(recordId: string): Promise<void> {
  cancelNativeAlarmsByRecordId(recordId); // Android: 울리는 중이면 멈추고 남은 네이티브 슬롯 정리
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
    alarmMode?: AlarmMode;
  }>
): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    cancelAllNativeAlarms(); // Android: 네이티브 원장도 전부 비운 뒤 아래에서 둘 다 다시 건다
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
