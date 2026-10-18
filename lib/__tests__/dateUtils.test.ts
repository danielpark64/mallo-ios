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

describe('지난 일정 접기', () => {
  const { collapsePast, isPastItem } = require('../dateUtils');
  const now = new Date(2026, 9, 12, 12, 0).getTime();
  const rec = (id: string, at: number, hasTime = true) => ({
    id, uri: '', durationSec: 0, transcript: '', content: id, scheduleAt: at, scheduleDisplay: '', hasDate: true, hasTime, createdAt: 1,
  });
  test('시간 있는 일정은 시각이 지나면, 시간 미정은 날짜가 끝나야 지난 것', () => {
    expect(isPastItem(rec('a', now - 1), now)).toBe(true);
    expect(isPastItem(rec('b', now + 1), now)).toBe(false);
    const todayMidnight = new Date(2026, 9, 12).getTime();
    expect(isPastItem(rec('c', todayMidnight, false), now)).toBe(false);
    expect(isPastItem(rec('d', todayMidnight - 86_400_000, false), now)).toBe(true);
    expect(isPastItem({ ...rec('e', 0), scheduleAt: null }, now)).toBe(false);
  });
  test('지난 항목을 빼고 개수를 세며 빈 섹션은 없앤다', () => {
    const sections = [
      { key: '1', title: '', date: new Date(0), data: [rec('p1', now - 2000), rec('p2', now - 1000)] },
      { key: '2', title: '', date: new Date(0), data: [rec('p3', now - 500), rec('f1', now + 1000)] },
    ];
    const r = collapsePast(sections, now);
    expect(r.pastCount).toBe(3);
    expect(r.hiddenCount).toBe(3);
    expect(r.sections.map((s: any) => s.data.map((x: any) => x.id))).toEqual([['f1']]);
  });
  test('showPast만큼은 가장 최근의 지난 항목부터 남긴다 (수천 건을 한 번에 펼치지 않음)', () => {
    const sections = [
      { key: '1', title: '', date: new Date(0), data: [rec('p1', now - 3000), rec('p2', now - 2000)] },
      { key: '2', title: '', date: new Date(0), data: [rec('p3', now - 1000), rec('f1', now + 1000)] },
    ];
    const r = collapsePast(sections, now, 2);
    expect([r.pastCount, r.hiddenCount]).toEqual([3, 1]);
    expect(r.sections.map((s: any) => s.data.map((x: any) => x.id))).toEqual([['p2'], ['p3', 'f1']]);
    expect(collapsePast(sections, now, 99).hiddenCount).toBe(0);
  });
});

describe('날짜를 안 정한 녹음(녹음 시각으로 저장)', () => {
  const { isPastItem } = require('../dateUtils');
  const rec = (at: Date) => ({ id: 'x', uri: '', durationSec: 0, transcript: '', content: '회의', scheduleAt: at.getTime(), scheduleDisplay: '', hasDate: true, hasTime: true, needsDate: true, createdAt: 1 });
  test('녹음 시각이 지나도 그날 하루 동안은 지난 일정으로 접지 않는다', () => {
    const now = new Date(2026, 9, 14, 23, 50).getTime();
    expect(isPastItem(rec(new Date(2026, 9, 14, 15, 12)), now)).toBe(false);
  });
  test('다음 날부터는 지난 일정으로 접는다', () => {
    const now = new Date(2026, 9, 15, 0, 1).getTime();
    expect(isPastItem(rec(new Date(2026, 9, 14, 15, 12)), now)).toBe(true);
  });
  test('날짜를 정한 일정은 그 시각이 지나면 바로 지난 일정', () => {
    const now = new Date(2026, 9, 14, 15, 13).getTime();
    expect(isPastItem({ ...rec(new Date(2026, 9, 14, 15, 12)), needsDate: false }, now)).toBe(true);
  });
});

describe('몇째 주(주 보기 머리)', () => {
  const { formatWeekOfMonth, weekOfMonth } = require('../dateUtils');
  const { setCurrentLang } = require('../i18n/lang');
  afterEach(() => setCurrentLang('ko'));
  test('달력 줄 순서대로 세고, 두 달에 걸친 주는 양쪽 달 모두', () => {
    expect(weekOfMonth(new Date(2026, 8, 27))).toEqual([{ month: 8, n: 5 }, { month: 9, n: 1 }]); // 9/27~10/3
    expect(weekOfMonth(new Date(2026, 9, 4))).toEqual([{ month: 9, n: 2 }]);  // 10/4~10
    expect(weekOfMonth(new Date(2026, 9, 14))).toEqual([{ month: 9, n: 3 }]); // 10/11~17 (주 중간 날짜)
    expect(weekOfMonth(new Date(2026, 11, 27))).toEqual([{ month: 11, n: 5 }, { month: 0, n: 1 }]); // 12/27~1/2
  });
  test('언어별 표기', () => {
    setCurrentLang('ko'); expect(formatWeekOfMonth(new Date(2026, 8, 27))).toBe('9월 다섯째 주 · 10월 첫째 주');
    setCurrentLang('ko'); expect(formatWeekOfMonth(new Date(2026, 9, 11))).toBe('10월 셋째 주');
    setCurrentLang('en'); expect(formatWeekOfMonth(new Date(2026, 9, 11))).toBe('Week 3 of October');
    setCurrentLang('ja'); expect(formatWeekOfMonth(new Date(2026, 9, 11))).toBe('10月第3週');
    setCurrentLang('fr'); expect(formatWeekOfMonth(new Date(2026, 9, 4))).toBe('2e semaine d’octobre');
    setCurrentLang('de'); expect(formatWeekOfMonth(new Date(2026, 9, 11))).toBe('3. Woche im Oktober');
  });
  test('여섯째 줄까지 나오는 달(1일이 토요일인 31일 달)', () => {
    setCurrentLang('ko');
    expect(formatWeekOfMonth(new Date(2026, 7, 30))).toBe('8월 여섯째 주 · 9월 첫째 주'); // 2026-08-01은 토요일
  });
});

