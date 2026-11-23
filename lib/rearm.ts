// 일정 화면에서 고친 일정의 알람을 다시 건다 — 저장·되돌리기 둘 다 여기로.
// 진입점은 lib/notifications.ts만 쓴다: 옛 알람 묶음(Expo + AlarmManager 두 경로)을 먼저 끄고, 울릴 시각이 있으면 새로 건다.
import { cancelAlarmGroup, scheduleAlarm } from './notifications';
import type { AlarmMode } from './notifications';
import { isMovedAway } from './outcome';
import type { ScheduleRecord } from './storage';
import { voiceUriOf } from './voiceAlarm';

export type RearmSpec = {
  content: string;
  /** 울릴 시각. null이면 끄기만 한다(지난 시각·시간 미정·날짜 미정·미룸) */
  at: Date | null;
  alarmMode?: AlarmMode;
  remindBefore?: number[];
  exactAlarm?: boolean;
  voiceUri?: string | null;
  /** 일정에 고른 알람 소리(없으면 설정 기본) */
  alarmSound?: string;
};

/** 옛 알람을 끄고 새로 건다. 새 알림 id 목록(없으면 undefined)을 돌려준다 */
export async function rearmAlarms(id: string, oldNotifIds: string[] | undefined, spec: RearmSpec): Promise<string[] | undefined> {
  await cancelAlarmGroup(id, oldNotifIds);
  if (!spec.at) return undefined;
  const ids = await scheduleAlarm(id, spec.content, spec.at, spec.alarmMode ?? 'both', {
    remindBefore: spec.remindBefore, exactAlarm: spec.exactAlarm, voiceUri: spec.voiceUri, alarmSound: spec.alarmSound,
  });
  return ids.length ? ids : undefined;
}

/** 저장된 레코드 그대로 울릴 시각(되돌리기용): 시간이 있고, 날짜가 정해졌고, 앞으로이고, 미루지 않았을 때만 */
export function alarmTimeOf(r: ScheduleRecord, now = Date.now()): Date | null {
  return r.hasTime && !r.needsDate && r.scheduleAt != null && r.scheduleAt > now && !isMovedAway(r)
    ? new Date(r.scheduleAt) : null;
}

/** 되돌리기: 현재 알람을 끄고 바꾸기 전 레코드 값으로 다시 건다 */
export function rearmToRecord(prev: ScheduleRecord, curNotifIds: string[] | undefined, now = Date.now()) {
  return rearmAlarms(prev.id, curNotifIds, {
    content: prev.content || prev.transcript, at: alarmTimeOf(prev, now), alarmMode: prev.alarmMode,
    remindBefore: prev.remindBefore, exactAlarm: prev.exactAlarm, voiceUri: voiceUriOf(prev), alarmSound: prev.alarmSound,
  });
}
