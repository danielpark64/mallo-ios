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
    expect(formatWeekLabel(new Date(2026, 9, 11))).toBe('2026년 10월 11일 – 17일');
    expect(formatWeekLabel(new Date(2026, 9, 28))).toBe('2026년 10월 25일 – 31일');
    expect(formatWeekLabel(new Date(2026, 10, 1))).toBe('2026년 11월 1일 – 7일');
    expect(formatWeekLabel(new Date(2026, 8, 30))).toBe('2026년 9월 27일 – 10월 3일');
    expect(formatWeekLabel(new Date(2026, 11, 30))).toBe('2026년 12월 27일 – 1월 2일');
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

describe('하루 전 미리 알림 표시 항목', () => {
  const { preAlarmItems, mergePreAlarms, daysWithPreAlarms, groupByDay, dayKey } = require('../dateUtils');
  const now = new Date(2026, 9, 12, 10, 0).getTime();
  const rec = (id: string, at: Date, remind: number[]) => ({
    id, uri: '', durationSec: 0, transcript: '', content: `일정 ${id}`, scheduleAt: at.getTime(), scheduleDisplay: '',
    hasDate: true, hasTime: true, createdAt: 1, remindBefore: remind,
  });
  test('하루 전이 있는 미래 일정만, 전날 20:00에 항목이 생기고 달력 키도 그날', () => {
    const a = rec('a', new Date(2026, 9, 14, 9, 0), [1440, 30]);
    const b = rec('b', new Date(2026, 9, 14, 9, 0), [30]);
    const c = rec('c', new Date(2026, 9, 12, 21, 0), [1440]); // 전날 20:00이 이미 지남
    const items = preAlarmItems([a, b, c], undefined, undefined, now);
    expect(items.map((i: any) => i.id)).toEqual(['a#pre1440']);
    expect(new Date(items[0].fireAt).getHours()).toBe(20);
    expect(Array.from(daysWithPreAlarms([a, b, c], now))).toEqual([dayKey(new Date(2026, 9, 13))]);
  });
  test('섹션에 시각순으로 끼워 넣고, 없는 날은 섹션을 만든다', () => {
    const a = rec('a', new Date(2026, 9, 14, 9, 0), [1440]);
    const d = rec('d', new Date(2026, 9, 13, 18, 0), []);
    const sections = mergePreAlarms(groupByDay([a, d]), preAlarmItems([a, d], undefined, undefined, now));
    expect(sections.map((s: any) => s.key)).toEqual(['2026-10-13', '2026-10-14']);
    expect(sections[0].data.map((x: any) => x.kind ?? x.id)).toEqual(['d', 'pre']);
  });
});

describe('영어 포맷 (언어 설정 en)', () => {
  const { setCurrentLang } = require('../i18n');
  const { formatTime, formatDayHeader, weekdayLabels, WEEKDAYS } = require('../dateUtils');
  beforeAll(() => setCurrentLang('en'));
  afterAll(() => setCurrentLang('ko'));
  test('시각·날짜 머리글·요일', () => {
    expect(formatTime(new Date(2026, 9, 12, 15, 0))).toBe('3:00 PM');
    expect(formatTime(new Date(2026, 9, 12, 0, 5))).toBe('12:05 AM');
    expect(formatDayHeader(new Date(2026, 9, 12))).toBe('Mon, Oct 12');
    expect(weekdayLabels()).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(WEEKDAYS).toEqual(['일', '월', '화', '수', '목', '금', '토']); // 기존 export는 그대로
  });
  test('월·주 라벨, 날짜 미정 섹션', () => {
    expect(formatMonthLabel(2026, 9)).toBe('October 2026');
    expect(formatWeekLabel(new Date(2026, 9, 11))).toBe('Oct 11 – 17, 2026');
    expect(formatWeekLabel(new Date(2026, 9, 28))).toBe('Oct 25 – 31, 2026');
    expect(formatWeekLabel(new Date(2026, 9, 30))).toBe('Oct 25 – 31, 2026');
    expect(formatWeekLabel(new Date(2026, 10, 1))).toBe('Nov 1 – 7, 2026');
    expect(formatWeekLabel(new Date(2026, 8, 30))).toBe('Sep 27 – Oct 3, 2026');
    expect(formatWeekLabel(new Date(2026, 11, 30))).toBe('Dec 27, 2026 – Jan 2, 2027');
    expect(groupByDay([rec('e', null)]).map((s) => s.title)).toEqual(['No date']);
  });
});
