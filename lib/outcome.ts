// ─── 지난 일정의 결과 ───────────────────────────────────────────────────────────
// 지난 일정은 표시가 없으면 "한 것"으로 본다. 안 했거나(못 했어요) 덜 했거나(덜 했어요)
// 바뀐 것(바뀌었어요)만 사용자가 표시한다 — 2026-10-22 사용자: "완료된 건 건드릴 것 없고".
// 바뀌었어요·덜 했어요는 새 날짜로 일정을 다시 잡을 수 있고, 원래 일정에 "→ 새 날짜"가 남는다.
// 아직 오지 않은 일정도 "미루기"로 새 날짜에 다시 잡을 수 있다(바뀌었어요와 같은 'moved').
// 미룬 원래 일정은 알람을 걸지 않는다(isMovedAway) — 새 일정 쪽에서만 울린다.
// 화면·알람과 무관한 순수 함수만 둔다(알람 예약·취소는 App.tsx가 lib/notifications.ts로).

import { formatDayHeader, formatTime } from './dateUtils';
import { t } from './i18n';
import type { OutcomeKind, ScheduleRecord } from './storage';

export const OUTCOME_KINDS: OutcomeKind[] = ['skipped', 'partial', 'moved'];

/** 상세 화면 버튼 이름 */
export const OUTCOME_BUTTON: Record<OutcomeKind, string> = {
  skipped: '못 했어요',
  partial: '덜 했어요',
  moved: '바뀌었어요',
};

/** 다른 날로 옮겨 간 일정 — 알람을 걸지 않는다 */
export function isMovedAway(r: Pick<ScheduleRecord, 'outcome'>): boolean {
  return r.outcome?.kind === 'moved';
}

/** 카드·내보내기 꼬리표 이름 */
const OUTCOME_TAG: Record<OutcomeKind, string> = {
  skipped: '못 함',
  partial: '덜 함',
  moved: '바뀜',
};

/** 다시 잡은 날짜 — "10월 25일 (토) 오후 3:00" */
export function nextWhen(r: Pick<ScheduleRecord, 'outcome'>): string {
  const at = r.outcome?.nextAt;
  if (at == null) return '';
  const d = new Date(at);
  return formatDayHeader(d) + (r.outcome?.nextHasTime === false ? '' : ' ' + formatTime(d));
}

/** 꼬리표 — "못 함", "바뀜 → 10월 25일", 표시가 없으면 '' */
export function outcomeTag(r: Pick<ScheduleRecord, 'outcome'>): string {
  const o = r.outcome;
  if (!o) return '';
  const label = t(OUTCOME_TAG[o.kind]);
  if (o.nextAt == null) return label;
  const d = new Date(o.nextAt);
  return `${label} → ${t('{m}월 {d}일', { m: d.getMonth() + 1, d: d.getDate() })}`;
}

/** 결과 표시를 바꾼다(kind=null이면 지운다 = 다시 "한 것"). 다시 잡은 일정 연결은 keepLink일 때만 남긴다 */
export function setOutcome(
  records: ScheduleRecord[], id: string, kind: OutcomeKind | null, keepLink = true,
): ScheduleRecord[] {
  return records.map((r) => {
    if (r.id !== id) return r;
    if (!kind) return { ...r, outcome: undefined };
    const link = keepLink && r.outcome?.nextId
      ? { nextId: r.outcome.nextId, nextAt: r.outcome.nextAt, nextHasTime: r.outcome.nextHasTime }
      : {};
    return { ...r, outcome: { kind, ...link } };
  });
}

/** 원래 일정(fromId)과 다시 잡은 새 일정을 잇는다 — 새 일정은 records에 이미 들어 있어야 한다 */
export function linkCarry(
  records: ScheduleRecord[], fromId: string, kind: OutcomeKind, next: ScheduleRecord,
): ScheduleRecord[] {
  if (!records.some((r) => r.id === fromId)) return records; // 그사이 원래 일정이 지워졌으면 잇지 않는다
  return records.map((r) => {
    if (r.id === fromId) {
      return { ...r, outcome: { kind, nextId: next.id, nextAt: next.scheduleAt ?? undefined, nextHasTime: next.hasTime } };
    }
    if (r.id === next.id) return { ...r, carriedFrom: fromId };
    return r;
  });
}

/** 결과 표시를 지우고, 다시 잡은 일정 쪽의 "← 원래 일정" 연결도 끊는다(그 일정은 남는다) */
export function dropOutcome(records: ScheduleRecord[], id: string): ScheduleRecord[] {
  const nextId = records.find((r) => r.id === id)?.outcome?.nextId;
  return records.map((r) => {
    if (r.id === id) return { ...r, outcome: undefined };
    if (nextId && r.id === nextId && r.carriedFrom === id) return { ...r, carriedFrom: undefined };
    return r;
  });
}

/** 다시 잡은 일정의 날짜를 고치면 원래 일정의 "→ 날짜"도 따라 바꾼다 */
export function syncCarryDate(records: ScheduleRecord[], editedId: string): ScheduleRecord[] {
  const edited = records.find((r) => r.id === editedId);
  if (!edited?.carriedFrom) return records;
  return records.map((r) =>
    r.id === edited.carriedFrom && r.outcome?.nextId === editedId
      ? { ...r, outcome: { ...r.outcome, nextAt: edited.scheduleAt ?? undefined, nextHasTime: edited.hasTime } }
      : r
  );
}

/** 일정을 지우면 그 일정을 가리키던 연결을 끊는다(표시는 남고 "→ 날짜"만 빠진다) */
export function unlinkDeleted(records: ScheduleRecord[], deletedId: string): ScheduleRecord[] {
  return records.map((r) => {
    if (r.outcome?.nextId === deletedId) return { ...r, outcome: { kind: r.outcome.kind } };
    if (r.carriedFrom === deletedId) return { ...r, carriedFrom: undefined };
    return r;
  });
}

/** 다시 잡을 때 기본 날짜: 내일(아직 오지 않은 일정이면 그다음 날), 원래 시각(시간 미정이면 9시) */
export function carryDefaultDate(r: Pick<ScheduleRecord, 'scheduleAt' | 'hasTime'>, now: Date = new Date()): Date {
  const base = r.scheduleAt != null && r.scheduleAt > now.getTime() ? new Date(r.scheduleAt) : now;
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, 9, 0, 0, 0);
  if (r.hasTime && r.scheduleAt != null) {
    const o = new Date(r.scheduleAt);
    d.setHours(o.getHours(), o.getMinutes(), 0, 0);
  }
  return d;
}
