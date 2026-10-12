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