// "다음 · …"을 누르면 그 일정 카드로 바로 간다 — 목록에서 위치 찾기
import { findItemLocation } from '../dateUtils';
describe('findItemLocation', () => {
  const r = (id: string) => ({ id } as any);
  const sections = [
    { key: 'a', title: '', date: new Date(2026, 9, 15), data: [r('1'), r('2')] },
    { key: 'b', title: '', date: new Date(2026, 10, 4), data: [{ kind: 'pre', id: 'p' } as any, r('3')] },
  ];
  test('묶음 번호와 그 안의 순서를 돌려준다', () => {
    expect(findItemLocation(sections, '2')).toEqual({ sectionIndex: 0, itemIndex: 1 });
    expect(findItemLocation(sections, '3')).toEqual({ sectionIndex: 1, itemIndex: 1 });
  });
  test('없으면 null', () => {
    expect(findItemLocation(sections, 'x')).toBeNull();
  });
});

// ── 일정 탭(D안): 날짜 감각("모레·2주 뒤")과 빈 날 줄 ──
import { relativeDayLabel, emptyGapBetween, formatEmptyGap } from '../dateUtils';
describe('relativeDayLabel', () => {
  const now = new Date(2026, 9, 18, 14, 30); // 10월 18일(일) 오후
  const at = (m: number, d: number, h = 9) => new Date(2026, m - 1, d, h);
  test('오늘·내일·모레·어제', () => {
    expect(relativeDayLabel(at(10, 18, 23), now)).toBe('오늘');
    expect(relativeDayLabel(at(10, 19), now)).toBe('내일');
    expect(relativeDayLabel(at(10, 20), now)).toBe('모레');
    expect(relativeDayLabel(at(10, 17), now)).toBe('어제');
  });
  test('3~13일은 N일 뒤, 2주부터 N주 뒤, 두 달부터 N개월 뒤', () => {
    expect(relativeDayLabel(at(10, 21), now)).toBe('3일 뒤');
    expect(relativeDayLabel(at(10, 31), now)).toBe('13일 뒤');
    expect(relativeDayLabel(at(11, 1), now)).toBe('2주 뒤');
    expect(relativeDayLabel(at(11, 14), now)).toBe('3주 뒤');
    expect(relativeDayLabel(new Date(2027, 0, 5), now)).toBe('2개월 뒤');
  });
  test('그저께 이전은 표시하지 않는다(지난 일정은 날짜만)', () => {
    expect(relativeDayLabel(at(10, 16), now)).toBeNull();
  });
});

describe('빈 날 줄', () => {
  const today = new Date(2026, 9, 18);
  const d = (m: number, day: number) => new Date(2026, m - 1, day);
  test('하루가 비면 그 날 하나, 여러 날이면 범위와 일수', () => {
    expect(emptyGapBetween(d(10, 18), d(10, 20), today)).toEqual({ from: d(10, 19), to: d(10, 19), days: 1 });
    expect(emptyGapBetween(d(10, 21), d(10, 28), today)).toEqual({ from: d(10, 22), to: d(10, 27), days: 6 });
  });
  test('붙어 있는 날·지난 구간은 줄이 없다', () => {
    expect(emptyGapBetween(d(10, 20), d(10, 21), today)).toBeNull();
    expect(emptyGapBetween(d(10, 1), d(10, 10), today)).toBeNull();
  });
  test('지난 날과 미래 사이는 오늘부터 센다', () => {
    expect(emptyGapBetween(d(10, 10), d(10, 21), today)).toEqual({ from: d(10, 18), to: d(10, 20), days: 3 });
  });
  test('문구', () => {
    expect(formatEmptyGap({ from: d(10, 19), to: d(10, 19), days: 1 })).toBe('10월 19일 비어 있음');
    expect(formatEmptyGap({ from: d(10, 22), to: d(10, 27), days: 6 })).toBe('10월 22일 ~ 10월 27일 · 6일 비어 있음');
  });
});

