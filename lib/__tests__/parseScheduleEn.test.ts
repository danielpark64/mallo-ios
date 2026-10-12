// 영어 자연어 → 일정 파서 회귀 테스트. 기준 시각 고정: 2026-06-06(토) 17:00
import { parseSchedule, formatDisplay, hasDateTime } from '../parseSchedule';
import { parseScheduleEn, extractRemindBeforeEn } from '../parseScheduleEn';
import { setCurrentLang } from '../i18n';

const base = new Date(2026, 5, 6, 17, 0, 0);

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ` +
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

type Expect = { at: string | null; hasTime?: boolean; content?: string; remind?: number[]; display?: string };

beforeAll(() => setCurrentLang('en'));
afterAll(() => setCurrentLang('ko'));

const cases: Array<[string, Expect]> = [
  // ── 기본 날짜 + 시간 ──
  ['tomorrow at 3pm team meeting',            { at: '2026-06-07 15:00', hasTime: true, content: 'team meeting', display: 'Sun, Jun 7 · 3:00 PM' }],
  ['team meeting tomorrow at 3 pm',           { at: '2026-06-07 15:00', hasTime: true, content: 'team meeting' }],
  ['dentist today at 7:30pm',                 { at: '2026-06-06 19:30', hasTime: true, content: 'dentist' }],
  ['day after tomorrow at 10am dentist appointment', { at: '2026-06-08 10:00', hasTime: true, content: 'dentist appointment' }],
  ['the day after tomorrow lunch',            { at: '2026-06-08 00:00', hasTime: false, content: 'lunch', display: 'Mon, Jun 8' }],
  ['tonight at 8 dinner with Sam',            { at: '2026-06-06 20:00', hasTime: true, content: 'dinner with Sam' }],
  ['tonight movie',                           { at: '2026-06-06 00:00', hasTime: false, content: 'movie' }],
  ['this morning at 9 standup',               { at: '2026-06-06 09:00', hasTime: true, content: 'standup' }],
  ['tomorrow morning at 9 standup',           { at: '2026-06-07 09:00', hasTime: true, content: 'standup' }],
  ['tomorrow evening at 6 gym',               { at: '2026-06-07 18:00', hasTime: true, content: 'gym' }],
  ['call mom tomorrow',                       { at: '2026-06-07 00:00', hasTime: false, content: 'call mom' }],
  // ── 상대 표현 ──
  ['in 30 minutes take medicine',             { at: '2026-06-06 17:30', hasTime: true, content: 'take medicine' }],
  ['in 2 hours pick up the package',          { at: '2026-06-06 19:00', hasTime: true, content: 'pick up the package' }],
  ['in an hour call back',                    { at: '2026-06-06 18:00', hasTime: true, content: 'call back' }],
  ['in 3 days meeting',                       { at: '2026-06-09 00:00', hasTime: false, content: 'meeting' }],
  ['in a week review',                        { at: '2026-06-13 00:00', hasTime: false, content: 'review' }],
  // ── 요일 ──
  ['next Monday lunch appointment',           { at: '2026-06-08 00:00', hasTime: false, content: 'lunch appointment' }],
  ['this Friday at 2pm presentation',         { at: '2026-06-12 14:00', hasTime: true, content: 'presentation' }],
  ['on Friday evening movie',                 { at: '2026-06-12 00:00', hasTime: false, content: 'movie' }],
  ['Wednesday next week at 2:30pm presentation', { at: '2026-06-10 14:30', hasTime: true, content: 'presentation' }], // 다음 달력 주(일~토)의 수요일 — 한국어 "다음주 수요일"과 동일
  ['next Saturday hiking',                    { at: '2026-06-13 00:00', hasTime: false, content: 'hiking' }], // 오늘이 토요일 → 다음 주
  ['Monday at ten in the morning work',       { at: '2026-06-08 10:00', hasTime: true, content: 'work' }],
  // ── 절대 날짜 ──
  ["Oct 15 at 3pm doctor's appointment",      { at: '2026-10-15 15:00', hasTime: true, content: "doctor's appointment", display: 'Thu, Oct 15 · 3:00 PM' }],
  ['October 15th mom birthday',               { at: '2026-10-15 00:00', hasTime: false, content: 'mom birthday', display: 'Thu, Oct 15' }],
  ['on 10/15 dentist',                        { at: '2026-10-15 00:00', hasTime: false, content: 'dentist' }],
  ['on the 15th at 2pm meeting',              { at: '2026-06-15 14:00', hasTime: true, content: 'meeting' }],
  ['the 3rd pay rent',                        { at: '2026-07-03 00:00', hasTime: false, content: 'pay rent' }], // 이미 지난 날짜 → 다음 달
  ['December 25 at 6pm party',                { at: '2026-12-25 18:00', hasTime: true, content: 'party' }],
  ['Feb 29 meeting',                          { at: '2028-02-29 00:00', hasTime: false }], // 2027은 평년 → 2028
  ['Jan 5 check-in',                          { at: '2027-01-05 00:00', hasTime: false, content: 'check-in' }], // 지난 날짜 → 다음 해
  // ── 시간 표기 ──
  ['meeting at 15:00',                        { at: '2026-06-07 15:00', hasTime: true, content: 'meeting' }], // 17:00 기준 지난 시각 → 다음 날
  ['coffee at three',                         { at: '2026-06-07 15:00', hasTime: true, content: 'coffee' }],
  ['coffee at three thirty',                  { at: '2026-06-07 15:30', hasTime: true, content: 'coffee' }],
  ['half past three coffee',                  { at: '2026-06-07 15:30', hasTime: true, content: 'coffee' }],
  ['quarter to five tea',                     { at: '2026-06-07 16:45', hasTime: true, content: 'tea' }],
  ['noon meeting',                            { at: '2026-06-07 12:00', hasTime: true, content: 'meeting' }],
  ['alarm at midnight',                       { at: '2026-06-07 00:00', hasTime: true, content: 'alarm' }],
  ['at 3 in the afternoon meeting',           { at: '2026-06-07 15:00', hasTime: true, content: 'meeting' }],
  ["9 o'clock tomorrow breakfast",            { at: '2026-06-07 09:00', hasTime: true, content: 'breakfast' }],
  ['tomorrow at 9 at night call',             { at: '2026-06-07 21:00', hasTime: true, content: 'call' }],
  ['tomorrow at 12 at night deadline',        { at: '2026-06-08 00:00', hasTime: true, content: 'deadline' }],
  ['12 pm lunch',                             { at: '2026-06-07 12:00', hasTime: true, content: 'lunch' }],
  ['12 am alarm',                             { at: '2026-06-07 00:00', hasTime: true, content: 'alarm' }],
  ['at 8 workout',                            { at: '2026-06-07 08:00', hasTime: true, content: 'workout' }], // 오후 보정은 1~7시만 → 08:00, 이미 지남 → 다음 날
  // ── 날짜·시간 없음 / 숫자 오인식 방지 ──
  ['organize meeting notes',                  { at: null, content: 'organize meeting notes' }],
  ['buy 3 apples',                            { at: null, content: 'buy 3 apples' }],
  ['dinner in the evening',                   { at: null, content: 'dinner in the evening' }], // 날짜·시간 없으면 내용 그대로(한국어 "점심에 약속"과 동일)
  // ── 미리 알림 ──
  ['tomorrow at 3pm dentist remind me 30 minutes before', { at: '2026-06-07 15:00', content: 'dentist', remind: [30] }],
  ['dentist tomorrow at 3pm, 15 min before',  { at: '2026-06-07 15:00', content: 'dentist', remind: [10] }],
  ['remind me an hour before the flight Oct 15 at 7am', { at: '2026-10-15 07:00', content: 'the flight', remind: [60] }],
  ['mom birthday Oct 20 remind me the night before', { at: '2026-10-20 00:00', content: 'mom birthday', remind: [1440] }],
  ['Oct 20 party a day before',               { at: '2026-10-20 00:00', content: 'party', remind: [1440] }],
  ['remind me to call mom tomorrow at 5',     { at: '2026-06-07 17:00', content: 'call mom' }],
  ['meeting tomorrow at 3pm 50 minutes before and a day before', { at: '2026-06-07 15:00', remind: [60, 1440] }],
];

describe('parseScheduleEn (via parseSchedule, lang=en)', () => {
  test.each(cases)('%s', (input, exp) => {
    const r = parseSchedule(input, base);
    expect(r.date ? fmt(r.date) : null).toBe(exp.at);
    if (exp.hasTime !== undefined) expect(r.hasTime).toBe(exp.hasTime);
    if (exp.content !== undefined) expect(r.content).toBe(exp.content);
    if (exp.remind !== undefined) expect(r.remindBefore).toEqual(exp.remind);
    else expect(r.remindBefore).toBeUndefined();
    if (exp.display !== undefined) expect(r.display).toBe(exp.display);
  });

  test('parseScheduleEn 직접 호출도 같은 결과', () => {
    expect(parseScheduleEn('tomorrow at 3pm team meeting', base)).toEqual(parseSchedule('tomorrow at 3pm team meeting', base));
  });

  test('formatDisplay 영어 형식', () => {
    const d = new Date(2026, 9, 15, 15, 0);
    expect(formatDisplay(d, true, true)).toBe('Thu, Oct 15 · 3:00 PM');
    expect(formatDisplay(d, true, false)).toBe('Thu, Oct 15');
    expect(formatDisplay(new Date(2026, 9, 15, 9, 5), true, true)).toBe('Thu, Oct 15 · 9:05 AM');
    expect(formatDisplay(new Date(2026, 9, 15, 0, 0), true, true)).toBe('Thu, Oct 15 · 12:00 AM');
  });

  test('hasDateTime 영어', () => {
    expect(hasDateTime('lunch tomorrow')).toBe(true);
    expect(hasDateTime('meeting at 3pm')).toBe(true);
    expect(hasDateTime('buy milk')).toBe(false);
  });

  test('extractRemindBeforeEn: 분은 가까운 옵션으로', () => {
    expect(extractRemindBeforeEn('x 10 minutes before').remindBefore).toEqual([10]);
    expect(extractRemindBeforeEn('x 20 minutes before').remindBefore).toEqual([30]);
    expect(extractRemindBeforeEn('x 45 min before').remindBefore).toEqual([30]);
    expect(extractRemindBeforeEn('x half an hour before').remindBefore).toEqual([30]);
    expect(extractRemindBeforeEn('x two hours before').remindBefore).toEqual([60]);
    expect(extractRemindBeforeEn('x the day before').remindBefore).toEqual([1440]);
    const r = extractRemindBeforeEn('dentist, remind me 30 minutes before');
    expect(r.text).toBe('dentist,');
    expect(extractRemindBeforeEn('arrive 30 minutes early').remindBefore).toBeNull();
  });
});

describe('한국어 모드로 복원 시 한국어 파서 그대로', () => {
  test('setCurrentLang(ko) 후 한국어 표기', () => {
    setCurrentLang('ko');
    const r = parseSchedule('내일 오후 3시에 팀 회의', base);
    expect(r.display).toBe('6월 7일 (일) 오후 3:00');
    setCurrentLang('en');
  });
});
