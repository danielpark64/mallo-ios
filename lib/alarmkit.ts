// iOS 26+ AlarmKit 연결(modules/sayram-alarmkit) — 경로 결정은 ./alarmkitRoute.ts(순수), 여기는 네이티브 호출만.
// notifications.ts 밖에서 직접 쓰지 말 것(알람 진입점은 notifications.ts 하나).
//
// 원장: 네이티브가 "AlarmKit 예약 UUID → { 슬롯 식별자, recordId, 원래 일정 id }"를 UserDefaults에 적어 둔다
// (Android 네이티브 원장과 같은 역할). 개별 취소는 원장에서 식별자/recordId로 찾아 지우고, 전체 정리는
// 원장 + AlarmKit이 알고 있는 이 앱의 예약 전부를 지운다(지금 울리는 중인, 남아 있는 일정의 것만 남김).
//
// ⚠️ 모든 예약·취소는 serial() 직렬 큐로만 보낸다 — 네이티브가 JS 호출 순서대로 처리하게 하는 것까지만 한다.
// 겹친 resyncAlarms에서 앞 호출이 뒤 호출의 cancelAll **뒤에** 새 schedule을 넣는 것은 이 큐로는 못 막는다.
// 그것은 notifications.ts의 세대 번호(resyncGen)가 막는다: 새 재동기화가 시작되면 앞 호출은 다음 슬롯을 큐에 넣기 전에 멈춘다.
// (이미 큐에 들어간 앞 호출의 schedule은 뒤 호출의 cancelAll보다 먼저 처리되므로 거기서 지워진다.)
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Linking, Platform } from 'react-native';

import { alarmKitEnabled, alarmKitUuid, shouldAskAlarmKit, type AlarmKitAuth, type AlarmKitEnv } from './alarmkitRoute';

type ScheduleOptions = {
  id: string;           // 예약 UUID(alarmKitUuid)
  key: string;          // 슬롯 식별자(mallo_<id>_0 / mallo_<id>_pre30) — 레코드의 notifIds와 같은 값
  recordId: string;     // 정각: 일정 id, 미리 알림: <id>#pre<분>(Android 네이티브와 같은 규칙)
  baseRecordId: string; // 원래 일정 id — 전체 정리 때 "남아 있는 일정인지" 판단용
  fireMs: number;
  title: string;
  stopText: string;     // iOS 26.0은 끄기 버튼을 직접 줘야 한다(26.1부터 시스템이 그린다)
  sound: string;        // 앱 번들 소리 파일 이름(lib/alarmSounds.iosSoundFile — alarm_long.wav / snd_<id>.caf)
  snoozeText: string;   // 울림 화면 [5분 후 다시] 버튼 글자(1.2.4)
  snoozeMin: number;    // 다시 울릴 때까지 분(0이면 버튼 없음)
  snooze: boolean;      // JS가 "5분 후 다시"로 다시 건 슬롯 — 재동기화가 남긴다(lib/snoozeKeep.ts)
};
type Native = {
  isAvailable(): boolean;
  authorizationState(): AlarmKitAuth;
  requestAuthorization(): Promise<AlarmKitAuth>;
  schedule(o: ScheduleOptions): Promise<boolean>;
  cancelKeys(keys: string[]): Promise<number>;
  cancelForRecord(recordId: string): Promise<number>;
  cancelAll(keepBaseRecordIds: string[], rearmBaseRecordIds: string[]): Promise<number>;
  listScheduled(): Promise<{ id: string; key: string; recordId: string; state: string; when: number | null }[]>;
};

function getNative(): Native | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireOptionalNativeModule<Native>('SayramAlarmKit');
  } catch {
    return null;
  }
}

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
}

export function alarmKitEnv(): AlarmKitEnv {
  const native = getNative();
  let available = false;
  try { available = !!native && native.isAvailable(); } catch {}
  let auth: AlarmKitAuth = 'unavailable';
  if (available) { try { auth = native!.authorizationState(); } catch {} }
  return { os: Platform.OS, available, auth };
}

/** 지금 소리 알람을 AlarmKit으로 보내는 방식인지 — 예약할 때마다 새로 판정한다(설정 앱에서 권한을 바꿔도 바로 따라감). */
export function isAlarmKitMode(): boolean {
  return alarmKitEnabled(alarmKitEnv());
}

