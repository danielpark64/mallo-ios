// ─── 전체 일정 조회 필터 (순수 로직) ───────────────────────────────────────────
import { endOfWeek, isSameDay, startOfWeek } from './dateUtils';
import { t } from './i18n';
import type { ScheduleRecord } from './storage';

export type PeriodPreset = 'all' | 'today' | 'week' | 'month' | 'custom';

export type RecordFilter = {
  preset: PeriodPreset;
  /** preset === 'custom' 일 때만 의미. null은 "전체" */
  year: number | null;
  month: number | null; // 1~12
  day: number | null;   // 1~31
  keyword: string;
};

export const EMPTY_FILTER: RecordFilter = { preset: 'all', year: null, month: null, day: null, keyword: '' };

export function isFilterActive(f: RecordFilter): boolean {
  if (f.keyword.trim()) return true;
  if (f.preset === 'custom') return f.year != null || f.month != null || f.day != null;
  return f.preset !== 'all';
}

/** 칩에 보여줄 기간 설명. 직접 선택이면 "2026년 10월 15일"처럼 고른 항목만 */
export function describePeriod(f: RecordFilter): string {
  switch (f.preset) {
    case 'today': return t('오늘');
    case 'week': return t('이번 주');
    case 'month': return t('이번 달');
    case 'custom': {
      const parts: string[] = [];
      if (f.year != null) parts.push(t('{n}년', { n: f.year }));
      if (f.month != null) parts.push(t('{n}월', { n: f.month }));
      if (f.day != null) parts.push(t('{n}일', { n: f.day }));
      return parts.length ? parts.join(' ') : t('기간 선택');
    }
    default: return t('전체');
  }
}

function matchesPeriod(r: ScheduleRecord, f: RecordFilter, now: Date): boolean {
  if (f.preset === 'all') return true;
  if (f.preset === 'custom' && f.year == null && f.month == null && f.day == null) return true;
  if (r.scheduleAt == null) return false; // 날짜 미정은 기간 조건이 있으면 제외
  const d = new Date(r.scheduleAt);
  switch (f.preset) {
    case 'today': return isSameDay(d, now);
    case 'week': return d >= startOfWeek(now) && d.getTime() < endOfWeek(now).getTime() + 86_400_000;
    case 'month': return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    case 'custom':
      return (
        (f.year == null || d.getFullYear() === f.year) &&
        (f.month == null || d.getMonth() + 1 === f.month) &&
        (f.day == null || d.getDate() === f.day)
      );
  }
  return true;
}

/** 기간 조건과 키워드를 모두 만족하는 일정 */
export function filterRecords(records: ScheduleRecord[], f: RecordFilter, now: Date = new Date()): ScheduleRecord[] {
  const kw = f.keyword.trim().toLowerCase();
  return records.filter((r) => {
    if (!matchesPeriod(r, f, now)) return false;
    if (!kw) return true;
    const hay = `${r.content || ''}\n${r.transcript || ''}\n${(r.appends ?? []).map((a) => a.content || a.transcript).join('\n')}`.toLowerCase();
    return hay.includes(kw);
  });
}
