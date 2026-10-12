// ─── 달력/날짜 공통 유틸 ──────────────────────────────────────────────────────
import type { ScheduleRecord } from './storage';

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY-M-D' 키 (로컬 기준) */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function dayKeyFromMs(ms: number): string {
  return dayKey(new Date(ms));
}

export function isSameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** 특정 날짜의 일정만 (시각 순) */
export function schedulesOn(records: ScheduleRecord[], date: Date): ScheduleRecord[] {
  const k = dayKey(date);
  return records
    .filter((r) => r.scheduleAt != null && dayKeyFromMs(r.scheduleAt) === k)
    .sort((a, b) => (a.scheduleAt ?? 0) - (b.scheduleAt ?? 0));
}

/** 일정이 있는 날짜 키 집합 (달력 dot 표시용) */
export function daysWithSchedules(records: ScheduleRecord[]): Set<string> {
  const s = new Set<string>();
  for (const r of records) {
    if (r.scheduleAt != null) s.add(dayKeyFromMs(r.scheduleAt));
  }
  return s;
}

/** 그 달의 달력 그리드(6주 x 7일) 날짜 배열. 앞뒤 빈칸은 null */
export function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startDow = first.getDay(); // 0=일
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function formatTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const mer = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${mer} ${h12}:${m.toString().padStart(2, '0')}`;
}

export function formatDayHeader(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

/** n일 뒤(음수면 앞) 자정 */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** 그 주의 일요일 자정 (주 시작 = 일요일) */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  return addDays(s, -s.getDay());
}

export function endOfWeek(d: Date): Date {
  return addDays(startOfWeek(d), 6);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** 기간(양 끝 날짜 포함) 안의 일정, 시각순 */
export function schedulesBetween(records: ScheduleRecord[], start: Date, end: Date): ScheduleRecord[] {
  const s = startOfDay(start).getTime();
  const e = addDays(startOfDay(end), 1).getTime();
  return records
    .filter((r) => r.scheduleAt != null && r.scheduleAt >= s && r.scheduleAt < e)
    .sort((a, b) => (a.scheduleAt ?? 0) - (b.scheduleAt ?? 0));
}

export function formatMonthLabel(year: number, month: number): string {
  return `${year}년 ${month + 1}월`;
}

/** "2026년 10월 12일 – 18일", 달이 바뀌면 "2026년 10월 29일 – 11월 4일" (연도는 주 시작일 기준) */
export function formatWeekLabel(weekStart: Date): string {
  const s = startOfWeek(weekStart);
  const e = addDays(s, 6);
  const sameMonth = s.getMonth() === e.getMonth();
  const head = `${s.getFullYear()}년 ${s.getMonth() + 1}월 ${s.getDate()}일`;
  return sameMonth ? `${head} – ${e.getDate()}일` : `${head} – ${e.getMonth() + 1}월 ${e.getDate()}일`;
}

/** 날짜별 섹션 — 전체 일정 탭·달력 기간 목록 공용. 날짜 미정은 맨 뒤 */
export type DaySection = { key: string; title: string; date: Date; data: ScheduleRecord[] };

export function groupByDay(records: ScheduleRecord[]): DaySection[] {
  const dated = records
    .filter((r) => r.scheduleAt != null)
    .sort((a, b) => (a.scheduleAt ?? 0) - (b.scheduleAt ?? 0));
  const groups = new Map<string, DaySection>();
  for (const r of dated) {
    const d = new Date(r.scheduleAt!);
    const key = dayKey(d);
    if (!groups.has(key)) {
      groups.set(key, { key, title: formatDayHeader(d), date: startOfDay(d), data: [] });
    }
    groups.get(key)!.data.push(r);
  }
  const result = Array.from(groups.values());
  const undated = records.filter((r) => r.scheduleAt == null);
  if (undated.length) result.push({ key: 'undated', title: '날짜 미정', date: new Date(0), data: undated });
  return result;
}

// ─── 미리 알림(하루 전) 표시용 ───────────────────────────────────────────────
// 하루 전 미리 알림은 실제 일정과 다른 날(전날 저녁 8시)에 울리므로 달력·그날 목록에 따로 보여준다.
// 같은 날 미리 알림(10분·30분·1시간 전)은 카드 배지로 충분해 여기서 다루지 않는다.
export type PreAlarmItem = { kind: 'pre'; id: string; record: ScheduleRecord; fireAt: number; minutes: number };
export type DayListItem = ScheduleRecord | PreAlarmItem;
export type DayListSection = { key: string; title: string; date: Date; data: DayListItem[] };

export function isPreAlarmItem(x: DayListItem): x is PreAlarmItem {
  return (x as PreAlarmItem).kind === 'pre';
}

/** 아직 안 울린 하루 전 미리 알림 항목(범위 안) */
export function preAlarmItems(records: ScheduleRecord[], start?: Date, end?: Date, now: number = Date.now()): PreAlarmItem[] {
  const out: PreAlarmItem[] = [];
  for (const r of records) {
    if (r.scheduleAt == null || !r.hasTime || r.scheduleAt <= now) continue;
    if (!(r.remindBefore ?? []).includes(1440)) continue;
    const at = new Date(r.scheduleAt);
    at.setDate(at.getDate() - 1);
    at.setHours(20, 0, 0, 0);
    const fireAt = at.getTime();
    if (fireAt <= now) continue;
    if (start && fireAt < start.getTime()) continue;
    if (end && fireAt > end.getTime()) continue;
    out.push({ kind: 'pre', id: `${r.id}#pre1440`, record: r, fireAt, minutes: 1440 });
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}

/** 하루 전 미리 알림이 있는 날 키 */
export function daysWithPreAlarms(records: ScheduleRecord[], now: number = Date.now()): Set<string> {
  return new Set(preAlarmItems(records, undefined, undefined, now).map((p) => dayKeyFromMs(p.fireAt)));
}

/** 날짜별 일정 섹션에 미리 알림 항목을 시각순으로 끼워 넣는다 (없는 날은 섹션을 만든다) */
export function mergePreAlarms(sections: DaySection[], items: PreAlarmItem[]): DayListSection[] {
  const map = new Map<string, DayListSection>();
  for (const s of sections) map.set(s.key, { ...s, data: [...s.data] });
  for (const p of items) {
    const d = new Date(p.fireAt);
    const key = dayKey(d);
    if (!map.has(key)) map.set(key, { key, title: formatDayHeader(d), date: startOfDay(d), data: [] });
    const sec = map.get(key)!;
    const timeOf = (x: DayListItem) => (isPreAlarmItem(x) ? x.fireAt : x.scheduleAt ?? 0);
    const idx = sec.data.findIndex((x) => timeOf(x) > p.fireAt);
    if (idx < 0) sec.data.push(p); else sec.data.splice(idx, 0, p);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.key === 'undated') return 1;
    if (b.key === 'undated') return -1;
    return a.date.getTime() - b.date.getTime();
  });
}
