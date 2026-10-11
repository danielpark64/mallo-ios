// 주/월 범위 계산, 기간 내 일정 추출, 날짜별 묶기, 라벨 포맷
import {
  addDays,
  endOfMonth,
  endOfWeek,
  formatMonthLabel,
  formatWeekLabel,
  groupByDay,
  schedulesBetween,
  startOfMonth,
  startOfWeek,
} from '../dateUtils';
import type { ScheduleRecord } from '../storage';

const rec = (id: string, at: Date | null): ScheduleRecord => ({
  id, uri: '', durationSec: 0, transcript: '', content: `일정 ${id}`,
  scheduleAt: at ? at.getTime() : null, scheduleDisplay: '', hasDate: at != null, hasTime: true, createdAt: 1,
});

describe('주/월 범위', () => {
  test('startOfWeek는 일요일 자정, endOfWeek는 토요일', () => {
    const wed = new Date(2026, 9, 14, 15, 30); // 2026-10-14 수
    expect(startOfWeek(wed).toDateString()).toBe(new Date(2026, 9, 11).toDateString());
    expect(startOfWeek(wed).getHours()).toBe(0);
    expect(endOfWeek(wed).toDateString()).toBe(new Date(2026, 9, 17).toDateString());
    // 일요일은 그대로 그 주의 시작
    expect(startOfWeek(new Date(2026, 9, 11)).getDate()).toBe(11);
  });
  test('addDays는 달을 넘어가도 자정 기준으로 계산', () => {
    expect(addDays(new Date(2026, 9, 30, 23), 2).toDateString()).toBe(new Date(2026, 10, 1).toDateString());
    expect(addDays(new Date(2026, 9, 1), -1).toDateString()).toBe(new Date(2026, 8, 30).toDateString());
  });
  test('startOfMonth / endOfMonth', () => {
    expect(startOfMonth(new Date(2026, 1, 20)).getDate()).toBe(1);
    expect(endOfMonth(new Date(2026, 1, 20)).getDate()).toBe(28);
    expect(endOfMonth(new Date(2028, 1, 1)).getDate()).toBe(29);
  });
});

describe('라벨', () => {
  test('월 라벨', () => {
    expect(formatMonthLabel(2026, 9)).toBe('2026년 10월');
  });
  test('주 라벨 — 같은 달이면 일만, 달이 바뀌면 양쪽 달 표기', () => {
    expect(formatWeekLabel(new Date(2026, 9, 11))).toBe('10월 11일 – 17일');
    expect(formatWeekLabel(new Date(2026, 9, 28))).toBe('10월 25일 – 31일');
    expect(formatWeekLabel(new Date(2026, 10, 1))).toBe('11월 1일 – 7일');
    expect(formatWeekLabel(new Date(2026, 8, 30))).toBe('9월 27일 – 10월 3일');
  });
});

describe('schedulesBetween / groupByDay', () => {
  const records = [
    rec('a', new Date(2026, 9, 10, 15)),
    rec('b', new Date(2026, 9, 17, 19)),
    rec('c', new Date(2026, 9, 17, 9)),
    rec('d', new Date(2026, 10, 1, 0, 0)),
    rec('e', null),
  ];
  test('양 끝 날짜를 포함해 기간 안의 일정만 시각순으로', () => {
    const got = schedulesBetween(records, new Date(2026, 9, 11), new Date(2026, 9, 17));
    expect(got.map((r) => r.id)).toEqual(['c', 'b']);
    const month = schedulesBetween(records, new Date(2026, 9, 1), new Date(2026, 9, 31));
    expect(month.map((r) => r.id)).toEqual(['a', 'c', 'b']);
    // 끝 날짜 자정 다음날 00:00은 제외
    expect(schedulesBetween(records, new Date(2026, 9, 31), new Date(2026, 9, 31))).toHaveLength(0);
    expect(schedulesBetween(records, new Date(2026, 10, 1), new Date(2026, 10, 1)).map((r) => r.id)).toEqual(['d']);
  });
  test('날짜별로 묶고 날짜 미정은 맨 뒤', () => {
    const sections = groupByDay(records);
    expect(sections.map((s) => s.title)).toEqual(['10월 10일 (토)', '10월 17일 (토)', '11월 1일 (일)', '날짜 미정']);
    expect(sections[1].data.map((r) => r.id)).toEqual(['c', 'b']);
    expect(sections[1].key).toBe('2026-10-17');
    expect(sections[3].data.map((r) => r.id)).toEqual(['e']);
  });
});
