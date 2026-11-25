// 알람 화면 권한 안내 — 울릴 때 끄기 화면이 맨 앞에 뜨게 하는 권한이 꺼져 있으면 알려 준다(순수 함수만, jest에서 그대로 돈다).
//
// Android: 잠금이 풀린 채 다른 앱을 쓰는 중에는 전체 화면 알림이 배너로만 뜬다 → "다른 앱 위에 표시"가 있어야 울림 화면이
//   맨 앞에 뜬다. Android 14+는 "전체 화면 알림"이 꺼져 있으면 잠금·화면 꺼짐 상태에서도 배너만 뜬다(이쪽이 더 기본이라 먼저 묻는다).
// iOS: 앱이 스스로 맨 앞에 나올 수 없다. iOS 26+에서 AlarmKit("알람 및 타이머")을 거부했으면 일반 알림 배너로만 울리므로 켜 달라고 한다.
//
// 두 플랫폼 공통: 알림 권한이 꺼져 있으면 알람 알림도, Android의 전체 화면 알림 경로도 막힌다 → 가장 먼저 묻는다.
// 배터리 최적화는 여기서 묻지 않는다(시작·알람 저장 때 절대 안 띄움 — 사용자 결정 11-25). 알람은 setAlarmClock이 1순위라
// Doze에서도 울린다(AlarmScheduling.kt). 늦게 울리는 폰을 위해 설정 화면의 '배터리 최적화 제외' 줄만 남긴다.
//
// 자주 묻지 않는다: 시작 때는 다가오는 알람이 있을 때만, 한 번 물으면 ASK_INTERVAL_MS 동안 다시 묻지 않는다(설정 화면 줄은 늘 있다).
// 알람을 저장한 직후에는 꺼진 것이 있으면 한 실행에 한 번만 묻는다(시작 때 이미 물었으면 안 묻는다 — shouldAskAfterSave).
// 단 안내를 보고 설정으로 갔다가 돌아왔는데 다른 권한이 아직 꺼져 있으면 그 자리에서 이어서 한 번 더 묻는다(App.tsx).

export type AlarmScreenNeed = 'notif' | 'fsi' | 'overlay' | 'alarmkit';

export type AlarmScreenEnv = {
  os: string;
  /** Android 14+ 전체 화면 알림 허용(13 이하는 늘 true) */
  fullScreenIntent: boolean;
  /** Android "다른 앱 위에 표시" */
  overlay: boolean;
  /** iOS AlarmKit 권한('unavailable' = iOS 26 미만·Android) */
  alarmKit: 'notDetermined' | 'denied' | 'authorized' | 'unavailable';
  /** 알림 권한(Android 13+ POST_NOTIFICATIONS·iOS). 모르면 true */
  notifications?: boolean;
};

export const ASK_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

/** 지금 꺼져 있어 안내할 권한 하나(먼저 켜야 할 것부터). 없으면 null */
export function nextAlarmScreenNeed(env: AlarmScreenEnv, skip: AlarmScreenNeed[] = []): AlarmScreenNeed | null {
  const order: AlarmScreenNeed[] = [];
  if ((env.os === 'android' || env.os === 'ios') && env.notifications === false) order.push('notif');
  if (env.os === 'android') {
    if (!env.fullScreenIntent) order.push('fsi');
    if (!env.overlay) order.push('overlay');
  } else if (env.os === 'ios') {
    // 아직 안 물은 상태(notDetermined)는 시작 흐름이 시스템 창으로 묻는다 — 거부한 경우만 안내
    if (env.alarmKit === 'denied') order.push('alarmkit');
  }
  return order.find((n) => !skip.includes(n)) ?? null;
}

/** 시작할 때 물을지: 다가오는 알람이 있고, 마지막으로 물은 지 ASK_INTERVAL_MS가 지났을 때 */
export function shouldAskAlarmScreen(lastAskedAt: number, now: number, hasUpcomingAlarm: boolean): boolean {
  if (!hasUpcomingAlarm) return false;
  if (!(lastAskedAt > 0)) return true;
  // 기기 시계를 되돌린 경우(미래 값)도 다시 물을 수 있게
  return now - lastAskedAt >= ASK_INTERVAL_MS || lastAskedAt > now;
}

/** 알람을 저장한 직후 물을지: 알람이 걸렸고, 이번 실행에서 아직 안 물었을 때(꺼진 권한이 있는지는 호출자가 본다) */
export function shouldAskAfterSave(armed: boolean, askedThisRun: boolean): boolean {
  return armed && !askedThisRun;
}