// ── 기간 일정: 달력 점·빈 날 계산이 끝나는 날까지 덮는다 ──
import { coveredDayKeys, formatRangeTail, daysWithSchedules, coverEnd } from '../dateUtils';
describe('기간 일정 표시', () => {
  const rec = (start: Date, end?: Date) => ({
    id: 'v', uri: '', durationSec: 0, transcript: '', content: '휴가', scheduleAt: start.getTime(), scheduleDisplay: '',
    hasDate: true, hasTime: false, createdAt: 1, ...(end ? { endAt: end.getTime() } : {}),
  }) as any;
  test('덮는 날 전부 (달을 넘어가도)', () => {
    expect(coveredDayKeys(rec(new Date(2026, 9, 30), new Date(2026, 10, 2)))).toEqual(['2026-10-30', '2026-10-31', '2026-11-1', '2026-11-2']);
    expect(coveredDayKeys(rec(new Date(2026, 9, 30)))).toEqual(['2026-10-30']);
  });
  test('달력 점도 기간 전체에', () => {
    const s = daysWithSchedules([rec(new Date(2026, 9, 20), new Date(2026, 9, 22))]);
    expect([...s].sort()).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
  });
  test('카드 꼬리 문구 "~ 10월 24일 (토) · 5일"', () => {
    expect(formatRangeTail(rec(new Date(2026, 9, 20), new Date(2026, 9, 24)))).toBe('~ 10월 24일 (토) · 5일');
    expect(formatRangeTail(rec(new Date(2026, 9, 20)))).toBeNull();
  });
  test('coverEnd: 기간이면 끝나는 날, 아니면 그날', () => {
    expect(coverEnd(rec(new Date(2026, 9, 20, 9), new Date(2026, 9, 24))).getDate()).toBe(24);
    expect(coverEnd(rec(new Date(2026, 9, 20, 9))).getDate()).toBe(20);
  });
});

// ── 휴가 중인 날에 일정을 넣으려 하면 먼저 알린다(그래도 넣을 수 있음) ──
import { rangesCovering, itemsWithinRange } from '../dateUtils';
describe('기간 겹침 확인', () => {
  const r = (id: string, start: Date, end?: Date) => ({
    id, uri: '', durationSec: 0, transcript: '', content: id, scheduleAt: start.getTime(), scheduleDisplay: '',
    hasDate: true, hasTime: !end, createdAt: 1, ...(end ? { endAt: end.getTime() } : {}),
  }) as any;
  const vac = r('휴가', new Date(2026, 9, 22), new Date(2026, 9, 26));
  const dentist = r('치과', new Date(2026, 9, 24, 15));
  const later = r('회의', new Date(2026, 9, 27, 10));
  test('그 날을 덮는 기간 일정을 찾는다(시작일·끝나는 날 포함, 자기 자신 제외)', () => {
    expect(rangesCovering([vac, dentist], new Date(2026, 9, 24, 15)).map((x) => x.id)).toEqual(['휴가']);
    expect(rangesCovering([vac], new Date(2026, 9, 22, 9)).length).toBe(1);
    expect(rangesCovering([vac], new Date(2026, 9, 26, 23)).length).toBe(1);
    expect(rangesCovering([vac], new Date(2026, 9, 27, 9)).length).toBe(0);
    expect(rangesCovering([vac], new Date(2026, 9, 24), '휴가').length).toBe(0);
  });
  test('새 기간 안에 이미 있는 하루짜리 일정', () => {
    expect(itemsWithinRange([vac, dentist, later], new Date(2026, 9, 22), new Date(2026, 9, 26)).map((x) => x.id)).toEqual(['치과']);
    expect(itemsWithinRange([dentist], new Date(2026, 9, 22), new Date(2026, 9, 26), '치과')).toEqual([]);
  });
});

// ── 기간 일정은 끝나는 날이 지나야 "지난 일정", 달력 목록은 겹치는 기간에 나온다 ──
import { isPastItem, schedulesOn } from '../dateUtils';
describe('진행 중인 기간 일정', () => {
  const vac = { id: 'v', uri: '', durationSec: 0, transcript: '', content: '휴가', scheduleAt: new Date(2026, 9, 20).getTime(),
    endAt: new Date(2026, 9, 24).getTime(), scheduleDisplay: '', hasDate: true, hasTime: false, createdAt: 1 } as any;
  test('휴가 중(22일)엔 지난 일정이 아니고, 끝난 다음 날(25일)부터 지난 일정', () => {
    expect(isPastItem(vac, new Date(2026, 9, 22, 12).getTime())).toBe(false);
    expect(isPastItem(vac, new Date(2026, 9, 24, 23).getTime())).toBe(false);
    expect(isPastItem(vac, new Date(2026, 9, 25, 0, 1).getTime())).toBe(true);
  });
  test('달을 넘는 휴가는 다음 달 목록·중간 날에도 나온다', () => {
    const cross = { ...vac, scheduleAt: new Date(2026, 9, 30).getTime(), endAt: new Date(2026, 10, 2).getTime() };
    expect(schedulesBetween([cross], new Date(2026, 10, 1), new Date(2026, 10, 30)).length).toBe(1);
    expect(schedulesOn([vac], new Date(2026, 9, 22)).length).toBe(1);
    expect(schedulesOn([vac], new Date(2026, 9, 25)).length).toBe(0);
  });
});
