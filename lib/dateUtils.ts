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

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setHours(12, 0, 0, 0); // DST/월말 경계에서 날짜가 밀리지 않도록 정오 기준으로 계산
  c.setDate(c.getDate() + n);
  return startOfDay(c);
}

export function addMonths(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(1); // 말일(31일)에서 두 달 넘기면 날짜가 튀는 것 방지
  c.setMonth(c.getMonth() + n);
  return c;
}

/** 그 날이 속한 주의 일요일 */
export function startOfWeek(d: Date): Date {
  return addDays(startOfDay(d), -d.getDay());
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * 접이식 달력용 — 항상 6행 x 7열, 인접 월 날짜 포함, null 없음.
 * (기존 monthGrid는 빈칸이 null이라 접이식 높이 계산에 못 쓴다.
 *  monthGrid의 유일한 호출부인 구 Calendar.tsx가 폐기되므로 별도로 둔다.)
 */
export function monthMatrix(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = addDays(startOfDay(first), -first.getDay());
  const rows: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let d = 0; d < 7; d++) row.push(addDays(start, w * 7 + d));
    rows.push(row);
  }
  return rows;
}

/** anchor가 속한 달의 monthMatrix 안에서 anchor가 몇 번째 행(0~5)인지. 없으면 -1 */
export function weekIndexOf(year: number, month: number, anchor: Date): number {
  const rows = monthMatrix(year, month);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some((d) => isSameDay(d, anchor))) return i;
  }
  return -1;
}

/** anchor가 속한 주 7일 (일요일 시작) */
export function weekRow(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
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