/** iOS 26+에서 아직 안 물었으면 한 번 묻는다. 반환: 물은 결과 허용됐는지. */
export async function requestAlarmKitIfNeeded(): Promise<boolean> {
  const native = getNative();
  if (!native || !shouldAskAlarmKit(alarmKitEnv())) return false;
  try { await native.requestAuthorization(); } catch {}
  return isAlarmKitMode();
}

/** 설정 화면 안내용 AlarmKit 권한 상태(iOS 26 미만·Android는 'unavailable') */
export function alarmKitAuthState(): AlarmKitAuth {
  return alarmKitEnv().auth;
}

/** 설정 화면에서 누름: 아직 안 물었으면 묻고, 거부했으면 설정 앱의 세이람 화면("알람 및 타이머" 스위치)을 연다. */
export async function openAlarmKitPermission(): Promise<void> {
  const auth = alarmKitAuthState();
  if (auth === 'notDetermined') { await requestAlarmKitIfNeeded(); return; }
  if (auth === 'denied') { try { await Linking.openSettings(); } catch {} }
}

/** AlarmKit 울림 화면의 [5분 후 다시] 간격(분) — Expo 알림의 "5분 후 다시"·Android 네이티브 스누즈와 같다 */
export const ALARMKIT_SNOOZE_MIN = 5;

/** 슬롯 하나를 AlarmKit에 건다. false면 실패(호출한 쪽이 Expo 방식으로 대신 건다).
 *  snoozeText를 주면 울림 화면에 [5분 후 다시] 버튼이 붙는다. snooze: JS가 5분 후로 다시 건 슬롯(재동기화가 남김) */
export function scheduleAlarmKit(p: { key: string; recordId: string; baseRecordId: string; at: Date; title: string; stopText: string; sound?: string; snoozeText?: string; snooze?: boolean }): Promise<boolean> {
  const native = getNative();
  if (!native) return Promise.resolve(false);
  const fireMs = p.at.getTime();
  const o: ScheduleOptions = {
    id: alarmKitUuid(p.key, fireMs), key: p.key, recordId: p.recordId, baseRecordId: p.baseRecordId,
    fireMs, title: p.title, stopText: p.stopText, sound: p.sound || 'alarm_long.wav',
    snoozeText: p.snoozeText ?? '', snoozeMin: p.snoozeText ? ALARMKIT_SNOOZE_MIN : 0, snooze: !!p.snooze,
  };
  return serial(() => native.schedule(o)).catch(() => false);
}

// 취소는 방식과 무관하게 항상 부른다(권한을 끈 뒤에도 예전에 AlarmKit으로 걸린 것이 남지 않게).
export function cancelAlarmKitKeys(keys: string[]): Promise<number> {
  const native = getNative();
  if (!native || keys.length === 0) return Promise.resolve(0);
  return serial(() => native.cancelKeys(keys)).catch(() => 0);
}

export function cancelAlarmKitForRecord(recordId: string): Promise<number> {
  const native = getNative();
  if (!native) return Promise.resolve(0);
  return serial(() => native.cancelForRecord(recordId)).catch(() => 0);
}

/** 재동기화용 전체 정리. keepBaseRecordIds(남아 있고 결과 표시가 없는 일정)에 속한 것 가운데
 *  지금 울리는 중·[5분 후 다시] 카운트다운 중인 것과 JS가 건 스누즈 슬롯은 남긴다 — 울림·스누즈가 끊기지 않게(1.2.4 버그 31).
 *  rearmBaseRecordIds: 앞으로의 정각으로 다시 걸리는 일정 — 그 일정의 정각 스누즈 슬롯은 지운다(lib/snoozeKeep.ts 규칙).
 *  지운 일정·결과를 표시한 일정의 것은 상태와 무관하게 지운다. */
export function cancelAllAlarmKit(keepBaseRecordIds: string[] = [], rearmBaseRecordIds: string[] = []): Promise<number> {
  const native = getNative();
  if (!native) return Promise.resolve(0);
  return serial(() => native.cancelAll(keepBaseRecordIds, rearmBaseRecordIds)).catch(() => 0);
}

export function listAlarmKit(): Promise<{ id: string; key: string; recordId: string; state: string; when: number | null }[]> {
  const native = getNative();
  if (!native) return Promise.resolve([]);
  return serial(() => native.listScheduled()).catch(() => []);
}
