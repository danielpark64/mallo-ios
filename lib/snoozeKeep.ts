// ─── 재동기화 때 "5분 후 다시"(스누즈)를 남길지 정하는 순수 함수 (1.2.4, 버그 31) ─────────────────────────
// 예전 resyncAlarms는 Expo·Android 네이티브·AlarmKit을 통째로 지운 뒤 앞으로 울릴 일정만 다시 걸었다 →
// 이미 지난 일정에 걸린 스누즈가 앱을 다시 열기만 해도 사라졌다(교대알람 1.6.3 0012cfc와 같은 문제).
// 교대알람처럼 재동기화는 스누즈를 지우지 않고, 지금 일정 목록과 맞춰 보아 더는 울리면 안 되는 것만 지운다:
//   - 일정이 없어졌다(삭제) → 지운다
//   - 결과를 표시했다(못 했어요·덜 했어요·바뀌었어요 = outcome) → 지운다(버그 30과 같은 기준)
//   - 정각 알람의 스누즈인데 그 일정이 앞으로의 시각으로 다시 걸린다 → 지운다(새 정각 알람이 울린다. 같은 키라 어차피 덮인다)
//   - 그 밖(남아 있는 일정의 정각·미리 알림 스누즈) → 남긴다
// 판정만 여기서 하고, 실제 취소는 lib/notifications.ts resyncAlarms(세 경로 모두)가 한다.
// ⚠️ 같은 규칙의 복제본이 두 곳 더 있다 — 규칙을 바꾸면 세 곳을 함께 고칠 것:
//   Android modules/mallo-alarm/.../AlarmScheduling.kt snoozeStillDue·cancelAllKeepSnooze,
//   iOS modules/sayram-alarmkit/ios/SayramAlarmKitModule.swift cancelAll("snz" 판정).
// 참고: 1.2.3 이하에서 건 JS 스누즈(Expo data.snooze·AlarmKit "snz" 표시 없음)는 1.2.4로 올린 뒤 첫 재동기화에서 예전처럼 지워진다
// (Android 네이티브는 1.2.3부터 meta.snoozed가 있어 남는다). 업데이트 순간에만 생기는 일이다.
// willRearm은 exactAlarm=false·iOS 예산 밖 일정도 "다시 건다"로 친다 — 정각 스누즈는 정각이 이미 울렸다는 뜻이고,
// 정각을 미래로 옮기는 편집은 모두 cancelAlarmGroup을 거치므로 실제로는 생기지 않는 경우다.

export type SnoozeRecord = {
  id: string;
  scheduleAt: number | null;
  hasTime: boolean;
  needsDate?: boolean;
  outcome?: { kind: string };
};

export type SnoozePlan = {
  /** 스누즈를 남겨도 되는 일정(원래 일정 id) — 남아 있고 결과 표시가 없는 일정 */
  keepBase: string[];
  /** 이번 재동기화에서 앞으로의 정각으로 다시 걸리는 일정 — 이 일정의 "정각" 스누즈는 남기지 않는다(미리 알림 스누즈는 남김) */
  rearmBase: string[];
};

/** 결과(못 했어요·덜 했어요·바뀌었어요)를 표시한 일정은 더 울리지 않는다 — 스누즈 응답·재동기화 공용(버그 30) */
export function silencedByOutcome(r: { outcome?: { kind: string } } | undefined | null): boolean {
  return !!r?.outcome;
}

/** resyncAlarms가 정각 알람을 다시 거는 일정인지(그 함수의 future 거르기와 같은 기준) */
export function willRearm(r: SnoozeRecord, now: number): boolean {
  return !r.needsDate && r.hasTime && r.scheduleAt != null && r.scheduleAt > now && r.outcome?.kind !== 'moved'; // 미룬 일정은 다시 걸지 않는다(lib/outcome isMovedAway)
}

export function snoozePlan(records: SnoozeRecord[], now: number = Date.now()): SnoozePlan {
  const keepBase: string[] = [];
  const rearmBase: string[] = [];
  for (const r of records) {
    if (silencedByOutcome(r)) continue;
    keepBase.push(r.id);
    if (willRearm(r, now)) rearmBase.push(r.id);
  }
  return { keepBase, rearmBase };
}

/** "id#pre30" → "id" (lib/reminders.ts preRecordId 규칙) */
export function baseOfRecordId(recordId: string): string {
  const i = recordId.indexOf('#');
  return i < 0 ? recordId : recordId.slice(0, i);
}

/** 이 recordId(정각: 일정 id, 미리 알림: id#pre분)에 걸린 스누즈를 남길지 */
export function snoozeStillDue(recordId: string, plan: SnoozePlan): boolean {
  if (!recordId) return false;
  const base = baseOfRecordId(recordId);
  if (!plan.keepBase.includes(base)) return false;
  if (recordId === base && plan.rearmBase.includes(base)) return false;
  return true;
}
